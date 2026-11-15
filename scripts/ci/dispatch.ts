export type PlatformScope = "all" | "desktop" | "android" | "harmonyos";

export interface DispatchOptions {
  /** 触发所用的分支或 ref */
  ref: string;
  /** 要发布的 tag；留空表示只构建 */
  tag?: string;
  /** 构建范围，默认 all */
  platforms?: PlatformScope;
  /** 是否创建 Release，默认 false */
  publish?: boolean;
}

/**
 * 生成 `gh workflow run release.yml` 的参数数组。
 * @param options - 触发选项
 * @returns 可直接交给 gh 的参数列表
 */
export function dispatchArgs(options: DispatchOptions): string[] {
  const args = ["workflow", "run", "release.yml", "--ref", options.ref];
  if (options.tag) args.push("-f", `tag=${options.tag}`);
  if (options.platforms) args.push("-f", `platforms=${options.platforms}`);
  if (options.publish) args.push("-f", "publish=true");
  return args;
}

/**
 * 生成查询最近一次 release 运行的参数。
 * @param workflow - 工作流文件名
 * @returns gh run list 参数
 */
export function latestRunArgs(workflow = "release.yml"): string[] {
  return [
    "run",
    "list",
    "--workflow",
    workflow,
    "--limit",
    "1",
    "--json",
    "databaseId,status,conclusion,headBranch,displayTitle",
  ];
}

/**
 * 生成校验远端 tag 存在的参数（tags 走 git 引用接口）。
 * @param owner - 仓库所有者
 * @param repo - 仓库名
 * @param tag - tag 名称
 * @returns gh api 参数
 */
export function tagRefArgs(owner: string, repo: string, tag: string): string[] {
  return ["api", `repos/${owner}/${repo}/git/ref/tags/${tag}`];
}

/**
 * 从 tag 名称判断是否为预发布（含连字符后缀）。
 * @param tag - 例如 v0.2.0-rc.1
 * @returns 是否预发布
 */
export function isPrerelease(tag: string): boolean {
  return /^v?\d+\.\d+\.\d+-/.test(tag);
}
