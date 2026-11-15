import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * 用 JDK 编译并运行 ElmLineReader 校验程序。
 * 这里只覆盖纯 JDK 的行切分逻辑，真实的安卓传输仍需设备验收。
 */
const root = resolve(import.meta.dirname, "..");
const work = mkdtempSync(join(tmpdir(), "ors-android-"));
try {
  execFileSync(
    "javac",
    [
      "-encoding",
      "UTF-8",
      "-d",
      work,
      join(root, "android/app/src/main/java/dev/openroadscope/app/ElmLineReader.java"),
      join(root, "scripts/android/ElmLineReaderCheck.java"),
    ],
    { stdio: "inherit" }
  );
  execFileSync("java", ["-cp", work, "dev.openroadscope.app.ElmLineReaderCheck"], {
    stdio: "inherit",
  });
  console.log("[test-android] ElmLineReader 校验通过");
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`[test-android] 校验失败：${reason}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
