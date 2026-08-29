<script setup lang="ts">
/**
 * 通用开关：配色走 CSS 变量随主题切换，滑块用 transform 位移保证过渡顺滑。
 *
 * 两种用法：
 * - `v-model="值"`：直接切换
 * - `:model-value="值" @toggle="处理器"`：需要二次确认等场景由外部接管
 */
const props = defineProps<{
  /** 开关状态 */
  modelValue: boolean;
  /** 无障碍标签 */
  label?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "toggle"): void;
}>();

const onClick = (): void => {
  if (props.disabled) return;
  // 先更新值再抛 toggle，便于外层在 toggle 里做持久化等后续动作
  emit("update:modelValue", !props.modelValue);
  emit("toggle");
};
</script>

<template>
  <button
    type="button"
    class="switch-track"
    :class="modelValue ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-switch-off)]'"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    @click="onClick"
  >
    <span class="switch-knob" :class="modelValue ? 'translate-x-5' : 'translate-x-0'" />
  </button>
</template>
