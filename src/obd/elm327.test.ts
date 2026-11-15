import { describe, expect, test, vi } from "vitest";
import { Elm327Session, type TransportBridge } from "./elm327";
import { createMobileApi } from "./mobile-bridge";

/**
 * 从脚本化 ELM327 响应构建同步或异步传输。
 * @param asynchronous - 是否模拟 HarmonyOS 异步回执
 * @returns 可记录命令的传输测试设备
 */
export function elmFixture(asynchronous = true): TransportBridge & { writes: string[] } {
  const lines: string[] = [];
  const writes: string[] = [];
  const responses: Record<string, string[]> = {
    ATZ: ["ELM327 v1.5"],
    ATE0: ["OK"],
    ATL0: ["OK"],
    ATH0: ["OK"],
    ATSP0: ["OK"],
    ATDP: ["AUTO, ISO 15765-4 CAN"],
    ATI: ["ELM327 v1.5"],
    "0100": ["41 00 BE 3E B8 13"],
    "010C": ["41 0C 1A F8"],
    "010D": ["41 0D 42"],
    ATRV: ["14.1V"],
    "03": ["43 01 04 20 00 00"],
    "04": ["44"],
    "0902": ["49 02 01 57 50 30 5A 5A 5A 39 39 5A 54 53 33 39 32 31 32 34"],
  };
  return {
    writes,
    listPorts: () => "[]",
    open: () => true,
    close: vi.fn(() => {
      lines.length = 0;
    }),
    connected: () => true,
    write: (line) => {
      writes.push(line);
      lines.push(...(responses[line] ?? ["NO DATA"]), ">");
      return asynchronous ? Promise.resolve() : undefined;
    },
    readLine: () => {
      const line = lines.shift() ?? "";
      return asynchronous ? Promise.resolve(line) : line;
    },
  };
}

describe.each([true, false])("ELM327 异步=%s", (asynchronous) => {
  test("初始化、PID 与诊断共用传输，异步并发不会交叉响应", async () => {
    const native = elmFixture(asynchronous);
    const session = new Elm327Session(native);
    await session.init();
    expect(session.getProtocol()).toContain("ISO 15765-4");
    expect(session.getElmVersion()).toBe("ELM327 v1.5");
    const values = await Promise.all([
      session.queryPid("RPM"),
      session.queryPid("SPEED"),
      session.queryVin(),
    ]);
    expect(values).toEqual([1726, 66, "WP0ZZZ99ZTS392124"]);
    expect(await session.queryDtc()).toEqual(["P0420"]);
    expect(await session.readVoltage()).toBe(14.1);
    expect(await session.clearDtc()).toBe(true);
    expect(native.writes.slice(-6)).toEqual(["010C", "010D", "0902", "03", "ATRV", "04"]);
  });

  test("dispose 使后续和排队的命令失效", async () => {
    const native = elmFixture(asynchronous);
    const session = new Elm327Session(native);
    session.dispose();
    await expect(session.queryPid("RPM")).rejects.toThrow("cancelled");
    expect(native.writes).toEqual([]);
  });
});

test("写入等待期间取消会话，不再读取原生数据", async () => {
  const native = elmFixture();
  let finishWrite!: () => void;
  native.write = () =>
    new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
  native.readLine = vi.fn(() => ">");
  const session = new Elm327Session(native);
  const request = session.queryPid("RPM");
  await Promise.resolve();
  session.dispose();
  finishWrite();
  await expect(request).rejects.toThrow("cancelled");
  expect(native.readLine).not.toHaveBeenCalled();
});

test("没有采样订阅时诊断超时也会清理连接状态", async () => {
  const native = elmFixture();
  const api = createMobileApi(native, "android");
  expect(await api.connect("real", { port: "192.168.0.10:35000" })).toEqual({ ok: true });
  native.readLine = () => "";
  vi.useFakeTimers();
  try {
    const response = api.query("GET_DTC");
    await vi.advanceTimersByTimeAsync(3100);
    expect(await response).toMatchObject({ ok: false });
    expect(await api.status()).toMatchObject({ result: { state: "error" } });
    expect((await api.subscribe({ pids: ["RPM"], interval: 100 })).ok).toBe(false);
  } finally {
    await api.disconnect();
    vi.useRealTimers();
  }
});

test("缺少提示符的命令超时后关闭连接，迟到数据不会传给下一命令", async () => {
  vi.useFakeTimers();
  try {
    const native = elmFixture();
    native.readLine = () => "";
    const session = new Elm327Session(native);
    const assertion = expect(session.queryPid("RPM")).rejects.toThrow("commandTimeout");
    await vi.advanceTimersByTimeAsync(2100);
    await assertion;
    expect(native.close).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
