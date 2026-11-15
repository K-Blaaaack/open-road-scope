import { Arch, type AfterPackContext } from "electron-builder";
import { join } from "node:path";
import { assertBinaryTarget, desktopArch, desktopPlatform } from "./architecture";

/**
 * 打包前检查 sidecar，阻止旧资源被装入另一个架构的发行包。
 * @param context - electron-builder 的目标上下文
 * @returns 校验通过后正常返回
 */
export function validateSidecarBeforePack(context: AfterPackContext): void {
  const platform = desktopPlatform(context.electronPlatformName);
  const arch = desktopArch(Arch[context.arch]);
  if (
    platform === "win32" &&
    arch === "arm64" &&
    context.targets.some((item) => item.name === "msi")
  ) {
    throw new Error("Windows ARM64 请使用 --win nsis portable --arm64；当前 WiX MSI 包装仍为 x64");
  }
  const binaryName = platform === "win32" ? "obd-sidecar.exe" : "obd-sidecar";
  assertBinaryTarget(join(context.packager.projectDir, "resources", binaryName), {
    platform,
    arch,
  });
}

/**
 * 检查包内 sidecar 和 Electron 本体的机器码架构。
 * @param context - electron-builder 已打包应用的上下文
 * @returns 校验通过后正常返回
 */
export function validateDesktopAfterPack(context: AfterPackContext): void {
  const platform = desktopPlatform(context.electronPlatformName);
  const arch = desktopArch(Arch[context.arch]);
  const target = { platform, arch };
  const binaryName = platform === "win32" ? "obd-sidecar.exe" : "obd-sidecar";
  const resources = context.packager.getResourcesDir(context.appOutDir);
  assertBinaryTarget(join(resources, binaryName), target);
  const productName = context.packager.appInfo.productFilename;
  const executable =
    platform === "darwin"
      ? join(resources, "..", "MacOS", productName)
      : join(
          context.appOutDir,
          platform === "win32"
            ? `${productName}.exe`
            : (context.packager.platformSpecificBuildOptions.executableName ??
                context.packager.appInfo.sanitizedName.toLowerCase())
        );
  assertBinaryTarget(executable, target);
  console.log(`[desktop] 包内 Electron 与 sidecar 已验证：${platform}/${arch}`);
}
