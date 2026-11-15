import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { MacUpdater } from "electron-updater/out/MacUpdater";
import { findFile, parseUpdateInfo, resolveFiles } from "electron-updater/out/providers/Provider";
import { mergeReleaseArtifacts } from "../merge-update-metadata";
import { normalizeArtifacts } from "../normalize-artifacts";
import {
  defaultEntryRank,
  mergeMetadata,
  normalizeArtifactName,
  readMetadata,
  serializeMetadata,
  type UpdateMetadata,
} from "./update-metadata";

/**
 * 为测试建立带空格路径，结束时仅删除本测试创建的目录。
 * @param context - 测试生命周期
 * @returns 独立临时目录
 */
function temporaryDirectory(context: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), "open-road desktop "));
  context.after(() => {
    assert.equal(resolve(directory), directory);
    assert.ok(directory.startsWith(join(tmpdir(), "open-road desktop ")));
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

/**
 * 写入具有真实摘要与大小的测试发行包和更新元数据。
 * @param directory - 架构产物目录
 * @param names - 安装包文件名
 * @param channel - channel 元数据文件名
 * @returns 已写入的元数据
 */
function releaseFixture(directory: string, names: string[], channel: string): UpdateMetadata {
  mkdirSync(directory, { recursive: true });
  const files = names.map((url) => {
    const content = Buffer.from(`test binary: ${url}`);
    writeFileSync(join(directory, url), content);
    return {
      url,
      sha512: createHash("sha512").update(content).digest("base64"),
      size: content.length,
    };
  });
  const info = {
    version: "0.2.0-rc.2",
    files,
    path: files[0].url,
    sha512: files[0].sha512,
    releaseDate: "2026-11-15T00:00:00.000Z",
    releaseNotes: "保留原始说明 x64，不改写正文",
  };
  writeFileSync(join(directory, channel), serializeMetadata(info));
  return info;
}

class TestMacUpdater extends MacUpdater {
  static select = MacUpdater.filterFilesForArch;
}

test("独立下载目录合并后，真实updater为四种桌面架构选择正确文件", async (context) => {
  const root = temporaryDirectory(context);
  const input = join(root, "download with spaces");
  const output = join(root, "release assets");
  const definitions = [
    ["windows-x64", "windows-x64-setup.exe", "rc.yml"],
    ["windows-arm64", "windows-arm64-setup.exe", "rc.yml"],
    ["macos-x64", "macos-x64.zip", "rc-mac.yml"],
    ["macos-arm64", "macos-arm64.zip", "rc-mac.yml"],
    ["linux-x64", "linux-x64.AppImage", "rc-linux.yml"],
  ];
  for (const [group, suffix, channel] of definitions) {
    const directory = join(input, group);
    const names = [`OpenRoadScope-0.2.0-rc.2-${suffix}`];
    if (group.startsWith("macos")) names.push(names[0].replace(".zip", ".dmg"));
    releaseFixture(directory, names, channel);
    writeFileSync(join(directory, "builder-debug.yml"), "debug: ignored");
    normalizeArtifacts(directory);
  }
  const android = join(input, "android");
  mkdirSync(android);
  writeFileSync(join(android, "OpenRoadScope-0.2.0-rc.2-android-arm64.apk"), "apk");
  const count = await mergeReleaseArtifacts(input, output);
  assert.equal(count, 11);
  assert.ok(!readdirSync(output).includes("builder-debug.yml"));
  for (const [channel, extension, mac] of [
    ["rc.yml", "exe", false],
    ["rc-mac.yml", "zip", true],
  ] as const) {
    const info = parseUpdateInfo(
      readFileSync(join(output, channel), "utf8"),
      channel,
      new URL("https://example.test/")
    );
    const files = resolveFiles(info, new URL("https://example.test/"));
    assert.ok(info.path?.includes("-x86_64"));
    for (const arch of ["x64", "arm64"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(process, "arch")!;
      try {
        Object.defineProperty(process, "arch", { value: arch });
        const candidates = mac ? TestMacUpdater.select(files, arch === "arm64") : files;
        const selected = findFile(candidates, extension);
        assert.ok(selected?.url.pathname.includes(arch === "x64" ? "-x86_64" : "-arm64"));
      } finally {
        Object.defineProperty(process, "arch", descriptor);
      }
    }
  }
});

test("重命名保留摘要、预发布channel和说明，同时更新blockmap与引用", (context) => {
  const directory = temporaryDirectory(context);
  const name = "OpenRoadScope-1.0-windows-x64-setup.exe";
  const original = releaseFixture(directory, [name], "beta.yml");
  writeFileSync(join(directory, `${name}.blockmap`), "blockmap");
  normalizeArtifacts(directory);
  normalizeArtifacts(directory);
  const result = readMetadata(join(directory, "beta.yml"));
  assert.equal(result.files[0].url, "OpenRoadScope-1.0-windows-x86_64-setup.exe");
  assert.equal(result.files[0].sha512, original.files[0].sha512);
  assert.equal(result.path, result.files[0].url);
  assert.equal(result.releaseNotes, original.releaseNotes);
  assert.ok(readdirSync(directory).includes("OpenRoadScope-1.0-windows-x86_64-setup.exe.blockmap"));
});

test("已有同名目标时预检失败且保留原文件", (context) => {
  const directory = temporaryDirectory(context);
  writeFileSync(join(directory, "app-x64.zip"), "old");
  writeFileSync(join(directory, "app-x86_64.zip"), "new");
  assert.throws(() => normalizeArtifacts(directory), /目标已存在/);
  assert.equal(readFileSync(join(directory, "app-x64.zip"), "utf8"), "old");
});

test("元数据合并校验版本、重复URL冲突及路径越界", (context) => {
  const directory = temporaryDirectory(context);
  const info = releaseFixture(directory, ["app-x86_64.zip"], "latest-mac.yml");
  assert.equal(mergeMetadata([info, info]).files.length, 1);
  assert.throws(() => mergeMetadata([info, { ...info, version: "9.0.0" }]), /version/);
  assert.throws(
    () => mergeMetadata([info, { ...info, files: [{ ...info.files[0], sha512: "wrong" }] }]),
    /同名更新文件冲突/
  );
  assert.throws(
    () => mergeMetadata([{ ...info, files: [{ ...info.files[0], url: "../escape.zip" }] }]),
    /发布目录内/
  );
});

test("缺失或损坏产物会在发布目录写入前报错", async (context) => {
  const root = temporaryDirectory(context);
  const input = join(root, "download");
  const directory = join(input, "windows-x64");
  releaseFixture(directory, ["app-x86_64-setup.exe"], "latest.yml");
  writeFileSync(join(directory, "app-x86_64-setup.exe"), "corrupted");
  await assert.rejects(mergeReleaseArtifacts(input, join(root, "release")), /大小不匹配/);
  const info = readMetadata(join(directory, "latest.yml"));
  delete info.files[0].size;
  writeFileSync(join(directory, "latest.yml"), serializeMetadata(info));
  await assert.rejects(mergeReleaseArtifacts(input, join(root, "release")), /SHA-512/);
  info.files[0].url = "missing.exe";
  writeFileSync(join(directory, "latest.yml"), serializeMetadata(info));
  await assert.rejects(mergeReleaseArtifacts(input, join(root, "release")), /ENOENT/);
});

test("产物重名冲突和错误下载布局均停止发布", async (context) => {
  const root = temporaryDirectory(context);
  const input = join(root, "downloads");
  releaseFixture(join(input, "x64"), ["app-x86_64-setup.exe"], "latest.yml");
  const arm = join(input, "arm64");
  releaseFixture(arm, ["app-arm64-setup.exe"], "latest.yml");
  writeFileSync(join(arm, "app-x86_64-setup.exe"), "different");
  await assert.rejects(mergeReleaseArtifacts(input, join(root, "release")), /同名冲突/);
  await assert.rejects(mergeReleaseArtifacts(input, join(input, "nested")), /之外/);
  await assert.rejects(
    mergeReleaseArtifacts(join(input, "x64"), join(root, "release")),
    /分架构下载目录/
  );
});

test("非空发布目录保持原文件，旧版入口摘要须与files一致", async (context) => {
  const root = temporaryDirectory(context);
  const input = join(root, "downloads");
  const group = join(input, "windows-x64");
  const output = join(root, "release");
  const info = releaseFixture(group, ["app-x86_64-setup.exe"], "latest.yml");
  mkdirSync(output);
  writeFileSync(join(output, "existing.txt"), "keep");
  await assert.rejects(mergeReleaseArtifacts(input, output), /须为空/);
  assert.deepEqual(readdirSync(output), ["existing.txt"]);
  info.sha512 = "wrong";
  writeFileSync(join(group, "latest.yml"), serializeMetadata(info));
  await assert.rejects(mergeReleaseArtifacts(input, join(root, "other")), /path\/sha512/);
});

test("deb 的 Debian 架构名统一为 x86_64，其它名称不受影响", () => {
  assert.equal(
    normalizeArtifactName("OpenRoadScope-1.0-linux-amd64.deb"),
    "OpenRoadScope-1.0-linux-x86_64.deb"
  );
  assert.equal(
    normalizeArtifactName("OpenRoadScope-1.0-linux-x64.AppImage"),
    "OpenRoadScope-1.0-linux-x86_64.AppImage"
  );
  assert.equal(normalizeArtifactName("app-arm64.zip"), "app-arm64.zip");
});

test("默认入口优先 electron-updater 可安装的格式", () => {
  assert.ok(defaultEntryRank("app.zip") < defaultEntryRank("app.dmg"));
  assert.ok(defaultEntryRank("app.AppImage") < defaultEntryRank("app.deb"));
  assert.ok(defaultEntryRank("app.deb") < defaultEntryRank("app.rpm"));
  assert.ok(defaultEntryRank("app.exe") < defaultEntryRank("app.dmg"));
});

test("Linux 元数据以 AppImage 作为旧版回退入口", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-road-linux-"));
  try {
    const files = [
      "OpenRoadScope-1.0-linux-x86_64.deb",
      "OpenRoadScope-1.0-linux-x86_64.AppImage",
      "OpenRoadScope-1.0-linux-x86_64.rpm",
    ];
    const info = {
      version: "1.0.0",
      files: files.map((url) => ({
        url,
        sha512: createHash("sha512").update(url).digest("base64"),
      })),
    };
    const merged = mergeMetadata([info]);
    assert.equal(merged.files[0].url, "OpenRoadScope-1.0-linux-x86_64.AppImage");
    assert.equal(merged.path, merged.files[0].url);
    assert.equal(merged.sha512, merged.files[0].sha512);
    // 目录只用于创建临时环境，这里不读取文件
    assert.ok(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
