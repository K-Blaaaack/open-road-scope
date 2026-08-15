import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useDashboardStore } from "./dashboard";
import { DEFAULT_LAYOUT, GRID_COLS, type DashboardCard } from "@shared/dashboard";

function mockObd(): void {
  (window as unknown as { obd: unknown }).obd = {
    connect: vi.fn().mockResolvedValue({ ok: true }),
    disconnect: vi.fn().mockResolvedValue({ ok: true }),
    subscribe: vi.fn().mockResolvedValue({ ok: true }),
    query: vi.fn(),
    status: vi.fn(),
    listPorts: vi.fn(),
    onEvent: vi.fn(() => () => {}),
  };
}

beforeEach(async () => {
  setActivePinia(createPinia());
  mockObd();
  const store = useDashboardStore();
  await store.init();
});

describe("useDashboardStore", () => {
  test("init 加载默认布局", async () => {
    const store = useDashboardStore();
    await store.init();
    expect(store.loaded).toBe(true);
    expect(store.cards.length).toBe(DEFAULT_LAYOUT.cards.length);
  });

  test("addCard 追加卡片并返回", () => {
    const store = useDashboardStore();
    store.addCard("SPEED", "gauge");
    const added = store.cards[store.cards.length - 1];
    expect(added.type).toBe("gauge");
    expect(added.min).toBeNull();
    expect(added.max).toBeNull();
  });

  test("removeCard 删除指定卡片", () => {
    const store = useDashboardStore();
    const target = store.cards[1];
    store.removeCard(target.id);
    expect(store.cards.some((c) => c.id === target.id)).toBe(false);
  });

  test("updateCard 更新部分字段", () => {
    const store = useDashboardStore();
    const target = store.cards[0];
    store.updateCard(target.id, { type: "bar", max: 500 });
    expect(store.cards[0].type).toBe("bar");
    expect(store.cards[0].max).toBe(500);
  });

  test("moveCard 列坐标不越界", () => {
    const store = useDashboardStore();
    const card = store.cards[0];
    store.moveCard(card.id, 999, 999);
    const moved = store.cards[0];
    expect(moved.x).toBe(GRID_COLS - moved.w);
    expect(moved.y).toBe(999);
  });

  test("resizeCard 尺寸限制在最小与边界内", () => {
    const store = useDashboardStore();
    const card = store.cards[0];
    store.resizeCard(card.id, 1, 1);
    expect(store.cards[0].w).toBe(2);
    expect(store.cards[0].h).toBe(2);
    store.resizeCard(card.id, 999, 999);
    expect(store.cards[0].w).toBe(GRID_COLS - store.cards[0].x);
  });

  test("enterEdit 快照，cancelEdit 恢复", () => {
    const store = useDashboardStore();
    const before = JSON.parse(JSON.stringify(store.cards)) as DashboardCard[];
    store.enterEdit();
    store.removeCard(store.cards[0].id);
    store.cards.push({
      id: "x",
      pid: "RPM",
      type: "value",
      min: null,
      max: null,
      x: 0,
      y: 0,
      w: 2,
      h: 2,
    });
    store.cards.push({
      id: "y",
      pid: "SPEED",
      type: "line",
      min: null,
      max: null,
      x: 0,
      y: 0,
      w: 2,
      h: 2,
    });
    expect(store.cards.length).not.toBe(before.length);
    store.cancelEdit();
    expect(store.editing).toBe(false);
    expect(store.cards).toEqual(before);
  });

  test("fromJSON 导入有效布局", () => {
    const store = useDashboardStore();
    const ok = store.fromJSON(
      JSON.stringify({
        version: 1,
        cards: [{ id: "a", pid: "RPM", type: "line", x: 0, y: 0, w: 4, h: 3 }],
      })
    );
    expect(ok).toBe(true);
    expect(store.cards.length).toBe(1);
    expect(store.cards[0].pid).toBe("RPM");
  });

  test("fromJSON 拒绝无效输入", () => {
    const store = useDashboardStore();
    expect(store.fromJSON("not json")).toBe(false);
    expect(store.fromJSON(JSON.stringify({ cards: [{ bad: true }] }))).toBe(false);
  });

  test("toJSON 输出可解析的布局", () => {
    const store = useDashboardStore();
    const parsed = JSON.parse(store.toJSON()) as { cards: DashboardCard[] };
    expect(parsed.cards.length).toBe(store.cards.length);
  });
});
