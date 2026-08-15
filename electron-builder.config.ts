import type { Configuration } from "electron-builder";

const config: Configuration = {
  appId: "dev.openroadscope.app",
  productName: "OpenRoadScope",
  directories: {
    output: "dist",
  },
  files: ["out/**/*", "package.json"],
  extraResources: [
    {
      from: "resources/obd-sidecar",
      to: "obd-sidecar",
    },
  ],
  win: {
    target: ["nsis"],
  },
  mac: {
    target: ["dmg"],
    category: "public.app-category.utilities",
  },
  linux: {
    target: ["AppImage"],
    category: "Utility",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  publish: {
    provider: "github",
    owner: "open-road-scope",
    repo: "open-road-scope",
  },
};

export default config;
