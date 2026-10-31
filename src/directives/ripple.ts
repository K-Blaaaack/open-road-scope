import type { Directive, DirectiveBinding } from "vue";

/**
 * MD3 水波纹指令
 *
 * 只在按下位置扩散一个圆形色块（MD3 ripple），与 .md-state-layer 的悬停/聚焦状态层互补：
 * - 状态层表达「悬停 / 聚焦 / 按下」的持续着色；
 * - 水波纹表达「按下瞬间」的空间反馈。
 *
 * 用法：`<button v-ripple>` 或 `<button v-ripple="{ color: 'var(--md-sys-color-on-primary)' }">`
 */

interface RippleOptions {
  /** 波纹颜色，默认取 currentColor */
  color?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

/** 单次波纹动画时长（ms），与 MD3 长动效档位对齐 */
const RIPPLE_DURATION = 450;

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 保证宿主元素能承载绝对定位的波纹层
 * @param el - 宿主元素
 */
const ensureHostStyle = (el: HTMLElement): void => {
  const style = getComputedStyle(el);
  if (style.position === "static") el.style.position = "relative";
  if (style.overflow === "visible") el.style.overflow = "hidden";
  // 隔离层叠上下文，波纹不会溢出到相邻卡片
  el.style.isolation = "isolate";
};

/**
 * 在按下坐标处生成一个波纹节点
 * @param el - 宿主元素
 * @param event - 指针事件
 * @param options - 指令参数
 */
const spawnRipple = (el: HTMLElement, event: PointerEvent, options: RippleOptions): void => {
  if (options.disabled || prefersReducedMotion()) return;

  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const ripple = document.createElement("span");

  ripple.style.position = "absolute";
  ripple.style.pointerEvents = "none";
  ripple.style.borderRadius = "50%";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
  ripple.style.background = options.color ?? "currentColor";
  ripple.style.opacity = "0.24";
  ripple.style.transform = "scale(0)";
  ripple.style.zIndex = "0";
  ripple.style.transition = `transform ${RIPPLE_DURATION}ms cubic-bezier(0.2, 0, 0, 1), opacity ${RIPPLE_DURATION}ms cubic-bezier(0.2, 0, 0, 1)`;

  el.appendChild(ripple);
  // 下一帧再改样式，确保过渡生效（同步写入会被合并成一帧，动画丢失）
  requestAnimationFrame(() => {
    ripple.style.transform = "scale(1)";
    ripple.style.opacity = "0";
  });

  window.setTimeout(() => ripple.remove(), RIPPLE_DURATION + 50);
};

/** 已绑定监听器的宿主元素，卸载时用于解绑 */
const handlers = new WeakMap<HTMLElement, (event: PointerEvent) => void>();

export const vRipple: Directive<HTMLElement, RippleOptions | undefined> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<RippleOptions | undefined>) {
    const options = binding.value ?? {};
    ensureHostStyle(el);
    const handler = (event: PointerEvent): void => spawnRipple(el, event, options);
    el.addEventListener("pointerdown", handler);
    handlers.set(el, handler);
  },
  updated(el: HTMLElement, binding: DirectiveBinding<RippleOptions | undefined>) {
    const prev = handlers.get(el);
    if (prev) el.removeEventListener("pointerdown", prev);
    const options = binding.value ?? {};
    const handler = (event: PointerEvent): void => spawnRipple(el, event, options);
    el.addEventListener("pointerdown", handler);
    handlers.set(el, handler);
  },
  unmounted(el: HTMLElement) {
    const handler = handlers.get(el);
    if (handler) el.removeEventListener("pointerdown", handler);
    handlers.delete(el);
  },
};

export default vRipple;
