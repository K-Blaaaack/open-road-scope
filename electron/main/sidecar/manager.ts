import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { app } from "electron";
import log from "electron-log/main";
import { is } from "@electron-toolkit/utils";

import { SidecarRpc } from "./rpc";

export interface SidecarLaunchOptions {
  mode: "sim" | "real";
  port?: string;
  fault?: boolean;
  drop?: number;
}

/**
 * 管理 sidecar 子进程生命周期：
 * - dev:  直接用 venv python 运行模块（sim 模式零依赖）
 * - prod: 运行 electron-builder extraResources 打包的独立可执行文件
 * - 崩溃自动重启（指数退避），退出码 0 表示正常退出不重启
 */
export class SidecarManager extends EventEmitter {
  readonly rpc = new SidecarRpc();
  private child: ChildProcess | null = null;
  private opts: SidecarLaunchOptions = { mode: "sim" };
  private stopping = false;
  private restartDelay = 1000;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pingFailures = 0;

  /** 当前 sidecar 是否在运行 */
  get running(): boolean {
    return this.child !== null && !this.child.killed && this.child.exitCode === null;
  }

  start(opts: SidecarLaunchOptions): void {
    this.opts = opts;
    this.stopping = false;
    this.killChild();
    this.launch();
  }

  private killChild(): void {
    this.stopHeartbeat();
    this.rpc.detach();
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
    this.child = null;
  }

  private launch(): void {
    if (this.stopping) return;
    const { command, args, cwd } = this.buildCommand();
    log.info(`[sidecar] launching: ${command} ${args.join(" ")} (cwd=${cwd})`);
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      windowsHide: true,
    });
    this.child = child;
    this.rpc.removeAllListeners();
    this.rpc.attach(child);
    this.rpc.on("event", (event) => this.emit("event", event));
    this.rpc.on("exit", () => this.onExit());
    this.startHeartbeat();
  }

  private buildCommand(): { command: string; args: string[]; cwd: string } {
    if (is.dev) {
      const sidecarDir = join(app.getAppPath(), "sidecar");
      const venvPython = join(sidecarDir, ".venv/bin/python");
      const command = existsSync(venvPython)
        ? venvPython
        : process.platform === "win32"
          ? join(sidecarDir, ".venv/Scripts/python.exe")
          : "python3";
      const args = ["-m", "obd_sidecar.main", this.opts.mode === "sim" ? "--sim" : ""];
      if (this.opts.mode === "real" && this.opts.port) args.push("--port", this.opts.port);
      if (this.opts.fault) args.push("--fault");
      if (this.opts.drop) args.push("--drop", String(this.opts.drop));
      return { command, args: args.filter(Boolean), cwd: sidecarDir };
    }
    // Windows 下 PyInstaller 产物带 .exe 后缀
    const binName = process.platform === "win32" ? "obd-sidecar.exe" : "obd-sidecar";
    const bin = app.isPackaged
      ? join(process.resourcesPath, binName)
      : join(app.getAppPath(), "resources", binName);
    const args = [this.opts.mode === "sim" ? "--sim" : ""];
    if (this.opts.mode === "real" && this.opts.port) args.push("--port", this.opts.port);
    return { command: bin, args: args.filter(Boolean), cwd: process.resourcesPath };
  }

  private onExit(): void {
    this.stopHeartbeat();
    if (this.stopping) {
      log.info("[sidecar] stopped");
      return;
    }
    log.warn(`[sidecar] exited, restarting in ${this.restartDelay}ms`);
    this.emit("restarting", this.restartDelay);
    setTimeout(() => {
      // 重试期间可能已被新的 start() 接管，避免双重拉起
      if (this.stopping || this.child) return;
      this.restartDelay = Math.min(this.restartDelay * 2, 15000);
      this.launch();
    }, this.restartDelay);
  }

  /** 心跳：连续 2 次 ping 失败视为假死，杀掉重启 */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingFailures = 0;
    this.heartbeatTimer = setInterval(() => {
      this.rpc
        .send("ping", undefined, 3000)
        .then(() => {
          this.pingFailures = 0;
          this.restartDelay = 1000;
        })
        .catch(() => {
          this.pingFailures += 1;
          log.warn(`[sidecar] heartbeat failed (${this.pingFailures})`);
          if (this.pingFailures >= 2 && this.child) {
            this.child.kill();
          }
        });
    }, 10000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  stop(): void {
    this.stopping = true;
    this.killChild();
  }
}
