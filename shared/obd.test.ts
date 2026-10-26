import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  READ_INTERVAL_DEFAULT,
  READ_INTERVAL_MAX,
  READ_INTERVAL_MIN,
  READ_INTERVAL_PRESETS,
  READ_INTERVAL_STEP,
  clampReadInterval,
  subscribeParamsSchema,
} from "./obd";

describe("读取间隔常量", () => {
  test("下限 / 上限 / 默认值 / 步进符合共享契约", () => {
    assert.equal(READ_INTERVAL_MIN, 100);
    assert.equal(READ_INTERVAL_MAX, 2000);
    assert.equal(READ_INTERVAL_DEFAULT, 200);
    assert.equal(READ_INTERVAL_STEP, 50);
  });

  test("默认值本身落在合法区间内且对齐步进", () => {
    assert.equal(clampReadInterval(READ_INTERVAL_DEFAULT), READ_INTERVAL_DEFAULT);
    assert.equal(READ_INTERVAL_DEFAULT % READ_INTERVAL_STEP, 0);
    assert.ok(READ_INTERVAL_DEFAULT >= READ_INTERVAL_MIN);
    assert.ok(READ_INTERVAL_DEFAULT <= READ_INTERVAL_MAX);
  });
});

describe("clampReadInterval", () => {
  test("低于下限的输入一律夹到 100", () => {
    for (const value of [10, 0, 1, 99, -1, -1000]) {
      assert.equal(clampReadInterval(value), 100, `输入 ${value} 应夹到 100`);
    }
  });

  test("高于上限的输入一律夹到 2000", () => {
    for (const value of [2001, 9999, 100000, 1e9]) {
      assert.equal(clampReadInterval(value), 2000, `输入 ${value} 应夹到 2000`);
    }
  });

  test("合法区间内且已对齐步进的整数原样返回", () => {
    for (const value of [100, 150, 200, 500, 1950, 2000]) {
      assert.equal(clampReadInterval(value), value);
    }
  });

  test("未对齐步进的输入按就近取整对齐到 50 的倍数", () => {
    assert.equal(clampReadInterval(313), 300);
    assert.equal(clampReadInterval(338), 350);
    assert.equal(clampReadInterval(101), 100);
    assert.equal(clampReadInterval(149), 150);
    assert.equal(clampReadInterval(126), 150);
    assert.equal(clampReadInterval(124), 100);
    // 1990 对齐到 2000 后恰好压在上限，不应被再次改写
    assert.equal(clampReadInterval(1990), 2000);
  });

  test("字符串数字先转数值再对齐步进", () => {
    assert.equal(clampReadInterval("300"), 300);
    assert.equal(clampReadInterval("250"), 250);
    assert.equal(clampReadInterval("150.4"), 150);
    assert.equal(clampReadInterval(" 400 "), 400);
  });

  test("无法转成有限数值的输入回退默认值 200", () => {
    for (const value of [NaN, undefined, "abc", "abc50", {}, Infinity, -Infinity]) {
      assert.equal(clampReadInterval(value), 200, `输入 ${String(value)} 应回退 200`);
    }
  });

  test("null / 空字符串 / 布尔 / 数组一律回退默认值 200", () => {
    // 只把「数值」与「数字字符串」视为有效输入，其余类型回退默认值，
    // 避免 Number(null) === 0、Number("") === 0 被误当成合法下限
    assert.equal(clampReadInterval(null), 200);
    assert.equal(clampReadInterval(""), 200);
    assert.equal(clampReadInterval([]), 200);
    assert.equal(clampReadInterval(true), 200);
    assert.equal(clampReadInterval(false), 200);
  });

  test("步进以 READ_INTERVAL_MIN 为锚点对齐（与 range 的 min + k*step 网格一致）", () => {
    // 锚点必须是 min 而不是 0：否则回写 el.value 时滑块会被拽到相邻格
    assert.equal(clampReadInterval(120), 100);
    assert.equal(clampReadInterval(150), 150);
    assert.equal(clampReadInterval(160), 150);
    assert.equal(clampReadInterval(190), 200);
    assert.equal(clampReadInterval(1990), 2000);
    for (const value of [120, 160, 190, 313, 338, 1990]) {
      assert.equal(
        (clampReadInterval(value) - READ_INTERVAL_MIN) % READ_INTERVAL_STEP,
        0,
        `结果未落在 min + k*step 网格上：${value}`
      );
    }
  });

  test("任意输入的结果都是合法区间内的 50 倍数", () => {
    const samples: unknown[] = [-5000, -1, 0, 37, 100, 313, 999, 1999, 2001, 88888, "abc", NaN];
    for (const value of samples) {
      const out = clampReadInterval(value);
      assert.ok(Number.isInteger(out), `结果应为整数：${out}`);
      assert.ok(out >= READ_INTERVAL_MIN && out <= READ_INTERVAL_MAX, `结果越界：${out}`);
      assert.equal(out % READ_INTERVAL_STEP, 0, `结果未对齐步进：${out}`);
    }
  });
});

describe("READ_INTERVAL_PRESETS", () => {
  test("档位全部落在合法区间且对齐步进，默认档位在内", () => {
    assert.ok(READ_INTERVAL_PRESETS.length >= 2);
    for (const preset of READ_INTERVAL_PRESETS) {
      assert.ok(preset >= READ_INTERVAL_MIN && preset <= READ_INTERVAL_MAX, `档位越界：${preset}`);
      assert.equal((preset - READ_INTERVAL_MIN) % READ_INTERVAL_STEP, 0, `档位未对齐：${preset}`);
    }
    assert.ok(READ_INTERVAL_PRESETS.includes(READ_INTERVAL_DEFAULT));
    assert.deepEqual([...READ_INTERVAL_PRESETS], [...new Set(READ_INTERVAL_PRESETS)]);
  });
});

describe("subscribeParamsSchema", () => {
  test("合法参数通过并保留 interval", () => {
    const parsed = subscribeParamsSchema.safeParse({ pids: ["RPM"], interval: 500 });
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.interval, 500);
    assert.deepEqual(parsed.success && parsed.data.pids, ["RPM"]);
  });

  test("上下限边界值 100 / 2000 通过", () => {
    for (const interval of [READ_INTERVAL_MIN, READ_INTERVAL_MAX]) {
      const parsed = subscribeParamsSchema.safeParse({ pids: ["SPEED", "RPM"], interval });
      assert.equal(parsed.success, true, `interval=${interval} 应通过`);
      assert.equal(parsed.success && parsed.data.interval, interval);
    }
  });

  test("interval 低于下限 100 时失败", () => {
    const parsed = subscribeParamsSchema.safeParse({ pids: ["RPM"], interval: 99 });
    assert.equal(parsed.success, false);
    assert.deepEqual(parsed.success === false && parsed.error.issues[0].path, ["interval"]);
  });

  test("interval 高于上限 2000 时失败", () => {
    const parsed = subscribeParamsSchema.safeParse({ pids: ["RPM"], interval: 2001 });
    assert.equal(parsed.success, false);
    assert.deepEqual(parsed.success === false && parsed.error.issues[0].path, ["interval"]);
  });

  test("interval 非整数时失败", () => {
    const parsed = subscribeParamsSchema.safeParse({ pids: ["RPM"], interval: 500.5 });
    assert.equal(parsed.success, false);
  });

  test("缺省 interval 解析为默认值 200", () => {
    const parsed = subscribeParamsSchema.safeParse({ pids: ["RPM"] });
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.interval, READ_INTERVAL_DEFAULT);
  });

  test("pids 为空数组时失败", () => {
    const parsed = subscribeParamsSchema.safeParse({ pids: [], interval: 500 });
    assert.equal(parsed.success, false);
    assert.deepEqual(parsed.success === false && parsed.error.issues[0].path, ["pids"]);
  });

  test("未知 PID 时失败", () => {
    const parsed = subscribeParamsSchema.safeParse({ pids: ["RPM", "NOT_A_PID"], interval: 500 });
    assert.equal(parsed.success, false);
    assert.deepEqual(parsed.success === false && parsed.error.issues[0].path, ["pids", 1]);
  });
});
