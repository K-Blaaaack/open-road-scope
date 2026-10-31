import { ref, type Ref } from "vue";

/** 单条提示条的配置项 */
export interface SnackbarOptions {
  /** 动作按钮文案；缺省时不显示动作按钮 */
  actionLabel?: string;
  /** 动作按钮回调；点击后提示条立即关闭 */
  onAction?: () => void;
  /** 自动消失时长（毫秒），默认 4000 */
  duration?: number;
}

/** 队列内部的提示条实例：在配置基础上补齐消息与唯一 id */
export interface SnackbarItem extends SnackbarOptions {
  /** 自增 id，供 Transition 切换动画使用 */
  id: number;
  /** 提示文案 */
  message: string;
  /** 归一化后的消失时长 */
  duration: number;
}

/** 默认自动消失时长（毫秒） */
const DEFAULT_DURATION = 4000;

/**
 * 模块级单例：所有调用方共享同一份队列，
 * 因此不依赖 pinia 也能保证全应用同时只显示一条提示条。
 */
const current = ref<SnackbarItem | null>(null);
const queue = ref<SnackbarItem[]>([]);

let timer: ReturnType<typeof setTimeout> | null = null;
let seed = 0;

/** 清掉自动消失定时器 */
const clearTimer = (): void => {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
};

/** 立即关闭当前条，并把队列里的下一条顶上来 */
function dismiss(): void {
  clearTimer();
  const next = queue.value.shift() ?? null;
  current.value = next;
  if (next) {
    scheduleDismiss(next);
  }
}

/** 按条目的时长安排自动消失 */
function scheduleDismiss(item: SnackbarItem): void {
  clearTimer();
  timer = setTimeout(() => {
    dismiss();
  }, item.duration);
}

/**
 * 弹出一条提示；已有提示在显示时先入队，等前一条消失后再依次展示。
 * @param message - 提示文案
 * @param options - 动作按钮、回调与时长
 * @returns 无返回值
 */
const show = (message: string, options: SnackbarOptions = {}): void => {
  const item: SnackbarItem = {
    id: ++seed,
    message,
    duration: options.duration ?? DEFAULT_DURATION,
    actionLabel: options.actionLabel,
    onAction: options.onAction,
  };
  if (current.value) {
    queue.value.push(item);
    return;
  }
  current.value = item;
  scheduleDismiss(item);
};

/** 触发动作回调并关闭当前条 */
const runAction = (): void => {
  const item = current.value;
  if (!item) {
    return;
  }
  item.onAction?.();
  dismiss();
};

/** 提示条内部状态，仅供 MdSnackbarHost 消费 */
export interface SnackbarState {
  /** 当前正在显示的条目 */
  current: Readonly<Ref<SnackbarItem | null>>;
  /** 排队等待展示的条目 */
  queue: Readonly<Ref<SnackbarItem[]>>;
  /** 关闭当前条并推进队列 */
  dismiss: () => void;
  /** 执行当前条的动作回调并关闭 */
  runAction: () => void;
}

/**
 * 读取提示条内部状态（只读），供宿主组件渲染使用。
 * @returns 当前条、排队条以及关闭 / 执行动作的方法
 */
export const useSnackbarState = (): SnackbarState => ({
  current,
  queue,
  dismiss,
  runAction,
});

/**
 * 获取提示条操作入口（模块级单例，可任意位置调用）。
 * @returns `show` 弹出提示、`dismiss` 立即关闭并推进队列
 */
export const useSnackbar = (): {
  show: (message: string, options?: SnackbarOptions) => void;
  dismiss: () => void;
} => ({ show, dismiss });
