import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { Arch, type AfterPackContext } from "electron-builder";
import { validateDesktopAfterPack, validateSidecarBeforePack } from "./pack-hooks";

/**
 * 生成测试所需的最小机器码文件。
 * @param file - 输出路径
 * @param platform - PE、Mach-O 或 ELF 平台
 * @param arm - 是否生成 ARM64 文件头
 * @returns 写入结束后正常返回
 */
function writeExecutable(file: string, platform: "win32" | "darwin" | "linux", arm: boolean): void {
  const data = Buffer.alloc(128);
  if (platform === "win32") {
    data.write("MZ");
    data.writeUInt32LE(64, 0x3c);
    data.write("PE\0\0", 64);
    data.writeUInt16LE(arm ? 0xaa64 : 0x8664, 68);
  } else if (platform === "darwin") {
    data.writeUInt32LE(0xfeedfacf);
    data.writeUInt32LE(arm ? 0x0100000c : 0x01000007, 4);
  } else {
    data.write("\x7fELF");
    data[4] = 2;
    data[5] = 1;
    data.writeUInt16LE(arm ? 183 : 62, 18);
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

for (const platform of ["win32", "darwin", "linux"] as const) {
  test(`打包钩子校验 ${platform} 目标和包内资源，阻止旧架构混入`, (context) => {
    const root = mkdtempSync(join(tmpdir(), "desktop hooks "));
    context.after(() => {
      assert.equal(resolve(root), root);
      assert.ok(root.startsWith(join(tmpdir(), "desktop hooks ")));
      rmSync(root, { recursive: true, force: true });
    });
    const appOutDir = join(root, "dist");
    const resources =
      platform === "darwin"
        ? join(appOutDir, "OpenRoadScope.app", "Contents", "Resources")
        : join(appOutDir, "resources");
    const source = join(
      root,
      "resources",
      platform === "win32" ? "obd-sidecar.exe" : "obd-sidecar"
    );
    const bundled = join(resources, platform === "win32" ? "obd-sidecar.exe" : "obd-sidecar");
    const electron =
      platform === "darwin"
        ? join(resources, "..", "MacOS", "OpenRoadScope")
        : join(appOutDir, platform === "win32" ? "OpenRoadScope.exe" : "open-road-scope");
    const buildContext = {
      arch: Arch.arm64,
      electronPlatformName: platform,
      appOutDir,
      targets: [],
      packager: {
        projectDir: root,
        getResourcesDir: () => resources,
        appInfo: { productFilename: "OpenRoadScope", sanitizedName: "open-road-scope" },
        platformSpecificBuildOptions: {},
      },
    } as unknown as AfterPackContext;
    writeExecutable(source, platform, false);
    assert.throws(() => validateSidecarBeforePack(buildContext), /架构不匹配/);
    writeExecutable(source, platform, true);
    validateSidecarBeforePack(buildContext);
    writeExecutable(bundled, platform, true);
    writeExecutable(electron, platform, true);
    validateDesktopAfterPack(buildContext);
    writeExecutable(electron, platform, false);
    assert.throws(() => validateDesktopAfterPack(buildContext), /架构不匹配/);
    if (platform === "win32") {
      const msiContext = {
        ...buildContext,
        targets: [{ name: "msi" }],
      } as unknown as AfterPackContext;
      assert.throws(() => validateSidecarBeforePack(msiContext), /WiX MSI/);
    }
  });
}
