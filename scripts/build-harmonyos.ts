import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const args = [
  "assembleHap",
  "--mode",
  "module",
  "-p",
  "product=default",
  "-p",
  "module=entry@default",
  "-p",
  "buildMode=debug",
  "--no-daemon",
];
// DevEco 随附的 hvigorw 位于工具目录；也可直接指定其 hvigorw.js 路径。
const cli = process.env.HVIGOR_CLI;
const result = spawnSync(cli ? process.execPath : "hvigorw", cli ? [cli, ...args] : args, {
  cwd: resolve(import.meta.dirname, "../harmonyos"),
  stdio: "inherit",
  shell: !cli && process.platform === "win32",
});
if (result.error) {
  console.error(
    "请先安装 DevEco Studio 和 HarmonyOS SDK，并将 hvigorw 加入 PATH，或设置 HVIGOR_CLI 为 hvigorw.js 的绝对路径。也可在 DevEco 中打开 harmonyos 工程并构建 HAP。"
  );
  console.error(result.error.message);
}
process.exitCode = result.status ?? 1;
