import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
import log from "electron-log/main";

import {
  type RpcEvent,
  type RpcResponse,
  rpcResponseSchema,
  rpcEventSchema,
} from "../../../shared/obd";

let nextId = 1;

/** JSON-RPC over stdio 客户端，绑定单个 sidecar 子进程 */
export class SidecarRpc extends EventEmitter {
  private child: ReturnType<typeof spawn> | null = null;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  attach(child: ReturnType<typeof spawn>): void {
    this.detach();
    this.child = child;
    const rl = createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      try {
        this.handleLine(JSON.parse(line));
      } catch (err) {
        log.warn("[sidecar] invalid line", err);
      }
    });
    child.stderr?.on("data", (chunk) => {
      log.warn("[sidecar] stderr:", chunk.toString().trimEnd());
    });
    child.on("error", (err) => {
      this.rejectAll(new Error(`sidecar process error: ${err.message}`));
    });
    child.on("exit", (code, signal) => {
      const isCurrent = this.child === child;
      this.child = null;
      this.rejectAll(new Error(`sidecar exited (code=${code}, signal=${signal})`));
      // 仅当退出的是当前进程时通知上层（被替换的旧进程不触发重启）
      if (isCurrent) {
        this.emit("exit", code, signal);
      }
    });
  }

  detach(): void {
    this.rejectAll(new Error("sidecar replaced"));
    this.child = null;
  }

  private handleLine(msg: unknown): void {
    if (msg && typeof msg === "object" && "event" in (msg as object)) {
      const parsed = rpcEventSchema.safeParse(msg);
      if (parsed.success) {
        this.emit("event", parsed.data as RpcEvent);
      }
      return;
    }
    const parsed = rpcResponseSchema.safeParse(msg);
    if (!parsed.success) {
      log.warn("[sidecar] unknown message", msg);
      return;
    }
    const resp = parsed.data as RpcResponse;
    const p = this.pending.get(resp.id);
    if (!p) return;
    this.pending.delete(resp.id);
    if (resp.ok) {
      p.resolve(resp.result);
    } else {
      p.reject(new Error(resp.error ?? "sidecar error"));
    }
  }

  private rejectAll(err: Error): void {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }

  send(method: string, params?: unknown, timeoutMs = 15000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.child || this.child.killed) {
        reject(new Error("sidecar not running"));
        return;
      }
      const id = nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`sidecar request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.child.stdin!.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
}
