import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  isUpdateMetadata,
  mergeMetadata,
  readMetadata,
  serializeMetadata,
  sha512,
  verifyMetadataAssets,
  type UpdateMetadata,
} from "./desktop/update-metadata";

/**
 * 将独立下载的各架构产物整理到空目录，并显式合并同名更新元数据。
 * @param inputDirectory - actions/download-artifact 保留子目录的下载位置
 * @param outputDirectory - 整理后的发布目录，须为空且独立于输入目录
 * @returns 发布文件数量
 */
export async function mergeReleaseArtifacts(
  inputDirectory: string,
  outputDirectory: string
): Promise<number> {
  const input = resolve(inputDirectory);
  const output = resolve(outputDirectory);
  const outputRelative = relative(input, output);
  if (
    outputRelative === "" ||
    (!isAbsolute(outputRelative) &&
      outputRelative !== ".." &&
      !outputRelative.startsWith(`..${sep}`))
  ) {
    throw new Error("发布输出目录须位于下载目录之外");
  }
  const groups = readdirSync(input, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (groups.length === 0)
    throw new Error("缺少分架构下载目录；download-artifact 请保留 merge-multiple: false");
  const assets = new Map<string, string>();
  const metadata = new Map<string, UpdateMetadata[]>();
  for (const group of groups.sort((a, b) => a.name.localeCompare(b.name))) {
    const directory = join(input, group.name);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith("builder-")) continue;
      const file = join(directory, entry.name);
      if (isUpdateMetadata(entry.name)) {
        const info = readMetadata(file);
        await verifyMetadataAssets(info, directory);
        const existing = metadata.get(entry.name) ?? [];
        existing.push(info);
        metadata.set(entry.name, existing);
      } else if (
        /\.(exe|msi|dmg|zip|AppImage|deb|rpm|snap|tar\.gz|blockmap|apk)$/.test(entry.name)
      ) {
        const previous = assets.get(entry.name);
        if (previous && (await sha512(previous)) !== (await sha512(file))) {
          throw new Error(`发行文件同名冲突：${entry.name}`);
        }
        assets.set(entry.name, file);
      }
    }
  }
  if (assets.size === 0 || metadata.size === 0) throw new Error("缺少桌面发行产物或更新元数据");
  const merged = [...metadata].map(([name, infos]) => ({ name, info: mergeMetadata(infos) }));
  mkdirSync(output, { recursive: true });
  if (readdirSync(output).length !== 0) throw new Error(`发布输出目录须为空：${output}`);
  for (const [name, file] of assets) copyFileSync(file, join(output, basename(name)));
  for (const { name, info } of merged) writeFileSync(join(output, name), serializeMetadata(info));
  console.log(`[merge-update-metadata] ${assets.size} 个发行文件，${merged.length} 个更新元数据`);
  return assets.size + merged.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await mergeReleaseArtifacts(
    process.argv[2] ?? "release-downloads",
    process.argv[3] ?? "release-assets"
  );
}
