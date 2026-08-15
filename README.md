# OpenRoadScope

基于 OBD-II（ELM327）的跨平台行车数据可视化软件。实时读取车辆传感器数据，提供可自定义的仪表盘布局、历史曲线与故障诊断能力。

## 功能

- **实时数据**：通过 ELM327 适配器（USB / 蓝牙 SPP / RJ45 网络）读取车速、转速、水温、油耗等 OBD-II 传感器数据
- **自定义仪表盘**：卡片化布局（折线图 / 柱状图 / 数值），支持编辑模式自由拖拽、缩放、预设与导入导出
- **故障诊断**：读取 / 清除故障码（DTC）、读取 VIN
- **多语言**：简体中文 / English
- **主题**：深色 / 浅色模式切换
- **模拟模式**：无实车环境下内置驾驶仿真，可直接开发与演示

## 架构

```
ELM327（USB / 蓝牙 / RJ45）
      ↓
Python sidecar（python-OBD 采集，stdio JSON-RPC）
      ↓
Electron 主进程（进程管理 / IPC）
      ↓
渲染进程（Vue 3 + Pinia + 自定义仪表盘）
```

- 数据采集由 Python sidecar（`sidecar/`）承担，通过 stdio JSON-RPC 与主进程通信
- 三层架构：主进程（`electron/`）/ 预加载 contextBridge / 渲染进程（`src/`）
- 共享契约位于 `shared/`

## 开发

```bash
# 安装依赖
pnpm install
cd sidecar && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"

# 启动开发（默认模拟模式）
pnpm dev
```

测试：`pnpm test:all`（web + node + sidecar）

## 打包

```bash
pnpm build:sidecar   # PyInstaller 打包 sidecar
pnpm build:linux     # 或 build:win / build:mac
```

## 许可证

本软件以 **GNU General Public License v2.0（GPL-2.0）** 发布，全文见 [LICENSE](./LICENSE)。

数据采集由 Python sidecar 承担（依赖 [python-OBD](https://github.com/brendan-w/python-OBD)，GNU GPL v2），随软件整体分发。使用、修改与再分发请遵守 GPL-2.0 条款。

```
Copyright (C) 2026 OpenRoadScope contributors

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.
```
