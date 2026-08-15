# 代码规定

## 注释

- 一律使用中文注释。
- 方法使用 JSDoc：`@param 名 - 说明`、`@returns 说明`。
- 仅在「为什么」不明确处写注释，避免噪音注释。

## 格式

- 遵循 Prettier 配置（双引号、分号、100 列、尾随逗号）。
- 提交前运行 `pnpm format`。

## 类型检查

- 提交前确保 `pnpm typecheck` 与 `pnpm lint` 通过。

## 提交信息

- 使用常规提交格式：`<类型>: <中文摘要>`。
- 标题保持单行，无特殊说明不附正文。
- 类型按顺序选择：feat、fix、refactor、perf、docs、test、build、ci、style、chore。

## 国际化

- 本项目使用 vue-i18n 进行国际化，UI 文案不得硬编码。

## 结构

- 三层架构：主进程（electron/）/ 预加载（preload contextBridge）/ 渲染进程（src/）。
- 共享契约放 shared/，由主进程与渲染进程共同引用。
- OBD 数据采集由 Python sidecar（sidecar/）承担，主进程通过 stdio JSON-RPC 通信。
