# HarmonyOS NEXT 原生工程

本目录为 OpenRoadScope 的 Stage / ArkTS / ArkWeb 容器，工程版本固定为 **HarmonyOS 5.0.0（API 12）**，`modelVersion` 为 `5.0.0`。使用 DevEco Studio 5.0.x 和对应 API 12 SDK，或可安装该 SDK 的后续 DevEco 版本。API 12 是本工程明确的兼容基线；官方已将该版本文档归档，它不代表当前最新 SDK。

本次支持网络 TCP ELM327 和 Web 侧模拟模式。原生侧只提供 TCP，USB、经典蓝牙 SPP 没有实现；`listPorts` 返回空数组。模拟模式由共享 Web 应用实现，无需建立原生连接。

## 构建 HAP

先在仓库根目录安装前端依赖并准备资源：

```bash
pnpm install --frozen-lockfile
pnpm prepare:harmonyos
```

准备命令先构建 HarmonyOS 专用 Web 产物，再同步到 `entry/src/main/resources/rawfile/web/`。该目录是生成物，不跟踪占位 `index.html`。同步同时把根 `package.json` 的版本写入 `AppScope/app.json5`；版本号计算规则是 `major * 1000000 + minor * 1000 + patch`，预发布后缀保留在 `versionName`。该配置保留合法 JSON 子集供脚本读取。

使用 DevEco Studio 打开本目录，等待工程同步，确认 SDK 为 `5.0.0(12)`。在 Build 菜单执行 **Build Hap(s)/APP(s) → Build Hap(s)**。如需安装真机，使用 DevEco 的本地自动签名配置；仓库不包含签名材料或个人路径。调试 HAP 输出位于 `entry/build/default/outputs/default/`。

已配置命令行工具时，在仓库根目录执行：

```bash
pnpm build:harmonyos
```

该脚本最终在本目录运行以下命令；`HVIGOR_CLI` 可指向本机 DevEco 随附的 `hvigorw.js`，否则使用 PATH 内的 `hvigorw`：

```bash
hvigorw assembleHap --mode module -p product=default -p module=entry@default -p buildMode=debug --no-daemon
```

SDK、Hvigor、OHPM 由 DevEco 提供。本工程不附带伪造的 wrapper/JAR，也不会通过普通 npm 安装替代 HarmonyOS SDK。`signingConfigs` 初始为空；本地签名配置与生成的凭据请保持在本机。

## Web 与原生契约

网页从 `resource://rawfile/web/index.html` 加载，使用哈希路由。HarmonyOS 专用 Vite 配置输出单脚本 IIFE、合并 CSS 和内联动态导入，使用相对资源路径，避开本地协议 ES module 加载差异。

Web 调用入口：

```javascript
window.harmonyObd.call(id, method, JSON.stringify(params));
```

`id` 是唯一正安全整数。原生入口立即返回，网络操作由 `entry/ets/workers/TcpWorker.ets` 执行，Worker 已在模块 `build-profile.json5` 的 `buildOption.sourceOption.workers` 注册。异步结果通过 `WebviewController.runJavaScript` 调用：

```javascript
window.__harmonyObdReceive({ id, ok: true, result });
window.__harmonyObdReceive({ id, ok: false, error: "NOT_CONNECTED" });
```

| method      | params                                     | 成功 result                       |
| ----------- | ------------------------------------------ | --------------------------------- |
| `open`      | `{type:"tcp",target:"192.168.0.10:35000"}` | `true`                            |
| `close`     | `{}`                                       | `null`                            |
| `write`     | `{line:"010C"}`                            | `null`                            |
| `readLine`  | `{timeoutMs:120}`                          | 一行字符串、`">"` 或短超时的 `""` |
| `listPorts` | `{}`                                       | `[]`                              |

目标支持 IPv4、主机名以及 `[IPv6]:port`；主机名先经 `connection.getAddressesByName` 解析。Wi-Fi OBD 适配器建议填写其本地 IP；设备系统选择的网络路由仍需真机验证。

`write` 只接收最长 1024 字符的可打印 ASCII，原生追加且仅追加一个 `\r`；含 CR/LF 的参数返回错误。`readLine` 按 CR/LF 分行，跳过空行；无尾随换行的 `>` 也会独立返回。短超时保留未完成行，并返回成功的空字符串，由 Web 侧 ELM327 控制命令总超时。读缓存上限 65536 字节，超限关闭连接并让挂起读取以 `BUFFER_OVERFLOW` 结束。

连接超时 8 秒，写入超时 5 秒。单次读超时范围 1–60000 毫秒，默认 1000 毫秒；同一时刻允许一次读取和一次写入，另一个同类调用返回 `READ_IN_PROGRESS` 或 `WRITE_IN_PROGRESS`。重复请求 ID 被忽略，保留原调用的一次响应；主线程最多保留 32 个挂起调用。

原生实际错误码：`INVALID_REQUEST`、`INVALID_PARAMS`、`UNSUPPORTED_METHOD`、`UNSUPPORTED_TRANSPORT`、`INVALID_TARGET`、`NOT_CONNECTED`、`CONNECT_IN_PROGRESS`、`READ_IN_PROGRESS`、`WRITE_IN_PROGRESS`、`DISCONNECTED`、`TCP_CONNECT_FAILED`、`TCP_WRITE_FAILED`、`TCP_CLOSE_FAILED`、`BUFFER_OVERFLOW`、`WORKER_FAILED`、`APP_BACKGROUND`、`BRIDGE_BUSY`、`WRITE_TIMEOUT`。这些是稳定机器码，用户文案由共享 Web 的 i18n 映射。

## 生命周期与页面边界

后台、窗口销毁、Ability 销毁、页面重新加载会结束当前 socket 会话和挂起读取。后台时先用 `APP_BACKGROUND` 结束挂起 RPC，再通知已请求连接的页面：

```javascript
window.__harmonyObdReceive({ event: "disconnected" });
```

远端关闭、socket 故障、缓冲溢出、Worker 故障也会发该事件；主动 `close` 和替换连接不发事件。恢复前台不自动重连。主线程先要求 Worker 清理 socket，最长 1.5 秒后终止未退出的 Worker；旧 Worker 回调按实例隔离，不进入新页面。

原生代理只暴露 `call`，ArkWeb `permission` 对象白名单限制为 `resource` / `rawfile` / `web/index.html`，页面导航仅放行固定入口与其哈希路由。阻止网络资源加载、外部导航和多窗口，保持 `fileAccess(false)`；没有打开文件跨域泛权限。Web 构建另设 `frame-src 'none'`。本地 rawfile 资源依照官方文档不受 `fileAccess(false)` 限制。

## 验证记录和真实 SDK 待验项

在本次 Linux 环境实际执行：

```bash
pnpm test:harmonyos
```

结果为 **16 tests / 16 pass / 0 fail**。测试直接转译并执行本目录的 ETS 逻辑，替换 `@kit.NetworkKit` / Worker / WebviewController；其中一项通过真实 `node:net` 服务端检查 `ATZ\r`、分包响应与提示符读取。覆盖短超时、半行保留、并行读写、溢出、断线、连接失败、close/open 交错、后台 pending 结束、Worker 故障、页面代次、JSON 脚本转义和工程资源引用。

此证据验证运行逻辑与契约，**没有执行 ArkTSCheck、Hvigor/HAP 构建或 HarmonyOS 真机运行**。本机 `hvigorw`、`ohpm`、`hdc` 的 PATH 检测均为空。Node/TypeScript 转译不等同于 ArkTS 编译，测试替身不验证华为 SDK 的实际行为。

真实 DevEco/设备仍须验证：

- API 12 SDK 的严格 ArkTS 检查、Hvigor 模型解析、图标/字符串资源编译、签名与安装。
- Worker 资源路径及生命周期、`@kit.ArkTS` 导出和真实 Socket 的事件/Promise 时序。
- ArkWeb `permission` 的 rawfile 路径匹配、首屏代理可见时间、`runJavaScript` 回调、IIFE/CSS 与 CSP 的实际加载。
- Wi-Fi ELM327 的 DNS/IPv4/IPv6 路由、网络断开、后台切换、进程被系统终止以及再次连接。
- 真实读写超时及 64 KiB 溢出释放。桌面 Node mock 验证未覆盖设备内核错误码差异。

## 官方 API 核对来源

本次通过官方网页读取核对了以下接口和字段：

- [API 12 Socket 连接](https://developer.huawei.com/consumer/cn/doc/harmonyos-references-V5/js-apis-socket-V5)：`TCPSocket.bind/connect/send/close` Promise 接口、`SocketMessageInfo`、`TCPConnectOptions`；文档要求耗时 send 放在 Worker/taskpool。
- [API 12 网络连接管理](https://developer.huawei.com/consumer/cn/doc/harmonyos-references-V5/js-apis-net-connection-V5)：`connection.getAddressesByName(host): Promise<Array<NetAddress>>`，权限为 INTERNET。
- [API 12 Web](https://developer.huawei.com/consumer/cn/doc/harmonyos-references-V5/ts-basic-components-web-V5)：resource 协议、`fileAccess`、`blockNetwork`、`javaScriptProxy.permission`、`onLoadIntercept`、`onOverrideUrlLoading`。
- [ArkWeb JavaScript 执行](https://developer.huawei.com/consumer/cn/doc/doccenter-dev-faq/arkweb-kit-faq-0001)：`runJavaScript` 的 Promise/回调与页面加载完成时序。
- [Worker API 12 示例及构建声明](https://developer.huawei.com/consumer/cn/doc/harmonyos-faqs-V5/faqs-arkts-66-V5)：`@kit.ArkTS` 的 `worker`、`MessageEvents`、ThreadWorker 资源路径和 `sourceOption.workers`。
- [Worker 与主线程通信](https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V13/worker-communicates-with-mainthread-V13)：`ErrorEvent`、`ThreadWorkerGlobalScope`、`workerPort`、`postMessage` 的官方示例；API 12 编译仍列为设备/SDK待验项。
- [API 12 UIAbility 生命周期](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V5/uiability-lifecycle-V5)：`onWindowStageCreate`、`onForeground`、`onBackground`、`onWindowStageDestroy`、`onDestroy`。
- [工程级 build-profile 配置](https://developer.huawei.com/consumer/cn/doc/harmonyOS-faqs/project-management-faq-0002)：`compatibleSdkVersion`、`targetSdkVersion`、`runtimeOS` 的位置与值。
- [OpenHarmony 官方 JSBridge 权限示例](https://github.com/openharmony/docs/blob/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/web/web-in-page-app-function-invoking.md)：`javascriptProxyPermission.urlPermissionList` 的 scheme/host/path 规则与 rawfile 示例。

## 交接记录

已完成：API12 工程结构、资源、原生桥、Worker TCP、生命周期清理、16 项可复跑测试；相关实现集中在 `entry/src/main/ets/`。Web 构建、rawfile 同步、根构建脚本及版本编码由仓库根脚本维护。

关键取舍：Socket 放入专用 Worker 以遵循官方耗时接口要求；短读超时返回空字符串以兼容共享 ELM327 总超时；本地 IIFE 保持无需跨域泛权限。若升级到新的 SDK/并发模型，先保留并重跑本目录契约测试再迁移。

剩余工作：在具有 DevEco/API12 SDK 的环境执行 HAP 构建与真机步骤，记录实际日志。当前环境缺少 SDK 工具，没有签名、安装、发布、commit 或 push。测试运行期间避免改写源码：主线程桥由 Set 迁移 Map 的中间态曾被并行全量测试读取，完成迁移后重跑本地 16 项全部通过。
