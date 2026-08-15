import { defineStore } from "pinia";
import { computed, ref } from "vue";
import localforage from "localforage";

import {
  type DashboardCard,
  type DashboardLayout,
  type GaugeType,
  GRID_COLS,
  LAYOUT_PRESETS,
  nextCardId,
  type Pid,
} from "@shared/dashboard";
import { useObdStore } from "./obd";

const STORAGE_KEY = "open-road-scope:dashboard-layout";

/** 校验并规整外部导入的布局 */
const normalizeLayout = (raw: unknown): DashboardCard[] => {
  if (!raw || typeof raw !== "object") return [];
  const cards = (raw as DashboardLayout).cards;
  if (!Array.isArray(cards)) return [];
  return cards
    .filter((c): c is DashboardCard => {
      return (
        typeof c === "object" &&
        typeof (c as DashboardCard).id === "string" &&
        typeof (c as DashboardCard).pid === "string" &&
        ["gauge", "line", "bar"].includes((c as DashboardCard).type)
      );
    })
    .map((c) => ({
      id: c.id || nextCardId(),
      pid: c.pid as Pid,
      type: c.type as GaugeType,
      min: typeof c.min === "number" ? c.min : null,
      max: typeof c.max === "number" ? c.max : null,
      x: clampGrid(c.x, 0, GRID_COLS - 1),
      y: Math.max(0, Math.round(c.y) || 0),
      w: clampGrid(c.w, 2, GRID_COLS),
      h: Math.min(8, Math.max(2, Math.round(c.h) || 2)),
    }));
};

const clampGrid = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.round(v) || lo));

/** 仪表盘布局与编辑状态 */
export const useDashboardStore = defineStore("dashboard", () => {
  const cards = ref<DashboardCard[]>([]);
  const editing = ref(false);
  const sidebarOpen = ref(false);
  const loaded = ref(false);
  /** 编辑前的快照，取消时恢复 */
  let snapshot: DashboardCard[] = [];

  const subscribedPids = computed(() => {
    const set = new Set<Pid>();
    for (const c of cards.value) set.add(c.pid);
    return Array.from(set);
  });

  /** 从存储加载布局，无存储时用默认布局 */
  const init = async (): Promise<void> => {
    try {
      const saved = await localforage.getItem<string>(STORAGE_KEY);
      cards.value = saved
        ? normalizeLayout(JSON.parse(saved))
        : structuredClone(LAYOUT_PRESETS.default.cards);
    } catch {
      cards.value = structuredClone(LAYOUT_PRESETS.default.cards);
    }
    if (cards.value.length === 0) {
      cards.value = structuredClone(LAYOUT_PRESETS.default.cards);
    }
    loaded.value = true;
    await resubscribe();
  };

  const persist = (): void => {
    // 序列化为 JSON 字符串存储，规避响应式对象无法被 IndexedDB 克隆的问题
    const json = JSON.stringify({ version: 1, cards: cards.value } satisfies DashboardLayout);
    void localforage.setItem(STORAGE_KEY, json);
  };

  /** 按当前卡片 PID 集合重订阅数据流 */
  const resubscribe = async (): Promise<void> => {
    const obd = useObdStore();
    if (subscribedPids.value.length > 0 && obd.status.state !== "idle") {
      try {
        await obd.subscribe(subscribedPids.value, 500);
      } catch {
        // 连接尚未就绪时忽略，连接后由连接流程重新订阅
      }
    }
  };

  const enterEdit = (): void => {
    // 用 JSON 快照避免响应式代理无法深拷贝
    snapshot = JSON.parse(JSON.stringify(cards.value)) as DashboardCard[];
    editing.value = true;
  };

  const cancelEdit = (): void => {
    cards.value = snapshot;
    editing.value = false;
    snapshot = [];
  };

  const save = async (): Promise<void> => {
    editing.value = false;
    snapshot = [];
    persist();
    await resubscribe();
  };

  /** 各呈现方式的默认卡片尺寸（网格单元） */
  const DEFAULT_CARD_SIZE: Record<GaugeType, { w: number; h: number }> = {
    gauge: { w: 4, h: 4 },
    line: { w: 4, h: 3 },
    bar: { w: 4, h: 3 },
    value: { w: 3, h: 2 },
  };

  /**
   * 添加卡片
   * @param pid - 数据源
   * @param type - 呈现方式
   * @returns 新卡片
   */
  const addCard = (pid: Pid, type: GaugeType): DashboardCard => {
    const y = cards.value.reduce((m, c) => Math.max(m, c.y + c.h), 0);
    const size = DEFAULT_CARD_SIZE[type];
    const card: DashboardCard = {
      id: nextCardId(),
      pid,
      type,
      min: null,
      max: null,
      x: 0,
      y,
      w: size.w,
      h: size.h,
    };
    cards.value.push(card);
    return card;
  };

  const removeCard = (id: string): void => {
    cards.value = cards.value.filter((c) => c.id !== id);
  };

  /**
   * 更新卡片字段
   * @param id - 卡片 ID
   * @param patch - 部分字段
   */
  const updateCard = (id: string, patch: Partial<DashboardCard>): void => {
    const card = cards.value.find((c) => c.id === id);
    if (!card) return;
    Object.assign(card, patch);
  };

  /**
   * 移动卡片（拖拽落定）
   * @param id - 卡片 ID
   * @param x - 列坐标
   * @param y - 行坐标
   */
  const moveCard = (id: string, x: number, y: number): void => {
    const card = cards.value.find((c) => c.id === id);
    if (!card) return;
    card.x = clampGrid(x, 0, GRID_COLS - card.w);
    card.y = Math.max(0, Math.round(y));
  };

  /**
   * 调整卡片尺寸（缩放落定）
   * @param id - 卡片 ID
   * @param w - 占列数
   * @param h - 占行数
   */
  const resizeCard = (id: string, w: number, h: number): void => {
    const card = cards.value.find((c) => c.id === id);
    if (!card) return;
    card.w = clampGrid(w, 2, GRID_COLS - card.x);
    card.h = Math.min(8, Math.max(2, Math.round(h)));
  };

  /** 应用预设布局 */
  const applyPreset = (name: keyof typeof LAYOUT_PRESETS): void => {
    cards.value = structuredClone(LAYOUT_PRESETS[name].cards);
  };

  const toJSON = (): string => JSON.stringify({ version: 1, cards: cards.value }, null, 2);

  /**
   * 从 JSON 文本导入布局
   * @param json - 布局 JSON
   * @returns 是否导入成功
   */
  const fromJSON = (json: string): boolean => {
    try {
      const parsed = JSON.parse(json) as unknown;
      const normalized = normalizeLayout(parsed);
      if (normalized.length === 0) return false;
      cards.value = normalized;
      return true;
    } catch {
      return false;
    }
  };

  return {
    cards,
    editing,
    sidebarOpen,
    loaded,
    subscribedPids,
    init,
    enterEdit,
    cancelEdit,
    save,
    addCard,
    removeCard,
    updateCard,
    moveCard,
    resizeCard,
    applyPreset,
    toJSON,
    fromJSON,
    persist,
  };
});
