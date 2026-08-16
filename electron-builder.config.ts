import type { Configuration } from "electron-builder";

// Windows 下 PyInstaller 产物带 .exe 后缀，其余平台无后缀
const sidecarName = process.platform === "win32" ? "obd-sidecar.exe" : "obd-sidecar";

const config: Configuration = {
  appId: "dev.openroadscope.app",
  productName: "OpenRoadScope",
  directories: {
    output: "dist",
  },
  files: ["out/**/*", "package.json"],
  extraResources: [
    {
      from: `resources/${sidecarName}`,
      to: sidecarName,
    },
  ],
  win: {
    // 常见 Windows 发行格式：NSIS 安装包 / 便携版 / MSI 企业部署
    target: ["nsis", "portable", "msi"],
  },
  mac: {
    // 常见 macOS 发行格式：DMG 镜像 / ZIP（自动更新用）
    target: ["dmg", "zip"],
    category: "public.app-category.utilities",
  },
  linux: {
    // 常见 Linux 发行格式：AppImage / deb / rpm / snap / tar.gz
    target: ["AppImage", "deb", "rpm", "snap", "tar.gz"],
    category: "Utility",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  publish: {
    provider: "github",
    owner: "K-Blaaaack",
    repo: "open-road-scope",
  },
};

export default config;
