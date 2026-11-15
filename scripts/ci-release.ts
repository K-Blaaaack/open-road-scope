import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { dispatchArgs, latestRunArgs, tagRefArgs, type PlatformScope } from "./ci/dispatch";

/**
 * 调用 GitHub CLI，默认直通输出。
 * @param args - 传给 gh 的参数
 * @param capture - 是否捕获 stdout
 * @returns 捕获到的 stdout（未捕获时为空串）
 */
function gh(args: string[], capture = false): string {
  try {
    return (
      execFileSync("gh", args, {
        encoding: "utf8",
        stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      }) ?? ""
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`gh ${args.join(" ")} 失败：${detail}`);
  }
}

/**
 * 轮询刚派发的运行，直到 GitHub 侧登记出现。
 * @param branch - 目标分支
 * @param since - 派发时刻的 ISO 时间
 * @returns 运行 ID
 */
function waitForRun(branch: string, since: string): number {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const raw = gh([...latestRunArgs(), "--created", `>=${since}`], true);
    const runs = JSON.parse(raw || "[]") as {
      databaseId: number;
      headBranch: string;
      status: string;
    }[];
    const match = runs.find((run) => run.headBranch === branch) ?? runs[0];
    if (match) return match.databaseId;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  }
  throw new Error("未找到刚派发的工作流运行，请用 gh run list 手动确认");
}

const usage = `用法：
  pnpm ci:build [--platforms all|desktop|android|harmonyos] [--ref <分支>] [--no-wait]
  pnpm ci:release -- --tag v0.3.0 [--platforms all] [--ref <分支>]`;

const { values } = (() => {
  try {
    return parseArgs({
      options: {
        tag: { type: "string" },
        ref: { type: "string" },
        platforms: { type: "string", default: "all" },
        publish: { type: "boolean", default: false },
        "no-wait": { type: "boolean", default: false },
      },
    });
  } catch (error) {
    console.error(usage);
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(2);
  }
})();

const platforms = values.platforms as PlatformScope;
const branch =
  values.ref ??
  execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  }).trim();

if (values.publish && !values.tag) {
  console.error("[ci] --publish 需要同时提供 --tag（例如 --tag v0.3.0）");
  process.exit(1);
}

gh(["auth", "status"]);

if (values.tag) {
  const repo = gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], true).trim();
  const [owner, name] = repo.split("/");
  gh(tagRefArgs(owner, name, values.tag));
  console.log(`[ci] tag ${values.tag} 已存在于 ${repo}`);
}

const startedAt = new Date().toISOString();
gh(dispatchArgs({ ref: branch, tag: values.tag, platforms, publish: values.publish }));
console.log(`[ci] 已派发 release.yml（ref=${branch}, platforms=${platforms}）`);

if (values["no-wait"]) {
  console.log("[ci] 未等待运行结束，可用 gh run list --workflow release.yml 查看");
  process.exit(0);
}

const runId = waitForRun(branch, startedAt);
console.log(`[ci] 运行 ${runId} 已登记，开始跟踪`);
gh(["run", "watch", String(runId), "--exit-status"]);
gh(["run", "view", String(runId)]);
