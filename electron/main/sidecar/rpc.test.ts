import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { SidecarRpc } from "./rpc";

class FakeChild extends EventEmitter {
  stdin = {
    writes: [] as string[],
    write(line: string): void {
      this.writes.push(line);
    },
  };
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;

  emitStdoutLine(obj: unknown): void {
    this.stdout.write(JSON.stringify(obj) + "\n");
  }
}

describe("SidecarRpc", () => {
  test("send resolves with result when response arrives", async () => {
    const rpc = new SidecarRpc();
    const child = new FakeChild();
    rpc.attach(child as never);

    const promise = rpc.send("ping");
    const sent = JSON.parse(child.stdin.writes[0]);
    assert.equal(sent.method, "ping");
    child.emitStdoutLine({ id: sent.id, ok: true, result: { pong: true } });
    assert.deepEqual(await promise, { pong: true });
  });

  test("send rejects on error response", async () => {
    const rpc = new SidecarRpc();
    const child = new FakeChild();
    rpc.attach(child as never);

    const promise = rpc.send("query", { cmd: "GET_DTC" });
    const sent = JSON.parse(child.stdin.writes[0]);
    child.emitStdoutLine({ id: sent.id, ok: false, error: "not connected" });
    await assert.rejects(promise, /not connected/);
  });

  test("events are emitted for incoming event messages", async () => {
    const rpc = new SidecarRpc();
    const child = new FakeChild();
    rpc.attach(child as never);

    const events: unknown[] = [];
    rpc.on("event", (e) => events.push(e));
    child.emitStdoutLine({ event: "data", params: { values: { RPM: 1234 }, ts: 1 } });
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { event: "data", params: { values: { RPM: 1234 }, ts: 1 } });
  });

  test("send rejects when sidecar exits", async () => {
    const rpc = new SidecarRpc();
    const child = new FakeChild();
    rpc.attach(child as never);

    const promise = rpc.send("status");
    child.emit("exit", 1, null);
    await assert.rejects(promise, /exited/);
  });

  test("send rejects immediately when no child attached", async () => {
    const rpc = new SidecarRpc();
    await assert.rejects(rpc.send("ping"), /sidecar not running/);
  });
});
