import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertPythonTarget,
  binaryTarget,
  desktopArch,
  PYINSTALLER_VERSION,
  type DesktopArch,
} from "./architecture";

/**
 * 创建最小文件头，测试架构识别与截断输入。
 * @param platform - 目标平台
 * @param arch - 目标架构
 * @returns 测试用可执行文件头
 */
export function executableHeader(
  platform: "win32" | "darwin" | "linux",
  arch: DesktopArch
): Buffer {
  const data = Buffer.alloc(128);
  if (platform === "win32") {
    data.write("MZ");
    data.writeUInt32LE(64, 0x3c);
    data.write("PE\0\0", 64);
    data.writeUInt16LE(arch === "arm64" ? 0xaa64 : 0x8664, 68);
  } else if (platform === "darwin") {
    data.writeUInt32LE(0xfeedfacf);
    data.writeUInt32LE(arch === "arm64" ? 0x0100000c : 0x01000007, 4);
  } else {
    data.write("\x7fELF");
    data[4] = 2;
    data[5] = 1;
    data.writeUInt16LE(arch === "arm64" ? 183 : 62, 18);
  }
  return data;
}

for (const platform of ["win32", "darwin", "linux"] as const) {
  for (const arch of ["x64", "arm64"] as const) {
    test(`识别 ${platform}/${arch} 的真实机器码文件头`, () => {
      assert.deepEqual(binaryTarget(executableHeader(platform, arch)), { platform, arch });
    });
  }
}

test("截断、损坏和不支持的文件头会阻止打包", () => {
  assert.throws(() => binaryTarget(Buffer.alloc(20)), /不完整/);
  assert.throws(() => binaryTarget(Buffer.alloc(128)), /需要 PE/);
  const badPe = executableHeader("win32", "x64");
  badPe.writeUInt32LE(999, 0x3c);
  assert.throws(() => binaryTarget(badPe), /无效的 PE/);
  const ia32 = executableHeader("win32", "x64");
  ia32.writeUInt16LE(0x14c, 68);
  assert.throws(() => binaryTarget(ia32), /PE Machine/);
});

test("Python架构名称归一化，未知架构显式失败", () => {
  assert.equal(desktopArch("AMD64"), "x64");
  assert.equal(desktopArch("x86_64"), "x64");
  assert.equal(desktopArch("aarch64"), "arm64");
  assert.throws(() => desktopArch("ia32"), /未支持/);
});

test("Windows ARM机器上的x64解释器不会伪装成原生ARM64", () => {
  const python = {
    platform: "win32",
    machine: "ARM64",
    bits: 64,
    buildPlatform: "win-amd64",
    pyinstaller: PYINSTALLER_VERSION,
  };
  assertPythonTarget(python, { platform: "win32", arch: "x64" });
  assert.throws(
    () => assertPythonTarget(python, { platform: "win32", arch: "arm64" }),
    /Python 架构不匹配/
  );
  assertPythonTarget(
    { ...python, buildPlatform: "win-arm64" },
    { platform: "win32", arch: "arm64" }
  );
});

test("Python位宽、平台、版本及macOS架构须匹配", () => {
  const python = {
    platform: "darwin",
    machine: "x86_64",
    bits: 64,
    buildPlatform: "macosx-15.0-x86_64",
    pyinstaller: PYINSTALLER_VERSION,
  };
  const target = { platform: "darwin", arch: "x64" } as const;
  assertPythonTarget(python, target);
  assert.throws(() => assertPythonTarget({ ...python, bits: 32 }, target), /Python 架构不匹配/);
  assert.throws(
    () => assertPythonTarget(python, { ...target, arch: "arm64" }),
    /Python 架构不匹配/
  );
  assert.throws(
    () => assertPythonTarget(python, { ...target, platform: "linux" }),
    /Python 架构不匹配/
  );
  assert.throws(
    () => assertPythonTarget({ ...python, pyinstaller: "6.0.0" }, target),
    /已验证版本/
  );
});
