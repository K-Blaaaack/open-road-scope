import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 从单一字形定义生成全部图标产物（桌面 / 安卓 / Web / 仓库）。
 * 字形取自关于页的 lucide gauge，保证应用图标与界面内标识一致。
 *
 * 依赖外部工具：rsvg-convert（SVG 光栅化）、magick（ICO 封装）。
 */

/** 图标底色（深色卡片底，与 build/icon 历史配色一致） */
const BG = "#0f1419";
/** 品牌主色（与 src/styles/base.css 的 --color-accent 一致） */
const ACCENT = "#38bdf8";
/** 启动页底色（与 index.html splash 一致） */
const SPLASH_BG = "#0b0f14";

/** lucide gauge 字形：表盘弧 + 指针（24×24 视图，描边宽 2） */
const GLYPH_PATHS = ["M3.34 19a10 10 0 1 1 17.32 0", "m12 14 4-4"];
/** 字形含描边的包围盒：宽 22、高 17，中心 (12, 11.5)（24 单位坐标系） */
const GLYPH_BOX = { cx: 12, cy: 11.5, w: 22 };
/** 图标中字形占画布宽度的比例（留出遮罩安全区） */
const ICON_GLYPH_RATIO = 0.58;
/** 启动页中字形占短边的比例 */
const SPLASH_GLYPH_RATIO = 0.32;

const root = join(import.meta.dirname, "..");

/**
 * 生成居中且等比缩放的字形节点
 * @param cx - 目标中心 x（px）
 * @param cy - 目标中心 y（px）
 * @param width - 字形目标宽度（px）
 * @returns SVG 片段
 */
function glyph(cx: number, cy: number, width: number): string {
  const scale = width / GLYPH_BOX.w;
  const paths = GLYPH_PATHS.map((d) => `<path d="${d}"/>`).join("");
  return (
    `<g transform="translate(${cx} ${cy}) scale(${scale}) ` +
    `translate(${-GLYPH_BOX.cx} ${-GLYPH_BOX.cy})" fill="none" stroke="${ACCENT}" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
  );
}

/** 包一层 svg 根节点 */
function svg(width: number, height: number, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${body}</svg>\n`
  );
}

/**
 * 应用图标 SVG
 * @param size - 画布边长（px）
 * @param shape - 底形：rounded 圆角方（桌面/legacy）、circle 圆形（安卓 round）、none 透明（自适应前景）
 */
function iconSvg(size: number, shape: "rounded" | "circle" | "none"): string {
  const half = size / 2;
  const bg =
    shape === "rounded"
      ? `<rect width="${size}" height="${size}" rx="${size * 0.21875}" fill="${BG}"/>`
      : shape === "circle"
        ? `<circle cx="${half}" cy="${half}" r="${half}" fill="${BG}"/>`
        : "";
  return svg(size, size, bg + glyph(half, half, size * ICON_GLYPH_RATIO));
}

/** 启动页 SVG：纯色底 + 居中字形，按短边缩放 */
function splashSvg(width: number, height: number): string {
  const body =
    `<rect width="${width}" height="${height}" fill="${SPLASH_BG}"/>` +
    glyph(width / 2, height / 2, Math.min(width, height) * SPLASH_GLYPH_RATIO);
  return svg(width, height, body);
}

const tmp = mkdtempSync(join(tmpdir(), "ors-icons-"));

/** 光栅化 SVG 文本到 png */
function png(svgText: string, out: string): void {
  const src = join(tmp, "in.svg");
  writeFileSync(src, svgText);
  mkdirSync(join(out, ".."), { recursive: true });
  execFileSync("rsvg-convert", ["-o", out, src]);
  console.log(`  ${out.replace(`${root}/`, "")}`);
}

/** 写出 SVG 文本文件 */
function saveSvg(svgText: string, out: string): void {
  mkdirSync(join(out, ".."), { recursive: true });
  writeFileSync(out, svgText);
  console.log(`  ${out.replace(`${root}/`, "")}`);
}

/** 安卓 mipmap 密度与像素尺寸 */
const MIPMAP_DENSITIES: [string, number][] = [
  ["ldpi", 36],
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
];

/** 安卓启动图：目录 -> 尺寸（竖屏 / 横屏 / 默认兜底） */
const SPLASH_TARGETS: [string, number, number][] = [
  ["drawable", 320, 480],
  ["drawable-port-ldpi", 240, 320],
  ["drawable-port-mdpi", 320, 480],
  ["drawable-port-hdpi", 480, 800],
  ["drawable-port-xhdpi", 720, 1280],
  ["drawable-port-xxhdpi", 960, 1600],
  ["drawable-port-xxxhdpi", 1280, 1920],
  ["drawable-land-ldpi", 320, 240],
  ["drawable-land-mdpi", 480, 320],
  ["drawable-land-hdpi", 800, 480],
  ["drawable-land-xhdpi", 1280, 720],
  ["drawable-land-xxhdpi", 1600, 960],
  ["drawable-land-xxxhdpi", 1920, 1280],
];

console.log("[gen-icons] 品牌矢量源");
saveSvg(iconSvg(512, "rounded"), join(root, "assets/logo.svg"));
saveSvg(iconSvg(512, "none"), join(root, "assets/logo-mark.svg"));
saveSvg(iconSvg(512, "rounded"), join(root, "build/icon.svg"));
saveSvg(iconSvg(512, "rounded"), join(root, "public/favicon.svg"));

console.log("[gen-icons] 桌面与 Web");
png(iconSvg(512, "rounded"), join(root, "build/icon.png"));
png(iconSvg(512, "rounded"), join(root, "public/icon-512.png"));
png(iconSvg(192, "rounded"), join(root, "public/icon-192.png"));
// Windows 图标：单文件内封装多尺寸
execFileSync("magick", [
  join(root, "build/icon.png"),
  "-define",
  "icon:auto-resize=256,128,64,48,32,16",
  join(root, "build/icon.ico"),
]);
console.log("  build/icon.ico");

console.log("[gen-icons] 安卓启动器图标");
const res = join(root, "android/app/src/main/res");
for (const [density, size] of MIPMAP_DENSITIES) {
  const dir = join(res, `mipmap-${density}`);
  png(iconSvg(size, "rounded"), join(dir, "ic_launcher.png"));
  png(iconSvg(size, "circle"), join(dir, "ic_launcher_round.png"));
  // 自适应图标前景：透明底，底色交给 @color/ic_launcher_background
  png(iconSvg(size, "none"), join(dir, "ic_launcher_foreground.png"));
}

console.log("[gen-icons] 安卓启动图");
for (const [dir, width, height] of SPLASH_TARGETS) {
  png(splashSvg(width, height), join(res, dir, "splash.png"));
}
// 仓库参考用启动图母版
png(splashSvg(2732, 2732), join(root, "assets/splash.png"));

rmSync(tmp, { recursive: true, force: true });
console.log("[gen-icons] 完成");
