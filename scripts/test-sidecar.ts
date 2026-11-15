import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const python = process.env.SIDECAR_PYTHON
  ? resolve(process.env.SIDECAR_PYTHON)
  : join(root, "sidecar/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const result = spawnSync(python, ["-m", "pytest", "-q"], {
  cwd: join(root, "sidecar"),
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
