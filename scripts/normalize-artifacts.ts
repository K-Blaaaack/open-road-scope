import { existsSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  isUpdateMetadata,
  normalizeArtifactName,
  readMetadata,
  serializeMetadata,
} from "./desktop/update-metadata";

/**
 * 同步重命名发行文件及元数据引用，提前检查同名冲突。
 * @param directory - electron-builder 输出目录
 * @returns 重命名完成后正常返回
 */
export function normalizeArtifacts(directory: string): void {
  const root = resolve(directory);
  const entries = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile());
  const renames = entries
    .map((entry) => ({
      source: join(root, entry.name),
      target: join(root, normalizeArtifactName(entry.name)),
    }))
    .filter((entry) => entry.source !== entry.target);
  for (const entry of renames) {
    if (existsSync(entry.target)) throw new Error(`重命名目标已存在：${entry.target}`);
  }
  const metadata = entries
    .filter((entry) => isUpdateMetadata(entry.name))
    .map((entry) => {
      const info = readMetadata(join(root, entry.name));
      info.files = info.files.map((file) => ({ ...file, url: normalizeArtifactName(file.url) }));
      if (info.path) info.path = normalizeArtifactName(info.path);
      return { target: join(root, normalizeArtifactName(entry.name)), info };
    });
  for (const entry of renames) {
    // 路径来自已解析的输出目录和目录项；仅在预检确认目标尚未存在后移动。
    console.log(`[normalize-artifacts] ${entry.source} -> ${entry.target}`);
    renameSync(entry.source, entry.target);
  }
  for (const entry of metadata) writeFileSync(entry.target, serializeMetadata(entry.info));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  normalizeArtifacts(process.argv[2] ?? "dist");
}
