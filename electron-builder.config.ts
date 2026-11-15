import type { Configuration } from "electron-builder";
import { validateDesktopAfterPack, validateSidecarBeforePack } from "./scripts/desktop/pack-hooks";

// 产物命名统一：OpenRoadScope-<版本>-<平台>-<架构>[-变体].<扩展名>
// electron-builder 的 ${platform} 取的是 process.platform（win32 / darwin / linux），
// 与对外的平台名不一致，因此各平台写死平台名，只保留 ${arch} 变量。
// ${arch} 为 x64 / arm64 / ia32 / armv7l，其中 x64 在 CI 里统一改写为 x86_64
// （见 scripts/normalize-artifacts.ts，更新元数据同步改名）。
const winName = "${productName}-${version}-windows-${arch}";
const macName = "${productName}-${version}-macos-${arch}.${ext}";
const linuxName = "${productName}-${version}-linux-${arch}.${ext}";

const config: Configuration = {
  appId: "dev.openroadscope.app",
  productName: "OpenRoadScope",
  directories: {
    output: "dist",
  },
  files: ["out/**/*", "package.json"],
  beforePack: validateSidecarBeforePack,
  afterPack: validateDesktopAfterPack,
  win: {
    extraResources: [{ from: "resources/obd-sidecar.exe", to: "obd-sidecar.exe" }],
    // builder 26.15.3 的 MSI 仍使用 x64 WiX 包装；ARM64 发布 NSIS 和便携版。
    target: process.arch === "arm64" ? ["nsis", "portable"] : ["nsis", "portable", "msi"],
    // nsis 与 portable 同为 .exe，必须各自带变体后缀，否则同名互相覆盖
    artifactName: `${winName}.\${ext}`,
  },
  mac: {
    extraResources: [{ from: "resources/obd-sidecar", to: "obd-sidecar" }],
    // 常见 macOS 发行格式：DMG 镜像 / ZIP（自动更新用）
    target: ["dmg", "zip"],
    category: "public.app-category.utilities",
    artifactName: macName,
  },
  linux: {
    extraResources: [{ from: "resources/obd-sidecar", to: "obd-sidecar" }],
    // 常见 Linux 发行格式：AppImage / deb / rpm / snap / tar.gz
    target: ["AppImage", "deb", "rpm", "snap", "tar.gz"],
    category: "Utility",
    artifactName: linuxName,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    artifactName: `${winName}-setup.\${ext}`,
  },
  portable: {
    artifactName: `${winName}-portable.\${ext}`,
  },
  publish: {
    provider: "github",
    owner: "K-Blaaaack",
    repo: "open-road-scope",
  },
};

export default config;
