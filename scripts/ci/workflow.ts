import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { load } from "js-yaml";

type Step = { name?: string; uses?: string; run?: string };
type Job = {
  name?: string;
  needs?: string | string[];
  if?: string;
  "runs-on"?: string;
  uses?: string;
  steps?: Step[];
  strategy?: { matrix?: { include?: Record<string, string>[] } };
  timeout?: number;
  "timeout-minutes"?: number;
};
export interface Workflow {
  on?: unknown;
  concurrency?: unknown;
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

export const ROOT = resolve(import.meta.dirname, "../..");

/**
 * 读取并解析 YAML 工作流。
 * @param path - 相对仓库根目录的工作流路径
 * @returns 解析后的工作流对象
 */
export function loadWorkflow(path: string): Workflow {
  const text = readFileSync(join(ROOT, path), "utf8");
  const parsed = load(text) as (Workflow & Record<number, unknown>) | undefined;
  if (!parsed || typeof parsed !== "object" || !parsed.jobs) throw new Error(`${path} 缺少 jobs`);
  // YAML 1.1 会把裸键 on 解析成布尔 true，这里还原成 on
  if (parsed.on === undefined && parsed[1] !== undefined) parsed.on = parsed[1];
  return parsed;
}

/**
 * 取出工作流里所有 `uses:` 引用。
 * @param workflow - 已解析的工作流
 * @returns 去重后的 action 引用列表
 */
export function actionRefs(workflow: Workflow): string[] {
  const refs = new Set<string>();
  for (const job of Object.values(workflow.jobs)) {
    if (job.uses) refs.add(job.uses);
    for (const step of job.steps ?? []) {
      if (step.uses) refs.add(step.uses);
    }
  }
  return [...refs];
}

/**
 * 校验工作流结构与关键约束，供 CI 与本地测试共用。
 * @param workflow - 已解析的发布工作流
 * @returns 校验通过后的矩阵摘要
 */
export function validateReleaseWorkflow(workflow: Workflow): {
  artifacts: string[];
  runners: string[];
} {
  const jobs = workflow.jobs;
  const expected = ["check", "build", "android", "harmonyos-web", "publish"];
  for (const name of expected) {
    if (!jobs[name]) throw new Error(`release.yml 缺少 job：${name}`);
  }
  const needsOf = (job: Job): string[] =>
    typeof job.needs === "string" ? [job.needs] : (job.needs ?? []);
  for (const name of ["build", "android", "harmonyos-web"]) {
    if (!needsOf(jobs[name]).includes("check")) throw new Error(`${name} 必须依赖 check`);
  }
  const publishNeeds = needsOf(jobs.publish);
  for (const name of ["build", "android", "harmonyos-web"]) {
    if (!publishNeeds.includes(name)) throw new Error(`publish 必须依赖 ${name}`);
  }
  const checkRun = (jobs.check.steps ?? []).map((step) => step.run ?? "").join("\n");
  for (const script of ["typecheck", "test:desktop", "test:android", "test:harmonyos"]) {
    if (!checkRun.includes(script)) throw new Error(`check job 未执行 ${script}`);
  }
  if (!jobs.publish.steps?.some((step) => (step.run ?? "").includes("gh release"))) {
    throw new Error("publish 必须使用 GitHub CLI 创建 Release");
  }
  if (!jobs.publish.steps?.some((step) => (step.run ?? "").includes("release-known-issues"))) {
    throw new Error("publish 必须把已知限制写进发布说明");
  }
  if (!workflow.concurrency) throw new Error("release.yml 缺少 concurrency");
  const include = jobs.build.strategy?.matrix?.include ?? [];
  const byArtifact = new Map(include.map((entry) => [entry.artifact, entry]));
  for (const artifact of [
    "linux-x64",
    "windows-x64",
    "windows-arm64",
    "macos-arm64",
    "macos-x64",
  ]) {
    if (!byArtifact.has(artifact)) throw new Error(`构建矩阵缺少 ${artifact}`);
  }
  const arm = byArtifact.get("windows-arm64")!;
  if (arm.os !== "windows-11-arm" || arm.arch !== "arm64") {
    throw new Error("Windows ARM64 必须使用原生 ARM runner 与 arm64");
  }
  if (!arm.args.includes("--win") || !arm.args.includes("nsis") || !arm.args.includes("portable")) {
    throw new Error("Windows ARM64 必须产出 NSIS 与便携版");
  }
  if (arm.args.includes("msi")) throw new Error("Windows ARM64 不应包含 MSI（WiX 包装仍为 x64）");
  const intel = byArtifact.get("macos-x64")!;
  if (intel.os !== "macos-15-intel" || intel.arch !== "x64" || !intel.args.includes("--x64")) {
    throw new Error("Intel Mac 必须使用 macos-15-intel 与 x64");
  }
  for (const job of Object.values(jobs)) {
    if (!job["timeout-minutes"]) throw new Error("每个 job 都需要 timeout-minutes");
  }
  return {
    artifacts: [...byArtifact.keys()].sort(),
    runners: include.map((entry) => `${entry.os}/${entry.arch}`).sort(),
  };
}

/**
 * 校验分支 CI 工作流的基本约束。
 * @param workflow - 已解析的 ci.yml
 * @returns 校验通过后正常返回
 */
export function validateCiWorkflow(workflow: Workflow): void {
  const on = workflow.on as Record<string, unknown> | undefined;
  if (!on || !("pull_request" in on)) throw new Error("ci.yml 必须在 pull_request 上运行");
  if (!workflow.jobs.check) throw new Error("ci.yml 缺少 check job");
  if (!workflow.jobs.sidecar) throw new Error("ci.yml 缺少 sidecar job");
  const concurrency = workflow.concurrency as { "cancel-in-progress"?: boolean } | undefined;
  if (!concurrency?.["cancel-in-progress"]) throw new Error("ci.yml 应取消同一分支的旧运行");
}
