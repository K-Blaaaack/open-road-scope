import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { dump, load } from "js-yaml";
import { z } from "zod";

const fileSchema = z
  .object({
    url: z.string().min(1),
    sha512: z.string().min(1),
    size: z.number().nonnegative().optional(),
  })
  .passthrough();
const metadataSchema = z
  .object({
    version: z.string().min(1),
    files: z.array(fileSchema).min(1),
    path: z.string().optional(),
    sha512: z.string().optional(),
    releaseDate: z.string().optional(),
  })
  .passthrough();
export type UpdateMetadata = z.infer<typeof metadataSchema>;

/**
 * 识别 channel 元数据，排除 electron-builder 调试配置。
 * @param name - 文件名
 * @returns 是否为更新元数据
 */
export function isUpdateMetadata(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.yml$/.test(name) && !name.startsWith("builder-");
}

/**
 * 将 x64 对外名称统一为 x86_64。
 * @param name - 产物文件名
 * @returns 统一后的文件名
 */
export function normalizeArtifactName(name: string): string {
  // deb 目标按 Debian 架构名生成文件名，统一成对外的 x86_64；包内 control 字段不受影响
  return name.replace(/-x64(?=[.-])/g, "-x86_64").replace(/-amd64(?=[.-])/g, "-x86_64");
}

/**
 * 决定更新元数据的默认入口优先级：electron-updater 能直接安装的格式排在前面。
 * @param url - 发行文件名
 * @returns 排序权重，越小越优先
 */
export function defaultEntryRank(url: string): number {
  if (url.endsWith(".zip")) return 0;
  if (url.endsWith(".AppImage")) return 1;
  if (url.endsWith(".exe") || url.endsWith(".msi")) return 2;
  if (url.endsWith(".dmg")) return 3;
  if (url.endsWith(".deb")) return 4;
  if (url.endsWith(".rpm")) return 5;
  return 6;
}

/**
 * 读取并校验 electron-updater 元数据。
 * @param file - YAML 文件路径
 * @returns 更新元数据
 */
export function readMetadata(file: string): UpdateMetadata {
  return metadataSchema.parse(load(readFileSync(file, "utf8")));
}

/**
 * 按 YAML 格式输出元数据。
 * @param info - 更新元数据
 * @returns YAML 文本
 */
export function serializeMetadata(info: UpdateMetadata): string {
  return dump(info, { lineWidth: -1, noRefs: true });
}

/**
 * 校验元数据只引用发布目录中的普通文件。
 * @param name - 元数据中的文件名
 * @returns 已校验的文件名
 */
export function assetName(name: string): string {
  if (name !== basename(name) || /[\\/:?#\0]/.test(name) || name === "." || name === "..") {
    throw new Error(`元数据必须引用发布目录内的文件：${name}`);
  }
  return name;
}

/**
 * 以流方式计算产物摘要，避免多个大型安装包同时驻留内存。
 * @param file - 产物路径
 * @returns SHA-512 的 Base64 文本
 */
export async function sha512(file: string): Promise<string> {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("base64");
}

/**
 * 合并前核对元数据所引用的产物大小和摘要。
 * @param info - 更新元数据
 * @param directory - 该架构的下载产物目录
 * @returns 所有引用校验通过后正常返回
 */
export async function verifyMetadataAssets(info: UpdateMetadata, directory: string): Promise<void> {
  for (const file of info.files) {
    const path = join(directory, assetName(file.url));
    const stat = statSync(path);
    if (!stat.isFile() || (file.size !== undefined && stat.size !== file.size)) {
      throw new Error(`更新产物大小不匹配：${path}`);
    }
    if ((await sha512(path)) !== file.sha512) throw new Error(`更新产物 SHA-512 不匹配：${path}`);
  }
  if (info.path !== undefined) {
    const legacy = info.files.find((file) => file.url === info.path);
    if (!legacy || legacy.sha512 !== info.sha512)
      throw new Error("旧版 path/sha512 与 files 不一致");
  }
}

/**
 * 合并同一 channel 的架构条目，同时保留旧版 updater 的 x64 默认入口。
 * @param inputs - 各构建任务的元数据
 * @returns 去重、排序后的统一元数据
 */
export function mergeMetadata(inputs: UpdateMetadata[]): UpdateMetadata {
  if (inputs.length === 0) throw new Error("缺少待合并的更新元数据");
  const result = { ...inputs[0] };
  const files = new Map<string, UpdateMetadata["files"][number]>();
  const variableKeys = new Set(["files", "path", "sha512", "sha2", "releaseDate"]);
  for (const info of inputs) {
    for (const key of new Set([...Object.keys(result), ...Object.keys(info)])) {
      if (!variableKeys.has(key) && !isDeepStrictEqual(result[key], info[key])) {
        throw new Error(`更新元数据字段冲突：${key}`);
      }
    }
    for (const file of info.files) {
      assetName(file.url);
      const previous = files.get(file.url);
      if (previous && !isDeepStrictEqual(previous, file))
        throw new Error(`同名更新文件冲突：${file.url}`);
      files.set(file.url, file);
    }
  }
  // updater 6.8.9 对 arm64 精确选包；x86_64 不含 process.arch=x64，需保证回退首项为 x64。
  result.files = [...files.values()].sort((left, right) => {
    const rank = defaultEntryRank(left.url) - defaultEntryRank(right.url);
    const arch = Number(left.url.includes("-arm64")) - Number(right.url.includes("-arm64"));
    return rank || arch || left.url.localeCompare(right.url);
  });
  result.path = result.files[0].url;
  result.sha512 = result.files[0].sha512;
  delete result.sha2;
  const dates = inputs.map((info) => info.releaseDate).filter((date): date is string => !!date);
  if (dates.length) result.releaseDate = dates.sort().at(-1);
  return result;
}
