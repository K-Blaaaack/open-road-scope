<script setup lang="ts">
/**
 * MD3 列表项
 *
 * 三档高度（56/72/88）对应 1/2/3 行文本：单行只有 headline，双行加 supporting，
 * 三行额外容纳多行 supporting 文本。可点击时渲染为原生 <button>，保证键盘可达与语义正确。
 * 交互反馈由 `.md-state-layer` + `v-ripple` 两层构成（与 MdButton 一致）。
 */
import { computed } from "vue";
import { vRipple } from "@/directives/ripple";

const props = withDefaults(
  defineProps<{
    /** 主文本（必填） */
    headline: string;
    /** 次要说明文本 */
    supporting?: string;
    /** 行数档位：1 行 56dp / 2 行 72dp / 3 行 88dp */
    lines?: 1 | 2 | 3;
    /** 前置图标类名（如 i-lucide-gauge），leading 插槽优先 */
    leadingIcon?: string;
    /** 可点击：渲染为 button 并加状态层与水波纹 */
    clickable?: boolean;
    /** 禁用（仅对可点击项生效） */
    disabled?: boolean;
  }>(),
  {
    supporting: undefined,
    lines: 1,
    leadingIcon: undefined,
    clickable: false,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
}>();

/** 行数 → 高度类名 */
const linesClass = computed(() => `md-list-item--lines-${props.lines}`);

/**
 * 原生属性：只有可点击时才挂 button 专属属性，避免非交互项上出现非法 attribute
 * @returns 传给根元素的原生属性集合
 */
const nativeAttrs = computed<Record<string, string | boolean>>(() => {
  const attrs: Record<string, string | boolean> = {};
  if (props.clickable) {
    attrs.type = "button";
    attrs.disabled = props.disabled;
  }
  return attrs;
});

/**
 * 水波纹配置：不可点击或禁用时直接关闭波纹
 * @returns 指令参数
 */
const rippleOptions = computed(() => ({
  disabled: !props.clickable || props.disabled,
}));

/**
 * 点击处理：禁用态直接吞掉事件，避免上层误判
 * @param event - 原生点击事件
 * @returns 无返回值
 */
const onClick = (event: MouseEvent): void => {
  if (props.clickable && props.disabled) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (!props.clickable) return;
  emit("click", event);
};
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    v-ripple="rippleOptions"
    v-bind="nativeAttrs"
    class="md-list-item"
    :class="[
      linesClass,
      clickable ? 'md-list-item--clickable md-state-layer' : '',
      disabled ? 'md-list-item--disabled' : '',
    ]"
    :aria-disabled="clickable && disabled ? 'true' : undefined"
    @click="onClick"
  >
    <!-- 前置区域：插槽优先，其次渲染图标 -->
    <span v-if="$slots.leading || leadingIcon" class="md-list-item__leading">
      <slot name="leading">
        <!-- 默认图标是纯装饰，对读屏隐藏；插槽内容由调用方自行决定语义 -->
        <span
          v-if="leadingIcon"
          :class="leadingIcon"
          class="md-list-item__leading-icon"
          aria-hidden="true"
        />
      </slot>
    </span>

    <span class="md-list-item__text">
      <span class="md-list-item__headline md-body-large">{{ headline }}</span>
      <span v-if="supporting" class="md-list-item__supporting md-body-medium">{{
        supporting
      }}</span>
    </span>

    <!-- 尾部区域：图标、开关、元信息等由调用方决定 -->
    <span v-if="$slots.trailing" class="md-list-item__trailing">
      <slot name="trailing" />
    </span>
  </component>
</template>

<style scoped>
.md-list-item {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-width: 0;
  padding: 0 16px;
  margin: 0;
  border: none;
  background: transparent;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-font-family);
  text-align: left;
  text-decoration: none;
  box-sizing: border-box;
}

/* ---------- 行数档位 ---------- */
.md-list-item--lines-1 {
  height: var(--md-comp-list-item-height);
}

.md-list-item--lines-2 {
  height: var(--md-comp-list-item-height-2);
}

.md-list-item--lines-3 {
  height: var(--md-comp-list-item-height-3);
  align-items: flex-start;
  padding-top: 12px;
  padding-bottom: 12px;
}

/* ---------- 交互态 ---------- */
.md-list-item--clickable {
  cursor: pointer;
  --md-state-layer-color: var(--md-sys-color-on-surface);
}

.md-list-item--disabled {
  cursor: not-allowed;
  opacity: var(--md-sys-state-disabled-opacity);
  /* 禁用时不再响应悬停/按下着色；原生 disabled 已阻止点击，这里只压掉反馈 */
  --md-state-layer-color: transparent;
}

/* ---------- 前置 ---------- */
.md-list-item__leading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--md-sys-color-on-surface-variant);
}

.md-list-item__leading-icon {
  width: 24px;
  height: 24px;
}

/* ---------- 文本 ---------- */
.md-list-item__text {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
}

.md-list-item__headline {
  color: var(--md-sys-color-on-surface);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.md-list-item__supporting {
  color: var(--md-sys-color-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 三行档位允许说明文字折行 */
.md-list-item--lines-3 .md-list-item__supporting {
  white-space: normal;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

/* ---------- 尾部 ---------- */
.md-list-item__trailing {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
  color: var(--md-sys-color-on-surface-variant);
}
</style>
