import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loadWorkflow, validateCiWorkflow, validateReleaseWorkflow, actionRefs } from "./workflow";
import { dispatchArgs, isPrerelease, latestRunArgs, tagRefArgs } from "./dispatch";

describe("发布工作流", () => {
  const workflow = loadWorkflow(".github/workflows/release.yml");
  const summary = validateReleaseWorkflow(workflow);

  test("覆盖五个桌面架构并锁定原生 runner", () => {
    assert.deepEqual(summary.artifacts, [
      "linux-x64",
      "macos-arm64",
      "macos-x64",
      "windows-arm64",
      "windows-x64",
    ]);
    assert.deepEqual(summary.runners, [
      "macos-15-intel/x64",
      "macos-15/arm64",
      "ubuntu-24.04/x64",
      "windows-11-arm/arm64",
      "windows-2025/x64",
    ]);
  });

  test("action 引用锁定主版本，不含分支或 SHA 之外的浮动引用", () => {
    for (const ref of actionRefs(workflow)) {
      assert.match(ref, /^[a-z0-9-]+\/[a-z0-9-]+@v\d+$/, `action 引用不规范：${ref}`);
    }
  });

  test("发布使用 GitHub CLI 并保留预发布判定", () => {
    const publish = workflow.jobs.publish;
    const runs = (publish.steps ?? []).map((step) => step.run ?? "").join("\n");
    assert.match(runs, /gh release create/);
    assert.match(runs, /gh release upload/);
    assert.match(runs, /--prerelease/);
    assert.match(runs, /SHA256SUMS/);
    assert.equal(publish["timeout-minutes"] !== undefined, true);
  });

  test("触发方式包含 tag 推送与手动派发", () => {
    const on = workflow.on as Record<string, unknown>;
    assert.ok(on.push);
    const dispatch = on.workflow_dispatch as { inputs?: Record<string, unknown> };
    assert.ok(dispatch.inputs?.publish, "手动派发必须提供 publish 开关");
    assert.ok(dispatch.inputs?.platforms, "手动派发必须提供构建范围");
  });
});

describe("分支 CI 工作流", () => {
  test("结构与取消策略合法", () => {
    validateCiWorkflow(loadWorkflow(".github/workflows/ci.yml"));
  });
});

describe("gh 命令参数", () => {
  test("派发参数按工作流输入生成", () => {
    assert.deepEqual(dispatchArgs({ ref: "main" }), [
      "workflow",
      "run",
      "release.yml",
      "--ref",
      "main",
    ]);
    assert.deepEqual(
      dispatchArgs({ ref: "main", tag: "v0.3.0", platforms: "desktop", publish: true }),
      [
        "workflow",
        "run",
        "release.yml",
        "--ref",
        "main",
        "-f",
        "tag=v0.3.0",
        "-f",
        "platforms=desktop",
        "-f",
        "publish=true",
      ]
    );
  });

  test("运行查询与 tag 校验参数稳定", () => {
    assert.equal(latestRunArgs()[0], "run");
    assert.deepEqual(tagRefArgs("owner", "repo", "v0.3.0"), [
      "api",
      "repos/owner/repo/git/ref/tags/v0.3.0",
    ]);
  });

  test("预发布识别与工作流判定一致", () => {
    assert.equal(isPrerelease("v0.2.0-rc.1"), true);
    assert.equal(isPrerelease("v0.2.0"), false);
    assert.equal(isPrerelease("0.2.0-beta"), true);
  });
});
