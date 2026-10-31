<script setup lang="ts">
/**
 * MD3 文本框（outlined）
 *
 * 描边与 label 缺口用 fieldset + legend 实现：legend 天然把上边线切开，
 * label 常驻在缺口处（相当于 MD3 的浮动态），聚焦/有值都不会再发生位移，
 * 少一套动画状态，密集表单里也更稳定。
 * 描边 1px outline → 聚焦 2px primary；错误态整体换 error 色。
 */
import { computed, useId } from "vue";

const props = withDefaults(
  defineProps<{
    /** 当前值；number 类型输入同样以数字接收 */
    modelValue: string | number;
    /** 标签，同时作为无障碍名称 */
    label?: string;
    /** 占位提示（仅在空值时可见） */
    placeholder?: string;
    /** 输入类型 */
    type?: "text" | "number" | "password";
    /** 辅助说明，错误态自动换 error 色 */
    supportingText?: string;
    /** 错误态 */
    error?: boolean;
    /** 禁用 */
    disabled?: boolean;
    /** 前缀文本，如 http:// */
    prefix?: string;
    /** 后缀文本，如 ms */
    suffix?: string;
    /** 前置图标类名，如 i-lucide-search */
    leadingIcon?: string;
    /** 原生 inputmode，决定移动端键盘 */
    inputmode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
    /** 原生 autocomplete */
    autocomplete?: string;
  }>(),
  {
    label: undefined,
    placeholder: undefined,
    type: "text",
    supportingText: undefined,
    error: false,
    disabled: false,
    prefix: undefined,
    suffix: undefined,
    leadingIcon: undefined,
    inputmode: undefined,
    autocomplete: "off",
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "enter", event: KeyboardEvent): void;
  (e: "blur", event: FocusEvent): void;
}>();

/** 原生控件只认字符串，数字值统一转成字符串回显 */
const displayValue = computed(() => String(props.modelValue ?? ""));

/** 辅助说明的 id，供 aria-describedby 关联 */
const supportId = `md-field-support-${useId()}`;

/**
 * 把原生输入值抛给外层
 *
 * number 类型也抛字符串：原生控件给的就是字符串，是否转数字由调用方决定。
 * @param event - 原生 input 事件
 */
const onInput = (event: Event): void => {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
};

/**
 * 回车：抛给外层做提交/确认（不阻止默认行为，表单场景仍可正常 submit）
 * @param event - 原生 keydown 事件
 */
const onEnter = (event: KeyboardEvent): void => {
  emit("enter", event);
};

/**
 * 失焦：外层常用于做校验或回写
 * @param event - 原生 focus 事件
 */
const onBlur = (event: FocusEvent): void => {
  emit("blur", event);
};
</script>

<template>
  <div
    class="md-field"
    :class="{ 'md-field--error': error, 'md-field--disabled': disabled }"
    :data-type="type"
  >
    <div class="md-field__box">
      <span v-if="leadingIcon" :class="leadingIcon" class="md-field__leading" aria-hidden="true" />
      <span v-if="prefix" class="md-field__affix">{{ prefix }}</span>
      <input
        class="md-field__input"
        :type="type"
        :value="displayValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :inputmode="inputmode"
        :autocomplete="autocomplete"
        :aria-label="label"
        :aria-invalid="error || undefined"
        :aria-describedby="supportingText ? supportId : undefined"
        @input="onInput"
        @keydown.enter="onEnter"
        @blur="onBlur"
      />
      <span v-if="suffix" class="md-field__affix">{{ suffix }}</span>
      <fieldset class="md-field__outline" aria-hidden="true">
        <legend v-if="label" class="md-field__legend">
          <span class="md-field__legend-text">{{ label }}</span>
        </legend>
      </fieldset>
    </div>
    <p v-if="supportingText" :id="supportId" class="md-field__support">
      {{ supportingText }}
    </p>
  </div>
</template>

<style scoped>
.md-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* 预留 legend 浮出描边的上半截，父容器 overflow: hidden 时不会被切掉 */
  padding-top: 8px;
}

.md-field__box {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 56px;
  padding: 0 16px;
  border-radius: var(--md-sys-shape-corner-extra-small);
}

/* ---------- 描边与缺口 ---------- */
.md-field__outline {
  position: absolute;
  inset: 0;
  margin: 0;
  /* 左内边距 + legend 内边距 = 16，与 MD3 label 起点一致 */
  padding: 0 12px;
  min-width: 0;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-extra-small);
  pointer-events: none;
  transition:
    border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
    border-width var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}

.md-field__legend {
  padding: 0 4px;
  max-width: 100%;
  font-family: var(--md-sys-typescale-font-family);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line);
  font-weight: var(--md-sys-typescale-body-small-weight);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
  color: var(--md-sys-color-on-surface-variant);
  white-space: nowrap;
  transition: color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}

.md-field__legend-text {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}

/* ---------- 输入区 ---------- */
.md-field__input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-font-family);
  font-size: var(--md-sys-typescale-body-large-size);
  line-height: var(--md-sys-typescale-body-large-line);
  font-weight: var(--md-sys-typescale-body-large-weight);
  letter-spacing: var(--md-sys-typescale-body-large-tracking);
  /* 全局 body 关闭了文本选中，输入区必须开回来 */
  user-select: text;
}

.md-field__input::placeholder {
  color: var(--md-sys-color-on-surface-variant);
  opacity: 1;
}

/* MD3 文本框没有步进器，隐藏 WebKit 的数字上下箭头 */
.md-field__input::-webkit-outer-spin-button,
.md-field__input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  appearance: none;
  margin: 0;
}

/* 数字输入等宽，便于端口号、间隔这类读数对齐 */
.md-field[data-type="number"] .md-field__input {
  font-family: var(--md-sys-typescale-font-family-mono);
  font-variant-numeric: tabular-nums;
}

.md-field__affix {
  flex-shrink: 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-large-size);
  line-height: var(--md-sys-typescale-body-large-line);
  letter-spacing: var(--md-sys-typescale-body-large-tracking);
}

.md-field__leading {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: var(--md-sys-color-on-surface-variant);
}

/* ---------- 聚焦 ---------- */
/* 只加粗边框，不做位移补偿：fieldset 是绝对定位，外框尺寸不变 */
.md-field:focus-within .md-field__outline {
  border-width: 2px;
  border-color: var(--md-sys-color-primary);
}

.md-field:focus-within .md-field__legend {
  color: var(--md-sys-color-primary);
}

/* ---------- 错误态 ---------- */
.md-field--error .md-field__outline,
.md-field--error:focus-within .md-field__outline {
  border-color: var(--md-sys-color-error);
}

.md-field--error .md-field__legend,
.md-field--error:focus-within .md-field__legend,
.md-field--error .md-field__support {
  color: var(--md-sys-color-error);
}

/* ---------- 辅助说明 ---------- */
.md-field__support {
  margin: 0;
  padding: 0 16px;
  font-family: var(--md-sys-typescale-font-family);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line);
  font-weight: var(--md-sys-typescale-body-small-weight);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
  color: var(--md-sys-color-on-surface-variant);
}

/* ---------- 禁用态 ---------- */
.md-field--disabled .md-field__outline {
  border-color: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
}

.md-field--disabled .md-field__legend,
.md-field--disabled .md-field__affix,
.md-field--disabled .md-field__leading,
.md-field--disabled .md-field__support {
  color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
}

.md-field--disabled .md-field__input {
  color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
  cursor: not-allowed;
}

.md-field--disabled .md-field__input::placeholder {
  color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
}
</style>
