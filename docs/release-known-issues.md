## ⚠️ 已知限制

本版本为预发布（pre-release），以下限制已确认，安装前请阅读。

### macOS 安装包未签名、未公证

DMG / ZIP 都没有 Apple Developer ID 签名，也没有经过公证。首次打开会被 Gatekeeper 拦截：

```bash
# 方式一：右键 App → 打开 → 再次确认打开
# 方式二：移除隔离属性后再打开
xattr -dr com.apple.quarantine /Applications/OpenRoadScope.app
```

未签名状态的后果：无法通过 `spctl` 校验，自动更新在没有签名的情况下也可能被系统拦截；正式分发前需要配置 Developer ID 与公证凭据。Apple Silicon 与 Intel 两种架构分别打包，不要混用。

### HarmonyOS NEXT 未做真机实测

仓库提供完整的 ArkTS / ArkWeb 工程与原生逻辑测试（16 项），但本版本**不发布 HAP**，也没有在真机或模拟器上验证：

- ArkTS 编译、HAP 打包与签名需要在 DevEco Studio + HarmonyOS SDK 环境完成；
- ArkWeb 的 `javaScriptProxy` 权限、Worker 时序、rawfile 资源加载需要真机确认；
- 原生桥当前只支持 TCP 网络适配器与模拟模式，**不含 USB 串口与经典蓝牙 SPP**。

### Windows ARM64 无 MSI

electron-builder 26.15.3 的 WiX MSI 包装仍为 x64，因此 ARM64 只提供 NSIS 安装包与便携版。USB / 蓝牙适配器在 Windows ARM64 下需要对应的 ARM64 驱动，网络连接与模拟模式不受影响。

### Android 安装包使用调试签名

CI 产出的 release APK 沿用调试密钥签名，仅用于内部测试与侧载安装，不能提交应用商店。

### 实车连接仍需自行验证

自动化测试覆盖协议解析、订阅生命周期与传输逻辑，但没有连接真实车辆或真实 ELM327 适配器。行车使用前请在驻车状态确认连接与读数正常。
