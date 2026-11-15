import { readFileSync } from "node:fs";

export type DesktopArch = "x64" | "arm64";
export type DesktopPlatform = "win32" | "darwin" | "linux";
export interface BinaryTarget {
  platform: DesktopPlatform;
  arch: DesktopArch;
}
export interface PythonInfo {
  platform: string;
  machine: string;
  bits: number;
  buildPlatform: string;
  pyinstaller: string;
}

export const PYINSTALLER_VERSION = "6.22.3";

/**
 * 统一 Node、Python 与机器码工具使用的架构名称。
 * @param value - 原始架构名称
 * @returns 已支持的桌面架构
 */
export function desktopArch(value: string): DesktopArch {
  switch (value.toLowerCase()) {
    case "x64":
    case "amd64":
    case "x86_64":
      return "x64";
    case "arm64":
    case "aarch64":
      return "arm64";
    default:
      throw new Error(`未支持的桌面架构：${value}`);
  }
}

/**
 * 校验桌面平台名称。
 * @param value - Node 或 Python 的平台标识
 * @returns 已支持的桌面平台
 */
export function desktopPlatform(value: string): DesktopPlatform {
  if (value === "win32" || value === "darwin" || value === "linux") return value;
  throw new Error(`未支持的桌面平台：${value}`);
}

/**
 * 从可执行文件头识别实际架构，避免把构建参数误当成产物证据。
 * @param data - PE、单架构 Mach-O 或 ELF 可执行文件内容
 * @returns 文件的实际平台和架构
 */
export function binaryTarget(data: Buffer): BinaryTarget {
  if (data.length < 64) throw new Error("可执行文件头不完整");
  if (data.toString("ascii", 0, 2) === "MZ") {
    const offset = data.readUInt32LE(0x3c);
    if (offset + 6 > data.length || data.toString("ascii", offset, offset + 4) !== "PE\0\0") {
      throw new Error("无效的 PE 文件头");
    }
    const machine = data.readUInt16LE(offset + 4);
    if (machine === 0x8664) return { platform: "win32", arch: "x64" };
    if (machine === 0xaa64) return { platform: "win32", arch: "arm64" };
    throw new Error(`未支持的 PE Machine：0x${machine.toString(16)}`);
  }
  if (data.toString("hex", 0, 4) === "7f454c46") {
    if (data[4] !== 2 || ![1, 2].includes(data[5])) throw new Error("需要 64 位 ELF 文件");
    const machine = data[5] === 1 ? data.readUInt16LE(18) : data.readUInt16BE(18);
    if (machine === 62) return { platform: "linux", arch: "x64" };
    if (machine === 183) return { platform: "linux", arch: "arm64" };
    throw new Error(`未支持的 ELF Machine：${machine}`);
  }
  const magic = data.readUInt32LE(0);
  if (magic === 0xfeedfacf || magic === 0xcffaedfe) {
    const cpu = magic === 0xfeedfacf ? data.readUInt32LE(4) : data.readUInt32BE(4);
    if (cpu === 0x01000007) return { platform: "darwin", arch: "x64" };
    if (cpu === 0x0100000c) return { platform: "darwin", arch: "arm64" };
    throw new Error(`未支持的 Mach-O CPU：${cpu}`);
  }
  throw new Error("需要 PE、单架构 Mach-O 或 ELF 文件；请为目标架构分别构建 sidecar");
}

/**
 * 检查实际可执行文件与发行目标是否一致。
 * @param file - 可执行文件的绝对路径
 * @param expected - 发行目标平台及架构
 * @returns 校验通过后正常返回
 */
export function assertBinaryTarget(file: string, expected: BinaryTarget): void {
  const actual = binaryTarget(readFileSync(file));
  if (actual.platform !== expected.platform || actual.arch !== expected.arch) {
    throw new Error(
      `架构不匹配：${file} 为 ${actual.platform}/${actual.arch}，目标为 ${expected.platform}/${expected.arch}`
    );
  }
}

/**
 * 校验 Python 进程架构；Windows 用解释器构建标识避开仿真环境的宿主机名称。
 * @param info - Python 进程返回的环境信息
 * @param expected - sidecar 构建目标
 * @returns 校验通过后正常返回
 */
export function assertPythonTarget(info: PythonInfo, expected: BinaryTarget): void {
  const arch =
    info.platform === "win32"
      ? desktopArch(info.buildPlatform.replace(/^win-/, ""))
      : desktopArch(info.machine);
  if (info.platform !== expected.platform || arch !== expected.arch || info.bits !== 64) {
    throw new Error(
      `Python 架构不匹配：${info.platform}/${arch}/${info.bits}bit，目标为 ${expected.platform}/${expected.arch}`
    );
  }
  if (info.pyinstaller !== PYINSTALLER_VERSION) {
    throw new Error(`请在 sidecar 环境安装已验证版本：pyinstaller==${PYINSTALLER_VERSION}`);
  }
}
