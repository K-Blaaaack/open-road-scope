# 桌面架构构建

核实日期：2026-11-15。Electron 43.2.0、electron-builder 26.15.3、electron-updater 6.8.9、PyInstaller 6.22.3。

## 平台与发行物

| 应用目标            | CI runner      | Node / Python / sidecar | 发行格式                   |
| ------------------- | -------------- | ----------------------- | -------------------------- |
| Windows x64         | windows-2025   | x64                     | NSIS、便携版、MSI          |
| Windows ARM64       | windows-11-arm | arm64                   | NSIS、便携版               |
| macOS Apple Silicon | macos-15       | arm64                   | DMG、ZIP                   |
| macOS Intel         | macos-15-intel | x64                     | DMG、ZIP                   |
| Linux x64           | ubuntu-24.04   | x64                     | AppImage、deb、rpm、tar.gz |

Windows ARM64 的 Electron 和 sidecar 均使用原生 ARM64。PyInstaller [5.7.0 变更记录](https://pyinstaller.org/en/v6.22.3/CHANGES.html) 已记录 Windows 原生 ARM 支持（#7257）；[6.22.3 稳定版说明](https://github.com/pyinstaller/pyinstaller/blob/v6.22.3/README.rst)明确列出 Windows ARM64。本次下载 [PyPI 6.22.3](https://pypi.org/project/pyinstaller/6.22.3/#files) 的 `pyinstaller-6.22.3-py3-none-win_arm64.whl` 并校验 SHA-256，四个 bootloader 的 PE Machine 均为 `0xaa64`。wheel SHA-256：`31df3cc4261e804a53d358b7897c293ec8b88b167a7cca06c78018085c855f97`。

此次方案未采用 x64 sidecar 仿真。Microsoft [Windows on Arm 文档](https://learn.microsoft.com/en-in/windows/arm/apps-on-arm-x86-emulation)说明 Windows 11 支持 x64 用户态仿真，但驱动仍须为 ARM64。USB/蓝牙串口设备在 Windows ARM64 下仍需可用的原生 ARM64 驱动，网络连接与模拟模式不依赖这些串口驱动。

builder 26.15.3 的 `MsiTarget` 使用 WiX 4.0.0.5512.2，将 ARM64 目标映射为 x64 安装器包装。为准确表达支持，本项目的 ARM64 发行任务仅生成 NSIS、便携版，打包钩子会拦截 ARM64 MSI；NSIS 安装器自身的引导程序架构与 Electron/sidecar 载荷架构是不同概念。

## CI 实测（2026-11-15，run 43703983808）

`release.yml` 的五个桌面矩阵全部成功，其中两条关键证据来自真实日志：

```text
Build windows-arm64  构建并实跑原生 sidecar  [build-sidecar] win32/arm64，PyInstaller 6.22.3
Build windows-arm64  打包发行物            [desktop] 包内 Electron 与 sidecar 已验证：win32/arm64
Build macos-x64      打包发行物            [desktop] 包内 Electron 与 sidecar 已验证：darwin/x64
```

产物体积（artifacts）：windows-arm64 198MB、macos-x64 253MB、macos-arm64 250MB、windows-x64 331MB、linux-x64 511MB、android 6.2MB。该次运行同时暴露并已修复两个问题：冻结 sidecar 在 stdin EOF 后与守护线程争用 stdout 缓冲锁导致退出码非 0；鸿蒙资源校验步骤用 `require` 读取 `.json5`。修复后 CI run 43704533456 全绿。

发布步骤（`gh release create/upload/edit`）尚未对真实 tag 执行，仅由 `scripts/ci/workflow.test.ts` 校验其存在与参数形态；预发布判定与 SHA-256 生成在本地脚本中已覆盖。

## 本地构建

PyInstaller 使用当前平台的解释器及依赖。为每个架构单独创建虚拟环境，并安装：

```text
python -m venv sidecar/.venv
<该环境的python> -m pip install -e "sidecar/[dev]" pyinstaller==6.22.3
```

Windows 环境解释器为 `sidecar/.venv/Scripts/python.exe`，macOS/Linux 为 `sidecar/.venv/bin/python`。Windows ARM64 必须使用原生 ARM64 Python；Intel Mac 使用 x64 Python。CI 固定 Python 3.13 并显式指定 architecture。

```text
pnpm build
pnpm build:sidecar --arch arm64
pnpm exec electron-builder --config electron-builder.config.ts --win nsis portable --arm64 --publish never

pnpm build
pnpm build:sidecar --arch x64
pnpm exec electron-builder --config electron-builder.config.ts --mac dmg zip --x64 --publish never
```

上述两组分别在对应目标系统上执行。可通过 `--python "包含空格的完整解释器路径"` 或 `SIDECAR_PYTHON` 指定虚拟环境。参数按数组传递，复制使用 Node `copyFileSync`，不依赖 Windows 中的 `cp` 命令。

构建先检查解释器的平台、位宽、进程架构和 PyInstaller 版本，再检查产物 PE/Mach-O/ELF 头，运行冻结 sidecar 的模拟 `ping`，最后复制到资源目录。Windows 解释器架构采用 `sysconfig.get_platform()`，避免把仿真进程的宿主机名称当作解释器架构。macOS 显式传递 `--target-arch`。每个架构使用单独 PyInstaller 中间目录，但最终资源路径相同，因此同一个工作区按架构顺序打包；CI 各架构在独立 runner 执行。

builder 的 beforePack 会重新检查资源，afterPack 检查包内 sidecar 和 Electron 本体，错误架构或跨平台遗留文件会停止打包。打包钩子只接受单架构产物。

## 更新元数据

`normalize-artifacts.ts` 将对外文件名的 x64 改为 x86_64（deb 目标的 Debian 架构名 `-amd64` 同样改写为 `-x86_64`，只影响文件名与元数据引用），同步更新所有 channel（包含预发布）的 `files[].url` 和旧版 `path`。安装器和 blockmap 同时改名，文件摘要保持不变，releaseNotes 等正文保持原样。

`download-artifact` 使用 `merge-multiple: false` 保留各架构目录。`merge-update-metadata.ts` 在复制前检查文件摘要、大小、同名冲突、版本与其他公共字段，然后合并同名 YAML 的 files。Windows 与 macOS 的不同架构元数据分别汇入同一 channel，ZIP 优先，x64 在 ARM64 之前，旧版 path/sha512 指向首项。

排序按「electron-updater 可直接安装的格式优先」：zip → AppImage → exe/msi → dmg → deb → rpm，同一格式内 x64 在前、arm64 在后。因此 Linux 的旧版 `path` 回退指向 AppImage，而不是 updater 无法安装的 deb。

这一顺序与 electron-updater 6.8.9 的行为对应：Windows 根据 process.arch 优先选择文件，ARM64 匹配文件名；归一化后的 x86_64 名称不含 x64，因此 x64 回退的首项必须是 x64。macOS 另有 Apple Silicon/Rosetta 架构过滤。测试直接调用所安装 updater 的选包函数，覆盖四种桌面架构。

```text
pnpm exec tsx scripts/normalize-artifacts.ts dist
pnpm exec tsx scripts/merge-update-metadata.ts release-downloads release-assets
pnpm exec tsx --test "scripts/desktop/*.test.ts"
```

HarmonyOS 的 CI job 只构建并同步 ArkWeb 资源，不产生 HAP，也不将 Web 目录混入桌面发布资产。

## 已验证与待验收

本机 Linux x64 已实跑 PyInstaller 6.22.3 打包（Python 3.14.9），解释器、源码和产物路径均包含空格；冻结 sidecar 模拟 ping 与 `--list-ports` 返回成功。CLI 在把 x64 Python 指向 ARM64 目标时按预期退出。Node 类型检查、桌面 ESLint、真实 builder 配置加载及 schema 校验、架构与多架构更新回归均通过。

macOS 产物**未签名、未公证**：CI 没有配置 Developer ID 证书与公证凭据，`CSC_LINK`/`CSC_KEY_PASSWORD`/`APPLE_ID` 均未设置。用户需要右键打开或移除隔离属性，自动更新也可能被 Gatekeeper 拦截。发布说明里已固定附带该限制。Windows ARM64/x64、macOS ARM64/x64 的安装器安装动作本会话未实测（构建已在 CI 完成）；CI 已配置独立 runner 和冻结 sidecar 冒烟。macOS 签名、公证、自动更新安装与真实 OBD 设备通讯仍需对应系统、证书及硬件验收。本次未发起 CI 发布、git commit 或 push。

## 交接记录

新增 package scripts 由 lead 统一维护：`test:desktop` 调用桌面脚本测试；`build:win:arm64` 显式选择原生 sidecar 和 NSIS/portable；`build:mac:x64` 与 `build:mac:arm64` 显式选择匹配架构。直接开发依赖为 `js-yaml` 与 `@types/js-yaml`，沿用项目现有 YAML 实现。

决策：使用已发布的原生 ARM64 bootloader，避免引入仿真 sidecar；以实际机器码校验取代只信构建参数；分目录下载后合并更新元数据，避免覆盖。若升级 builder/updater 或改变产物命名，重新运行真实 updater 选包回归；WiX 原生 ARM64 支持经上游和实际构建验证后再扩大 MSI 目标。
