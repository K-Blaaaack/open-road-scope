import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * 用 PyInstaller 打包 Python sidecar 为独立可执行文件。
 * 产物输出到 resources/obd-sidecar{,.exe}，随 electron-builder extraResources 分发。
 */
const root = join(import.meta.dirname, "..");
const sidecarDir = join(root, "sidecar");
const python =
  process.platform === "win32"
    ? join(sidecarDir, ".venv/Scripts/python.exe")
    : join(sidecarDir, ".venv/bin/python");
const outDir = join(sidecarDir, "dist");
const binaryName = process.platform === "win32" ? "obd-sidecar.exe" : "obd-sidecar";
const dest = join(root, "resources", binaryName);

if (!existsSync(python)) {
  console.error(
    `[build-sidecar] venv 未找到：${python}\n请先执行 cd sidecar && python3 -m venv .venv && .venv/bin/pip install -e .`
  );
  process.exit(1);
}

mkdirSync(join(root, "resources"), { recursive: true });
mkdirSync(outDir, { recursive: true });

console.log("[build-sidecar] PyInstaller 打包中…");
execSync(
  [
    python,
    "-m",
    "PyInstaller",
    "--onefile",
    "--name",
    "obd-sidecar",
    "--distpath",
    outDir,
    "--workpath",
    join(sidecarDir, "build"),
    "--specpath",
    join(sidecarDir, "build"),
    "--noconfirm",
    join(sidecarDir, "launcher.py"),
  ].join(" "),
  { cwd: sidecarDir, stdio: "inherit" }
);

const built = join(outDir, binaryName);
if (!existsSync(built)) {
  console.error(`[build-sidecar] 打包失败：未找到产物 ${built}`);
  process.exit(1);
}
execSync(`cp "${built}" "${dest}"`);
console.log(`[build-sidecar] 完成：${dest}`);
