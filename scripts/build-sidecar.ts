import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  assertBinaryTarget,
  assertPythonTarget,
  desktopArch,
  desktopPlatform,
  type BinaryTarget,
  type PythonInfo,
} from "./desktop/architecture";

interface BuildOptions {
  root: string;
  python: string;
  target: BinaryTarget;
}

/**
 * 用目标架构的 Python 打包 sidecar，并校验复制后的实际可执行文件。
 * @param options - 项目目录、解释器路径和发行目标
 * @returns 可分发 sidecar 的绝对路径
 */
export function buildSidecar(options: BuildOptions): string {
  const { root, python, target } = options;
  const sidecarDir = join(root, "sidecar");
  const outDir = join(sidecarDir, "dist", `${target.platform}-${target.arch}`);
  const workDir = join(sidecarDir, "build", `${target.platform}-${target.arch}`);
  const binaryName = target.platform === "win32" ? "obd-sidecar.exe" : "obd-sidecar";
  const dest = join(root, "resources", binaryName);
  if (!existsSync(python)) {
    throw new Error(
      `sidecar Python 未找到：${python}；请创建目标架构虚拟环境，或传入 --python 路径`
    );
  }
  const probe = [
    "import json,platform,struct,sys,sysconfig,PyInstaller",
    "print(json.dumps(dict(platform=sys.platform,machine=platform.machine(),bits=struct.calcsize('P')*8,buildPlatform=sysconfig.get_platform(),pyinstaller=PyInstaller.__version__)))",
  ].join(";");
  const info = JSON.parse(
    execFileSync(python, ["-c", probe], {
      cwd: sidecarDir,
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    })
  ) as PythonInfo;
  assertPythonTarget(info, target);
  console.log(`[build-sidecar] ${target.platform}/${target.arch}，PyInstaller ${info.pyinstaller}`);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });
  execFileSync(
    python,
    [
      "-m",
      "PyInstaller",
      "--onefile",
      "--clean",
      "--name",
      "obd-sidecar",
      "--distpath",
      outDir,
      "--workpath",
      workDir,
      "--specpath",
      workDir,
      "--noconfirm",
      ...(target.platform === "darwin"
        ? ["--target-arch", target.arch === "x64" ? "x86_64" : "arm64"]
        : []),
      join(sidecarDir, "launcher.py"),
    ],
    { cwd: sidecarDir, stdio: "inherit", timeout: 600_000, windowsHide: true }
  );
  const built = join(outDir, binaryName);
  assertBinaryTarget(built, target);
  // 在当前平台实跑冻结程序，发现缺失的动态库或打包遗漏；不连接真实车辆。
  const output = execFileSync(built, ["--sim"], {
    input: `${JSON.stringify({ id: 1, method: "ping" })}\n`,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  const responses = output
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  if (!responses.some((message) => message.id === 1 && message.ok && message.result?.pong)) {
    throw new Error("冻结 sidecar 的模拟 ping 验证失败");
  }
  mkdirSync(join(root, "resources"), { recursive: true });
  copyFileSync(built, dest);
  assertBinaryTarget(dest, target);
  console.log(`[build-sidecar] 已验证并复制：${dest}`);
  return dest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      arch: { type: "string", default: process.arch },
      python: { type: "string" },
    },
  });
  const root = join(import.meta.dirname, "..");
  const platform = desktopPlatform(process.platform);
  buildSidecar({
    root,
    target: { platform, arch: desktopArch(values.arch) },
    python: resolve(
      values.python ??
        process.env.SIDECAR_PYTHON ??
        join(root, "sidecar", ".venv", platform === "win32" ? "Scripts/python.exe" : "bin/python")
    ),
  });
}
