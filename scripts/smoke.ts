// 端到端链路验证：SidecarRpc ↔ 真实 sidecar 进程（模拟 subscribe 数据流）
import { spawn } from "node:child_process";
import { join } from "node:path";
import { SidecarRpc } from "../electron/main/sidecar/rpc";

const sidecarDir = join(process.cwd(), "sidecar");
const python = join(sidecarDir, ".venv/bin/python");

const child = spawn(python, ["-m", "obd_sidecar.main", "--sim"], {
  cwd: sidecarDir,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, PYTHONUNBUFFERED: "1" },
});

const rpc = new SidecarRpc();
rpc.attach(child as never);

let dataFrames = 0;
rpc.on("event", (e) => {
  if (e.event === "data") {
    dataFrames += 1;
    if (dataFrames === 1) console.log("FIRST_FRAME", JSON.stringify(e.params));
  }
});

await new Promise((r) => setTimeout(r, 1500));
console.log("STATUS", JSON.stringify(await rpc.send("status")));
await rpc.send("subscribe", { pids: ["RPM", "SPEED", "COOLANT_TEMP"], interval: 200 });
await new Promise((r) => setTimeout(r, 2500));
console.log("DTC", JSON.stringify(await rpc.send("query", { cmd: "GET_DTC" })));
console.log("FRAMES", dataFrames);
if (dataFrames > 5) {
  console.log("PASS");
} else {
  console.log("FAIL");
}
child.kill();
process.exit(0);
