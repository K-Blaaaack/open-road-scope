# MD3 视觉体系与重构约定（newui-md3 分支）

本文件是本次全量重写的**唯一契约**。所有并行开发的子代理都必须先读本文件，再动代码。

## 0. 目标

把 `open-road-scope` 渲染层（`src/`）的全部界面按 **Material Design 3** 规范重写：

- 视觉：MD3 颜色角色 / 排版层级 / 形状 / 层级 / 状态层 / 动效曲线；
- 结构：MD3 组件（按钮、卡片、列表、开关、滑块、对话框、侧边面板、导航栏、提示条…）；
- 布局：自适应导航（底部导航条 / 导航栏 / 导航侧栏）、内容最大宽度、栅格与间距节奏；
- 功能：保留全部既有能力（连接、仪表盘拖拽缩放、诊断、设置、更新检查、引导、开发者菜单），并顺手修掉布局与交互缺陷。

分支：`newui-md3`（已创建，基线为 `main`）。

## 1. 分层与文件所有权

```
src/styles/md3/tokens.css     设计令牌（已完成，不要改）
src/styles/base.css           全局基础样式（已完成，不要改）
uno.config.ts                 原子类快捷方式（已完成，不要改）
src/directives/ripple.ts      MD3 水波纹（已完成，不要改）
src/i18n/index.ts             文案（已完成，不要改，缺键请回报）
src/components/md3/*.vue      MD3 组件库（按分工表认领）
src/components/dashboard/*    仪表盘卡片与图表
src/pages/*                   页面
src/App.vue                   应用外壳
```

**只改自己认领的文件。** 需要改别人的文件时，在交付说明里写清楚，不要直接改。

## 2. 设计令牌（只用这一层）

颜色角色（`var(--md-sys-color-*)`）：

`primary / on-primary / primary-container / on-primary-container`
`secondary / on-secondary / secondary-container / on-secondary-container`
`tertiary / on-tertiary / tertiary-container / on-tertiary-container`
`error / on-error / error-container / on-error-container`
`success / on-success / success-container / on-success-container`（扩展语义）
`warning / on-warning / warning-container / on-warning-container`（扩展语义）
`background / on-background / surface / on-surface`
`surface-variant / on-surface-variant`
`surface-dim / surface-bright`
`surface-container-lowest / -low / -container / -high / -highest`
`inverse-surface / inverse-on-surface / inverse-primary`
`outline / outline-variant / scrim / shadow`
`chart-line / chart-line-secondary / chart-grid / chart-axis / chart-area`（仅图表用）

排版（`var(--md-sys-typescale-{档位}-{size|line|weight|tracking}`），或直接用类名）：
`.md-display-large|medium|small`、`.md-headline-large|medium|small`、`.md-title-large|medium|small`、
`.md-body-large|medium|small`、`.md-label-large|medium|small`、`.md-mono`、`.md-selectable`

形状：`--md-sys-shape-corner-{none|extra-small|small|medium|large|extra-large|full}`（4/8/12/16/28/9999）
层级：`--md-sys-elevation-level0..5`
状态层：`.md-state-layer` + `--md-state-layer-color`（悬停 8% / 聚焦 10% / 按下 10%）
动效：`--md-sys-motion-duration-{short1..4|medium1..4|long1..4}`、`--md-sys-motion-easing-{standard|emphasized|standard-decelerate|standard-accelerate|emphasized-decelerate|emphasized-accelerate|linear}`
组件尺寸：`--md-comp-*`（按钮 40、图标按钮 40、FAB 56、开关轨道 52×32、顶栏 64、导航栏 80、导航侧栏 80/240、列表项 56/72/88、对话框 560、侧边面板 360）
层级顺序：`--md-sys-z-{appbar|nav|fab|scrim|dialog|onboarding|snackbar}`

**禁止**写死颜色（`#38bdf8`、`rgba(148,163,184,…)` 之类），禁止引用已删除的旧变量 `--color-*`。

## 3. 编码规范（硬性）

1. 注释一律中文；对外方法写 JSDoc（`@param 名 - 说明`、`@returns 说明`），只在「为什么」不显然处写。
2. Prettier：双引号、分号、**100 列**、尾随逗号。提交前只对自己改的文件跑：
   `npx prettier --write <你的文件…>`
3. 组件用 `<script setup lang="ts">`，**显式 import**（不要依赖自动导入），样式用 `<style scoped>`。
4. UI 文案**不得硬编码**，一律 `t("…")`；`useI18n()` 取 `t`。现有键不够时在交付说明里列出需要的键与中英文案，不要自行改 `src/i18n/index.ts`。
5. 图标沿用 `i-lucide-*`（`<span class="i-lucide-x h-4 w-4" />`，纯装饰加 `aria-hidden="true"`）。
6. 交互控件必须有可访问名称（`aria-label` 或可见 label）、可键盘操作、可见焦点环（全局 `:focus-visible` 已提供，不要覆盖成 none）。
7. 不引入新依赖；不写 `any`（确实需要时用 `unknown` + 收窄）。
8. 保留既有业务逻辑（store 调用、持久化、路由、i18n key），只重写呈现与交互细节。

## 4. MD3 组件契约

所有组件放 `src/components/md3/`，文件名 `MdXxx.vue`。props/emits 名固定如下，**不得改名**（页面按此契约调用）。

| 组件                                                    | props                                                                                                                                                                       | emits / slots                                         |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `MdButton.vue`（已完成，样板）                          | `variant: filled\|tonal\|outlined\|text\|elevated`、`size: sm\|md\|lg`、`type`、`disabled`、`icon`、`trailingIcon`、`block`                                                 | `click`；默认插槽=文字                                |
| `MdIconButton.vue`                                      | `icon`(必填)、`label`(必填, aria-label)、`variant: standard\|filled\|tonal\|outlined`、`size: sm\|md`、`selected`、`toggle`、`disabled`                                     | `click`                                               |
| `MdFab.vue`                                             | `icon`、`label`、`variant: primary\|secondary\|tertiary\|surface`、`size: sm\|md\|lg`、`extended`、`disabled`                                                               | `click`；默认插槽=扩展态文字                          |
| `MdSwitch.vue`                                          | `modelValue`、`label`、`disabled`                                                                                                                                           | `update:modelValue`、`change`                         |
| `MdSlider.vue`                                          | `modelValue`、`min`、`max`、`step`、`label`、`valueText`、`disabled`                                                                                                        | `update:modelValue`(拖动中)、`change`(松手提交)       |
| `MdTextField.vue`                                       | `modelValue`、`label`、`placeholder`、`type: text\|number\|password`、`supportingText`、`error`、`disabled`、`prefix`、`suffix`、`leadingIcon`、`inputmode`、`autocomplete` | `update:modelValue`、`enter`、`blur`                  |
| `MdSelect.vue`                                          | `modelValue`、`label`、`options: {value,label}[]`、`supportingText`、`disabled`                                                                                             | `update:modelValue`                                   |
| `MdSegmentedButton.vue`                                 | `modelValue`、`options: {value,label?,icon?}[]`、`disabled`、`fullWidth`                                                                                                    | `update:modelValue`                                   |
| `MdChip.vue`                                            | `label`、`variant: assist\|filter\|input\|suggestion`、`selected`、`icon`、`removable`、`disabled`                                                                          | `click`、`remove`                                     |
| `MdCard.vue`（已完成，样板）                            | `variant: elevated\|filled\|outlined`、`padding: none\|sm\|md\|lg`、`layout: block\|column`、`shape: medium\|large\|extra-large`、`interactive`                             | 默认插槽                                              |
| `MdListItem.vue`                                        | `headline`、`supporting`、`lines: 1\|2\|3`、`leadingIcon`、`clickable`、`disabled`                                                                                          | `click`；`leading`/`trailing` 插槽                    |
| `MdDivider.vue`                                         | `inset`                                                                                                                                                                     | —                                                     |
| `MdDialog.vue`                                          | `modelValue`(开)、`headline`、`icon`、`iconTone: primary\|error\|warning\|tertiary`、`width: sm\|md`                                                                        | `update:modelValue`；`default`=正文、`actions`=按钮区 |
| `MdSideSheet.vue`                                       | `modelValue`、`headline`、`width`                                                                                                                                           | `update:modelValue`；`default`、`actions`             |
| `MdSnackbarHost.vue` + `src/composables/useSnackbar.ts` | `useSnackbar()` 返回 `{ show(message, {actionLabel?, onAction?, duration?}), dismiss() }`                                                                                   | 宿主挂 App 根部                                       |
| `MdProgress.vue`                                        | `type: linear\|circular`、`indeterminate`、`value`(0-100)、`label`                                                                                                          | —                                                     |
| `MdBadge.vue`                                           | `label`、`tone: primary\|secondary\|tertiary\|error\|success\|warning\|neutral`、`variant: filled\|tonal\|outlined`                                                         | —                                                     |
| `MdTopAppBar.vue`                                       | `title`、`subtitle`、`variant: small\|medium`、`elevated`                                                                                                                   | `leading`/`actions` 插槽                              |
| `MdNavRail.vue`                                         | `items: {path,icon,key}[]`、`expanded`                                                                                                                                      | 底部默认插槽                                          |
| `MdNavBar.vue`                                          | `items: {path,icon,key}[]`                                                                                                                                                  | —                                                     |

规格要点（务必按此实现）：

- 按钮家族：高度 40（sm 32 / lg 48），**全圆角**，label-large。
- 图标按钮：40×40（sm 32），全圆角；`standard` 选中态用 `secondary-container` 底 + `on-secondary-container` 图标。
- FAB：56×56、圆角 16、层级 3；sm 40×40 圆角 12；lg 96×96 圆角 28；扩展态高 56、左右 20、圆角 16、图标+label-large。
- 开关：轨道 52×32 全圆角；关闭：`surface-container-highest` 底 + `outline` 描边 + 手柄 `outline`；开启：`primary` 底 + 手柄 `on-primary`；手柄 24（未选中视觉 16，用 transform 缩放）；过渡 `emphasized`。
- 滑块：轨道 4 高，未激活 `surface-variant`、激活 `primary`；手柄 20，悬停加 4px 光环；整体命中高度 ≥ 40。
- 文本框（outlined）：高 56，1px `outline` → 聚焦 2px `primary`；label 用 `fieldset`+`legend` 实现缺口浮动；支持 `supportingText`/`error`。
- 选择框：外观同 outlined 文本框，原生 `<select>` 透明覆盖（`opacity:0` 绝对定位）保证移动端原生选择器与可访问性。
- 分段按钮：容器全圆角、1px `outline`、相邻项共用分隔线；选中项 `secondary-container` + 勾选图标（无 icon 时自动补 check）；高 40。
- 卡片：`elevated`=surface-container-low + level1；`filled`=surface-container-highest；`outlined`=surface + outline-variant 描边；圆角 12。
- 列表项：高 56/72/88（1/2/3 行），左右 16，headline body-large、supporting body-medium `on-surface-variant`；`clickable` 时加 `.md-state-layer` + `v-ripple`。
- 对话框：scrim `scrim` 32% 遮罩、面板 `surface-container-high`、圆角 28、level3、宽 320–560；Esc / 点遮罩关闭；打开时聚焦首个可聚焦元素。
- 侧边面板：右侧滑入、宽 360（`max-width: 88vw`）、左侧圆角 16、`surface-container-low`、头部标题 + 关闭图标按钮。
- 提示条：底部居中、`inverse-surface` 底、`on-inverse-surface` 文字、圆角 4（extra-small）、level3，4 秒自动消失，支持一个动作按钮（`inverse-primary`）。
- 顶栏：高 64（medium 112），`surface-container`，标题 title-large（medium 用 headline-small），`elevated` 时用 level2 代替底部描边。
- 导航栏（底部）：高 80，每项活动指示器 64×32 全圆角 `secondary-container`，图标 24，label-medium；激活文字 `on-surface`、未激活 `on-surface-variant`。
- 导航侧栏：宽 80 / 展开 240；每项活动指示器 56×32 全圆角；展开时图标+label-large 左对齐。
- 徽标：高 20、全圆角、label-small；`tonal` 用 `*-container` 底 + `on-*-container` 字。

所有可点击的 MD3 组件统一：`v-ripple` + `.md-state-layer`（`--md-state-layer-color` 取对应前景色）。

## 5. 页面重构要求

- 内容区统一 `md-page`（max-w-3xl）或仪表盘 `md-page-wide`（max-w-5xl）；间距 4/8/12/16/24 的 4dp 节奏。
- 设置类页面用「卡片 + 列表项 + 分割线」结构，标题用 title-medium，说明用 body-small `on-surface-variant`。
- 状态反馈用 `useSnackbar()` 替代 `window.alert`；破坏性操作（清故障码、开启实验特性、关闭开发者模式）用 `MdDialog` 二次确认。
- 危险操作按钮：`MdButton variant="filled"` 配 `error` 前景（在页面里用局部 class 覆盖背景为 `var(--md-sys-color-error)` / 文字 `on-error`），或 `variant="text"` + error 文字色。
- 保留所有既有 `t()` key 的语义；新增文案见第 3 节第 4 条。

## 6. 自检（交付前必须做）

```bash
npx prettier --write <你改的文件>
npx vue-tsc --noEmit -p tsconfig.web.json --composite false   # 只看自己文件的报错
npx eslint <你改的文件>
```

并行期间 `typecheck` 可能因别人尚未落地的文件报错——**只对自己认领的文件负责**，其余报错忽略并在交付说明里提一句。

## 7. 交付说明格式

结束时用 `send_message` 回报：

1. 改了哪些文件（路径）；
2. 每个文件做了什么（一两句）；
3. 需要别的代理配合的点（例如新增 i18n 键、需要页面接入的 prop）；
4. 自检结果（prettier/eslint/typecheck 是否干净）。
