import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
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
import { usePrefsStore } from "./prefs";

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
        ["line", "bar", "value"].includes((c as DashboardCard).type)
      );
    })
    .map((c) => ({
      id: c.id || nextCardId(),
      pid: c.pid as Pid,
      // 兼容旧数据：type 不在当前类型集合内时回退为折线
      type: (["line", "bar", "value"].includes(c.type) ? c.type : "line") as GaugeType,
      min: typeof c.min === "number" ? c.min : null,
      max: typeof c.max === "number" ? c.max : null,
      x: clampGrid(c.x, 0, GRID_COLS - 1),
      y: Math.max(0, Math.round(c.y) || 0),
      w: clampGrid(c.w, 2, GRID_COLS),
      h: Math.min(8, Math.max(2, Math.round(c.h) || 2)),
      // 字号缩放仅对 value 类型生效，规整到 0.6~2.5
      fontScale:
        typeof c.fontScale === "number" ? Math.min(2.5, Math.max(0.6, c.fontScale)) : undefined,
    }));
};

const clampGrid = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.round(v) || lo));

/** 仪表盘布局与编辑状态 */
export const useDashboardStore = defineStore("dashboard", () => {
  /** 读取间隔等界面偏好 */
  const prefs = usePrefsStore();
  const cards = ref<DashboardCard[]>([]);
  const editing = ref(false);
  const sidebarOpen = ref(false);
  const loaded = ref(false);
  /** 编辑前的快照，取消时恢复 */
  let snapshot: DashboardCard[] = [];
  /** 编辑期内的撤销栈：每次结构变更前压入当前卡片数组 */
  const history = ref<DashboardCard[][]>([]);
  /** 撤销栈上限，避免长时间编辑累积占用内存 */
  const HISTORY_LIMIT = 40;

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

  // 防抖合并写入：连续布局编辑只落盘一次（写入合并）
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const persist = (): void => {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      // 序列化为 JSON 字符串存储，规避响应式对象无法被 IndexedDB 克隆的问题
      const json = JSON.stringify({ version: 1, cards: cards.value } satisfies DashboardLayout);
      void localforage.setItem(STORAGE_KEY, json);
    }, 250);
  };

  /** 按当前卡片 PID 集合与设置中的读取间隔重订阅数据流 */
  const resubscribe = async (): Promise<void> => {
    const obd = useObdStore();
    if (subscribedPids.value.length > 0 && obd.status.state !== "idle") {
      try {
        await obd.subscribe(subscribedPids.value, prefs.readInterval);
      } catch {
        // 连接尚未就绪时忽略，连接后由连接流程重新订阅
      }
    }
  };

  // 连接状态跃迁到 connected 时补订阅：connect() 的 IPC 早于 status 事件返回，
  // 且 sidecar 崩溃重启后不会自动重发订阅，统一由这里兜底（epoch 令牌保证不重复泄漏）
  watch(
    () => useObdStore().status.state,
    (state) => {
      if (state === "connected" && subscribedPids.value.length > 0) {
        void resubscribe();
      }
    }
  );

  // 设置里调整读取间隔后重订阅，无需重连即可生效；拖拽停顿后再重订阅，与 obd store 的 epoch 令牌共同防泄漏
  let resubTimer: ReturnType<typeof setTimeout> | null = null;
  watch(
    () => prefs.readInterval,
    () => {
      if (resubTimer) clearTimeout(resubTimer);
      resubTimer = setTimeout(() => {
        resubTimer = null;
        void resubscribe();
      }, 300);
    }
  );

  /**
   * 深拷贝单张卡片
   *
   * 必须走 JSON 而不是 structuredClone：响应式代理带内部槽位，
   * structuredClone 会直接抛 DataCloneError。
   * @param card - 卡片（可能是响应式代理）
   * @returns 纯对象副本
   */
  const cloneCard = (card: DashboardCard): DashboardCard =>
    JSON.parse(JSON.stringify(card)) as DashboardCard;

  /** 深拷贝当前卡片数组 */
  const cloneCards = (): DashboardCard[] =>
    JSON.parse(JSON.stringify(cards.value)) as DashboardCard[];

  /** 结构变更前压栈，供撤销使用 */
  const pushHistory = (): void => {
    history.value.push(cloneCards());
    if (history.value.length > HISTORY_LIMIT) history.value.shift();
  };

  /**
   * 撤销上一步编辑
   * @returns 是否真的撤销了一步
   */
  const undo = (): boolean => {
    const prev = history.value.pop();
    if (!prev) return false;
    cards.value = prev;
    return true;
  };

  /** 两个卡片矩形是否相交（网格坐标） */
  const intersects = (a: DashboardCard, b: DashboardCard): boolean =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  /**
   * 落定后整理重叠：先把压在锚点卡片下面的全部下移到锚点底边，
   * 再对剩余卡片做一轮“低者让位”，保证画布上永远看不到互相压住的卡片
   * @param anchorId - 刚移动或缩放的卡片 ID，它的位置保持不变
   */
  const settleOverlaps = (anchorId: string): void => {
    const anchor = cards.value.find((c) => c.id === anchorId);
    if (!anchor) return;

    // 第一轮：与锚点相交的卡片整体下移，锚点自己不动
    for (let guard = 0; guard < 200; guard += 1) {
      const hit = cards.value.find((c) => c.id !== anchorId && intersects(anchor, c));
      if (!hit) break;
      hit.y = anchor.y + anchor.h;
    }

    // 第二轮：下移可能让这些卡片彼此相交，按 y 从小到大依次让位
    for (let guard = 0; guard < 200; guard += 1) {
      const sorted = [...cards.value].sort((a, b) => a.y - b.y);
      let changed = false;
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
          const a = sorted[i];
          const b = sorted[j];
          if (a.id === anchorId || b.id === anchorId) continue;
          if (!intersects(a, b)) continue;
          b.y = a.y + a.h;
          changed = true;
        }
      }
      if (!changed) break;
    }
  };

  const canUndo = computed(() => history.value.length > 0);

  const enterEdit = (): void => {
    // 用 JSON 快照避免响应式代理无法深拷贝
    snapshot = cloneCards();
    history.value = [];
    editing.value = true;
  };

  const cancelEdit = (): void => {
    cards.value = snapshot;
    editing.value = false;
    snapshot = [];
    history.value = [];
  };

  const save = async (): Promise<void> => {
    editing.value = false;
    snapshot = [];
    history.value = [];
    persist();
    await resubscribe();
  };

  /** 各呈现方式的默认卡片尺寸（网格单元） */
  const DEFAULT_CARD_SIZE: Record<GaugeType, { w: number; h: number }> = {
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
    pushHistory();
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

  /**
   * 删除卡片
   * @param id - 卡片 ID
   * @returns 被删除的卡片（不存在时为 undefined），供调用方做撤销提示
   */
  const removeCard = (id: string): DashboardCard | undefined => {
    const removed = cards.value.find((c) => c.id === id);
    if (!removed) return undefined;
    pushHistory();
    cards.value = cards.value.filter((c) => c.id !== id);
    return removed;
  };

  /**
   * 把删掉的卡片放回原位（撤销删除）
   *
   * 与 undo() 的区别：undo 回退整步历史，可能连带撤销之后的其它编辑；
   * 这里只针对「删除」这一个动作做精确恢复，用户在提示条上点撤销时更符合预期。
   * @param card - 被删除的卡片快照
   */
  const restoreCard = (card: DashboardCard): void => {
    if (cards.value.some((c) => c.id === card.id)) return;
    pushHistory();
    // 走 JSON 克隆：structuredClone 遇到响应式代理会抛 DataCloneError
    cards.value.push(cloneCard(card));
  };

  /**
   * 更新卡片字段
   * @param id - 卡片 ID
   * @param patch - 部分字段
   */
  const updateCard = (id: string, patch: Partial<DashboardCard>): void => {
    const card = cards.value.find((c) => c.id === id);
    if (!card) return;
    // 只记真正改变了内容的编辑，避免连续输入把撤销栈灌满
    const changed = Object.entries(patch).some(
      ([key, value]) => (card as unknown as Record<string, unknown>)[key] !== value
    );
    if (!changed) return;
    pushHistory();
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
    const nx = clampGrid(x, 0, GRID_COLS - card.w);
    const ny = Math.max(0, Math.round(y));
    // 位置没变就不进历史，否则拖动后又放回原处也会占一格撤销
    if (nx === card.x && ny === card.y) return;
    pushHistory();
    card.x = nx;
    card.y = ny;
    settleOverlaps(id);
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
    const nw = clampGrid(w, 2, GRID_COLS - card.x);
    const nh = Math.min(8, Math.max(2, Math.round(h)));
    if (nw === card.w && nh === card.h) return;
    pushHistory();
    card.w = nw;
    card.h = nh;
    settleOverlaps(id);
  };

  /** 应用预设布局 */
  const applyPreset = (name: keyof typeof LAYOUT_PRESETS): void => {
    pushHistory();
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
    resubscribe,
    history,
    canUndo,
    undo,
    enterEdit,
    cancelEdit,
    save,
    addCard,
    removeCard,
    restoreCard,
    updateCard,
    moveCard,
    resizeCard,
    applyPreset,
    toJSON,
    fromJSON,
    persist,
  };
});
