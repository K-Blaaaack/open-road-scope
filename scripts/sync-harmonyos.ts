import { cpSync, existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = join(root, "dist-harmonyos");
const destination = join(root, "harmonyos/entry/src/main/resources/rawfile/web");
const appPath = join(root, "harmonyos/AppScope/app.json5");

if (!existsSync(join(source, "index.html"))) {
  throw new Error("请先运行 pnpm build:harmonyos-web");
}
// 同步只清理本工程生成的 web 子目录，逐级检查以免跟随链接触及工程外目录。
let ancestor = destination;
while (ancestor !== root) {
  if (existsSync(ancestor) && realpathSync(ancestor) !== ancestor) {
    throw new Error(`同步目录含符号链接：${ancestor}`);
  }
  ancestor = dirname(ancestor);
}
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
const version = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.-]+)?$/.exec(pkg.version);
if (!version) throw new Error(`版本格式无效：${pkg.version}`);
const [major, minor, patch] = version.slice(1, 4).map(Number);
// 预发布保留 versionName，versionCode 使用稳定的三段数值编码。
const versionCode = major * 1000000 + minor * 1000 + patch;
if (minor >= 1000 || patch >= 1000 || versionCode < 1 || versionCode > 2147483647) {
  throw new Error(`版本超出 HarmonyOS versionCode 范围：${pkg.version}`);
}
const config = JSON.parse(readFileSync(appPath, "utf8")) as {
  app: { versionName: string; versionCode: number };
};
config.app.versionName = pkg.version;
config.app.versionCode = versionCode;
rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
writeFileSync(appPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`[sync-harmonyos] 已同步 Web 资源及版本 ${pkg.version}`);
