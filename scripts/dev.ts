import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const venvOk = existsSync(join(root, "sidecar/.venv/bin/python"));

if (!venvOk) {
  console.warn(
    "\n[dev] sidecar venv 未找到。真实设备模式需要安装依赖：\n" +
      "  cd sidecar && python3 -m venv .venv && .venv/bin/pip install -e .\n" +
      "（sim 模拟模式无需依赖，可直接开发）\n"
  );
}

const child = spawn("pnpm", ["electron-vite", "dev"], { stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 1));
