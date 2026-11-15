<p align="center">
  <img src="assets/logo.svg" width="96" alt="OpenRoadScope" />
</p>

# OpenRoadScope

基于 OBD-II（ELM327）的跨平台行车数据可视化软件。实时读取车辆传感器数据，提供可自定义的仪表盘布局、历史曲线与故障诊断能力。

## 功能

- **实时数据**：通过 ELM327 适配器（USB / 蓝牙 SPP / RJ45 网络）读取车速、转速、水温、油耗等 OBD-II 传感器数据
- **采样间隔可调**：设置页可调读取间隔 100–2000 ms（步进 50 ms，默认 200 ms），改动即时重订阅生效；实际每 PID 刷新率仍受适配器吞吐限制，约等于 max(设定间隔, PID 数 × 单次往返耗时)
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
- Android（`android/`）以原生 WebView 承载渲染层，由 Java 提供蓝牙 SPP / USB 串口 / 网络传输；响应按字节读取并以 CR/LF 或 `>` 提示符切行，避免适配器不发送换行时阻塞
- HarmonyOS NEXT（`harmonyos/`）使用 ArkWeb + ArkTS Worker，通过 Network Kit TCP 连接 Wi-Fi / 局域网 ELM327；当前不含 USB 串口和蓝牙 SPP
- 两个移动端共用 TypeScript ELM327 协议引擎和 `ObdApi` 契约，不使用 Python sidecar；异步命令串行执行，断开或切换连接时取消旧采样

## 开发

```bash
# 安装依赖
pnpm install
cd sidecar && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"

# 启动开发（默认模拟模式）
pnpm dev
```

测试：`pnpm test:all`（Web + Node + 桌面构建脚本 + sidecar + HarmonyOS 传输逻辑）；sidecar 测试自动选择 Windows 或 macOS/Linux 的虚拟环境解释器。

品牌图标：`pnpm gen:icons` 从 `scripts/gen-icons.ts` 中的单一字形定义生成全套产物（桌面 `build/icon.*`、安卓启动器图标与启动图、Web favicon 与 PWA 图标、仓库 `assets/logo.svg`），依赖 `rsvg-convert` 与 ImageMagick。

## 版本发布

版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)（vX.Y.Z），由提交信息（[Conventional Commits](https://www.conventionalcommits.org/zh-hans/)）自动计算：

```bash
pnpm release:dry        # 预览将要产生的版本号与变更
pnpm release            # 更新版本号 + 生成 CHANGELOG.md + 打 tag（如 v0.2.0）
pnpm release:push       # 推送提交与 tag，触发 CI 自动构建并发布 Release
```

版本规则：

| 提交类型                     | 版本变化               |
| ---------------------------- | ---------------------- |
| `feat:`（新功能）            | minor（0.1.0 → 0.2.0） |
| `fix:`（修复）               | patch（0.1.0 → 0.1.1） |
| `feat!:` / `BREAKING CHANGE` | major（0.1.0 → 1.0.0） |
| 其他（docs/chore/ci...）     | 不产生新版本           |

> 注意：`release` 会基于 **最后一个版本 tag 之后** 的提交计算版本，且要求提交信息符合常规提交格式。

## 持续集成与自动发布

| 工作流                                       | 触发                    | 内容                                                                                                            |
| -------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| [ci.yml](.github/workflows/ci.yml)           | 任意分支推送、PR、手动  | 质量门禁（lint / typecheck / 五套测试）→ 桌面+Web+安卓+鸿蒙资源构建 → sidecar 冻结构建 → 调试 APK               |
| [release.yml](.github/workflows/release.yml) | `v*` tag 推送、手动派发 | 复用同一质量门禁 → 五架构桌面打包 + Android APK + 鸿蒙资源校验 → 合并多架构更新元数据 → GitHub CLI 创建 Release |

发布流程的要点：

- **质量门禁先行**：`check` job 通过后才进入任何打包；任一平台构建失败都不会产生 Release（`publish` 显式检查三个上游 job 的结果）。
- **多架构产物不互相覆盖**：各架构在独立 runner 构建，`download-artifact` 保留子目录，发布前用 `merge-update-metadata.ts` 校验 SHA-512 并合并同名 channel 文件。
- **发布由 GitHub CLI 完成**：`gh release create` / `gh release upload` / `gh release edit`，同时生成 `SHA256SUMS.txt` 并在 job summary 中回读产物清单；预发布 tag（含 `-`）标记为 prerelease，不推送给稳定版用户。
- **可手动重跑任一范围**：`workflow_dispatch` 提供 `tag`、`platforms`（all/desktop/android/harmonyos）、`publish` 三个输入，便于只重打某个平台或补发产物。

用 GitHub CLI 在本地触发构建与发布（需要 `gh auth login`）：

```bash
pnpm ci:build                                   # 派发全平台构建并跟踪结果（不发布）
pnpm ci:build -- --platforms desktop --no-wait   # 只打包桌面端，派发后立即返回
pnpm ci:release -- --tag v0.3.0                  # 构建并创建/更新同 tag 的 Release
```

`ci:release` 会先校验该 tag 已存在于远端，再派发并 `gh run watch` 跟踪；也可以直接用原生命令：

```bash
gh workflow run release.yml --ref main -f platforms=desktop
gh run list --workflow release.yml --limit 3
gh run watch <run-id> --exit-status
```

本地等价校验：`pnpm test:ci` 会解析两个工作流，检查 job 依赖、runner 标签、action 版本锁定、ARM64/Intel 矩阵以及「发布必须走 GitHub CLI」等约束。

## 平台支持

| 平台                              | 架构与发行格式                          | 构建命令 / 能力                                                                |
| --------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| Windows x64                       | NSIS / portable / MSI                   | `pnpm build:win:x64`；USB / 蓝牙串口 / TCP                                     |
| Windows ARM64                     | 原生 ARM64 NSIS / portable              | `pnpm build:win:arm64`；Electron 与 sidecar 均为 ARM64；MSI 暂不提供           |
| macOS Intel                       | x86_64 DMG / ZIP                        | `pnpm build:mac:x64`；ZIP 用于自动更新                                         |
| macOS Apple Silicon               | ARM64 DMG / ZIP                         | `pnpm build:mac:arm64`                                                         |
| Linux                             | AppImage / deb / rpm / snap / tar.gz    | `pnpm build:linux`；CI 发布 x86_64                                             |
| Android                           | APK（arm64-v8a / armeabi-v7a / x86_64） | `pnpm build:android` / `pnpm build:android:release`；USB / 蓝牙 SPP / TCP      |
| HarmonyOS NEXT 5.0+（API 12）     | ArkTS 原生 HAP 工程                     | `pnpm build:harmonyos`；TCP 网络适配器与模拟模式；HAP 由 DevEco SDK 构建和签名 |
| 兼容 Android APK 的旧版 HarmonyOS | 使用 Android APK                        | 按设备 Android 兼容能力安装对应架构 APK；不等同于 NEXT HAP                     |

桌面必须使用**目标系统和架构的 Python**构建 sidecar。Windows ARM64 使用 ARM64 Node/Python；Intel Mac 使用 x64 Node/Python。PyInstaller 固定为 `6.22.3`，脚本在构建前检查 Python 架构、构建后检查 PE / Mach-O / ELF 文件头并实跑模拟 ping，打包时再检查 Electron 与 sidecar 架构。安装命令：`python -m pip install -e "sidecar/[dev]" pyinstaller==6.22.3`（使用目标架构的虚拟环境解释器）。

可以通过 `SIDECAR_PYTHON` 或 `pnpm build:sidecar --python <解释器路径> --arch <x64|arm64>` 显式指定解释器；`--arch` 是校验目标，不会把另一种架构的 Python 交叉编译成目标架构。串口连接还取决于适配器驱动，Windows ARM64 尤其需要匹配的 ARM64 驱动。

CI 分别在 Windows x64 / ARM64、macOS ARM64 / Intel、Linux x64 runner 构建，发布前显式合并各架构的更新元数据并校验 SHA-512，避免同名 channel 文件覆盖。Windows ARM64 暂使用 NSIS / portable，因为当前 electron-builder 的 WiX MSI 包装仍是 x64。

## 打包

```bash
pnpm build:sidecar      # 先构建当前平台的 sidecar
pnpm build:linux        # 构建 Linux 全目标（AppImage + deb + rpm + snap + tar.gz）
pnpm build:win          # 构建 Windows 全目标（NSIS + portable + MSI）
pnpm build:mac          # 构建 macOS 全目标（DMG + ZIP）
# 也可按需指定单一格式，如 pnpm build:linux:deb
```

目标格式构建依赖对应平台工具链（deb/rpm 需 fpm、snap 需 snapcraft、MSI 需 WiX、macOS 需在 macOS 上构建）。`build:win` / `build:mac` 默认选择当前 Node 架构；需要明确架构时使用上表命令。

### HarmonyOS NEXT

```bash
pnpm prepare:harmonyos  # 构建单脚本 Web 资源、同步 rawfile，并从 package.json 同步版本
pnpm test:harmonyos    # Node 下验证 ArkTS 传输逻辑（不替代 SDK 编译）
pnpm build:harmonyos   # prepare + 调用已安装的 DevEco hvigorw 构建 debug HAP
```

安装 DevEco Studio 5.0+ 与 HarmonyOS API 12 SDK，然后打开 `harmonyos/`。命令行构建需把 DevEco 的 `hvigorw` 放到 PATH，或设置 `HVIGOR_CLI` 为其 `hvigorw.js` 绝对路径。也可运行 `pnpm prepare:harmonyos` 后直接在 DevEco 中构建，真机安装前配置本机签名。工程不包含签名凭据。

Web 资源通过 `resource://rawfile/web/index.html` 加载，使用相对资源路径、单个普通脚本及 hash 路由，不依赖远程页面或 ES module 跨源加载。原生桥仅允许本地入口使用，TCP 在 Worker 执行；后台或异常断线会关闭连接并停止采样，回到前台后手动重新连接。

连接时让设备与 ELM327 TCP 适配器处于可互通网络，在连接页填写地址与端口（常见端口 `35000`，以适配器说明为准）。模拟模式入口沿用设置页的开发者模式。协议引擎沿用移动端 CAN 能力，不包含所有 python-OBD 协议与冻结帧功能。详细工程结构及验证方式见 [HarmonyOS 工程说明](harmonyos/README.md)。

### 发布前的已知限制

每个 Release 的说明都会自动附带 [已知限制](docs/release-known-issues.md)，要点：

- **macOS 未签名、未公证**：DMG / ZIP 都需要右键打开或 `xattr -dr com.apple.quarantine /Applications/OpenRoadScope.app`；未配置 Developer ID 时 `spctl` 校验与自动更新都可能被系统拦截。
- **HarmonyOS NEXT 未真机实测**：只交付工程与 Web 资源校验，不发布 HAP；ArkTS 编译、签名、ArkWeb 权限与 Worker 时序、TCP 适配器连接都需在 DevEco + 真机完成，且当前不含 USB / 蓝牙 SPP。
- **Windows ARM64 无 MSI**：WiX 包装仍是 x64；USB / 蓝牙需要 ARM64 驱动。
- **Android APK 使用调试签名**：仅供内部测试与侧载。
- **未连接真实车辆**：协议与传输逻辑有自动化测试，实车读数仍需自行验证。

本次自动化验证覆盖共享协议/桥接、订阅生命周期、桌面构建架构与更新元数据，以及原生 TCP 逻辑。CI 的 HarmonyOS job 仅构建并同步 Web 资源；HAP SDK 编译、签名、ArkWeb 真机加载与实车连接仍需在 DevEco 和设备上验收。Windows ARM64 / Intel Mac 安装器也需对应 runner 与实机验证。

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
