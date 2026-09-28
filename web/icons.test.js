/**
 * 图标基座单测 —— node 侧（无浏览器/DOM）
 *
 * 覆盖 web/icons.mjs（Tabler Icons 内联 SVG 基座）：
 *   - API 形态：icon / iconEl / ICON_NAMES 导出且类型正确
 *   - SVG 规格：viewBox 0 0 24 24 / fill none / stroke currentColor /
 *     round linecap+linejoin / 默认 stroke-width 1.75 / 至少一个 <path>
 *   - opts：size 生效、class 追加且保留基础类、label 与 aria-hidden 语义
 *   - 清单：ICON_NAMES 非空 / 无重复 / 每个名字都能产出 SVG（逐个遍历）
 *   - 边界：未知名字 icon() 返回 ""（占位安全）、iconEl() 返回 null；
 *     label 引号转义不破坏 SVG 结构
 *   - 下游引用自检：扫描 modules/** 中 import 本模块的文件，报告缺失图标名
 *
 * 源文件为 .mjs（根 package.json "type":"commonjs"），本文件保持 CJS 经动态 import() 加载。
 * 风格跟随 web/loader.test.js：harness 用 server/test-lib。
 */
const fs = require("fs");
const path = require("path");
const { test, runTests, assert } = require("../server/test-lib");

const APP_ROOT = path.join(__dirname, "..");
const importIcons = () => import("./icons.mjs");

// 需求硬清单（模块元数据 19 + 通用操作类）：真实值必须全部内置
const REQUIRED_METADATA = [
  "home", "swords", "settings", "medal", "target-arrow", "seedling", "balloon",
  "handshake", "trophy", "music", "playlist", "microphone", "chart-bar", "trending-up",
  "award", "device-gamepad-2", "clock-play", "hand-stop", "puzzle",
];
const REQUIRED_ACTION = [
  "pencil", "trash", "check", "x", "refresh", "search", "plus", "minus", "file-text",
  "download", "upload", "arrow-left", "arrow-right", "arrow-up", "arrow-down", "chevron-down",
  "chevron-right", "box", "filter", "list", "users", "user", "crown", "bolt", "alert-triangle",
  "info-circle", "circle-check", "circle-x", "player-play", "player-pause", "player-stop",
  "volume", "dice", "shuffle", "wand", "sparkles", "flame", "star", "calendar", "clock",
  "database", "apps", "layout-grid", "settings-automation", "eye", "device-floppy",
];

/** 递归收集目录下所有 .js 文件（跳过 node_modules/dist） */
function collectJs(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJs(abs, out);
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(abs);
  }
  return out;
}

// ---- API 形态 ----

test("导出 icon / iconEl 函数与 ICON_NAMES 数组", async () => {
  const mod = await importIcons();
  assert.strictEqual(typeof mod.icon, "function");
  assert.strictEqual(typeof mod.iconEl, "function");
  assert.ok(Array.isArray(mod.ICON_NAMES));
});

test("ICON_NAMES 非空且无重复", async () => {
  const { ICON_NAMES } = await importIcons();
  assert.ok(ICON_NAMES.length > 0, "ICON_NAMES 不能为空");
  assert.strictEqual(ICON_NAMES.length, new Set(ICON_NAMES).size, "ICON_NAMES 存在重复项");
  for (const n of ICON_NAMES) {
    assert.strictEqual(typeof n, "string");
    assert.match(n, /^[a-z0-9-]+$/, `图标名格式异常: ${n}`);
  }
});

test("需求清单（19 元数据 + 通用操作）全部内置", async () => {
  const { ICON_NAMES } = await importIcons();
  const missing = [...REQUIRED_METADATA, ...REQUIRED_ACTION].filter((n) => !ICON_NAMES.includes(n));
  assert.deepStrictEqual(missing, [], `缺失图标: ${missing.join(", ")}`);
});

// ---- SVG 规格 ----

test("icon() 返回含 <svg 与统一 Tabler viewBox", async () => {
  const { icon } = await importIcons();
  const svg = icon("home");
  assert.ok(svg.startsWith("<svg "), "应以 <svg 开头");
  assert.ok(svg.endsWith("</svg>"), "应以 </svg> 结尾");
  assert.ok(svg.includes('viewBox="0 0 24 24"'));
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
});

test("统一描边规格：fill none / stroke currentColor / round 端点 / 默认 1.75", async () => {
  const { icon } = await importIcons();
  const svg = icon("music");
  assert.ok(svg.includes('fill="none"'));
  assert.ok(svg.includes('stroke="currentColor"'));
  assert.ok(svg.includes('stroke-linecap="round"'));
  assert.ok(svg.includes('stroke-linejoin="round"'));
  assert.ok(svg.includes('stroke-width="1.75"'), "默认 stroke-width 应为 1.75");
  assert.ok(/<path d="[^"]+" \/>/.test(svg), "应至少包含一个 <path>");
});

test("opts.size 同时作用于 width/height", async () => {
  const { icon } = await importIcons();
  const svg = icon("star", { size: 32 });
  assert.ok(svg.includes('width="32"'));
  assert.ok(svg.includes('height="32"'));
  // 非法 size 回退默认 20（不产出 0/负/NaN 尺寸）
  for (const bad of [0, -5, NaN, Infinity, "big"]) {
    const s = icon("star", { size: bad });
    assert.ok(s.includes('width="20"') && s.includes('height="20"'), `size=${String(bad)} 应回退 20`);
  }
});

test("opts.stroke 可调且非法值回退 1.75", async () => {
  const { icon } = await importIcons();
  assert.ok(icon("bolt", { stroke: 2.5 }).includes('stroke-width="2.5"'));
  assert.ok(icon("bolt", { stroke: 0 }).includes('stroke-width="1.75"'));
});

test("opts.class 追加且保留基础类 y-icon", async () => {
  const { icon } = await importIcons();
  const plain = icon("crown");
  assert.ok(plain.includes('class="y-icon"'));
  const custom = icon("crown", { class: "btn-icon is-active" });
  assert.ok(custom.includes('class="y-icon btn-icon is-active"'));
});

// ---- 无障碍语义 ----

test("无 label → aria-hidden=\"true\"（纯装饰）", async () => {
  const { icon } = await importIcons();
  const svg = icon("check");
  assert.ok(svg.includes('aria-hidden="true"'));
  assert.ok(!svg.includes('role="img"'));
  assert.ok(!svg.includes("aria-label"));
});

test("有 label → role=\"img\" + aria-label，且不含 aria-hidden", async () => {
  const { icon } = await importIcons();
  const svg = icon("trash", { label: "删除该行" });
  assert.ok(svg.includes('role="img"'));
  assert.ok(svg.includes('aria-label="删除该行"'));
  assert.ok(!svg.includes("aria-hidden"));
});

test("label / class 属性转义：引号与尖括号不破坏 SVG 结构", async () => {
  const { icon } = await importIcons();
  const svg = icon("info-circle", { label: 'a" onload="x' });
  assert.ok(!svg.includes('onload="x"'), "引号必须被转义，不得注入属性");
  assert.ok(svg.includes("&quot;"));
  const cls = icon("check", { class: 'a"><script>' });
  assert.ok(!cls.includes("<script>"), "class 中的尖括号必须被转义");
});

// ---- 清单遍历：每个名字都能产出合法 SVG ----

test("ICON_NAMES 中每个图标都能产出含 <path> 的 SVG", async () => {
  const { icon, ICON_NAMES } = await importIcons();
  const bad = [];
  for (const name of ICON_NAMES) {
    const svg = icon(name);
    if (!svg.startsWith("<svg ") || !svg.includes("viewBox=") || !svg.includes("<path")) {
      bad.push(name);
    }
  }
  assert.deepStrictEqual(bad, [], `以下图标产出异常: ${bad.join(", ")}`);
});

test("opts 对清单全量生效（size/label 逐个）", async () => {
  const { icon, ICON_NAMES } = await importIcons();
  for (const name of ICON_NAMES) {
    const svg = icon(name, { size: 24, label: name });
    assert.ok(svg.includes('width="24"') && svg.includes('role="img"'), `opts 未生效: ${name}`);
  }
});

// ---- 边界行为 ----

test("未知图标名：icon() 返回空字符串（占位安全，不抛错）", async () => {
  const { icon } = await importIcons();
  assert.strictEqual(icon("does-not-exist"), "");
  assert.strictEqual(icon(""), "");
  assert.strictEqual(icon(undefined), "");
  assert.strictEqual(icon("toString"), "", "不得从原型链取值");
  assert.strictEqual(icon("constructor"), "");
});

test("iconEl()：node 无 DOM 环境返回 null（不抛错）", async () => {
  const { iconEl } = await importIcons();
  assert.strictEqual(iconEl("home"), null);
  assert.strictEqual(iconEl("does-not-exist"), null);
});

test("iconEl()：有 DOM 时经 <template> 返回真实元素", async () => {
  const { iconEl } = await importIcons();
  const captured = {};
  global.document = {
    createElement(tag) {
      captured.tag = tag;
      return {
        set innerHTML(v) { captured.html = v; },
        get innerHTML() { return captured.html; },
        content: { firstElementChild: { nodeName: "svg" } },
      };
    },
  };
  try {
    const el = iconEl("star", { class: "k" });
    assert.strictEqual(captured.tag, "template");
    assert.ok(captured.html.includes("<svg "));
    assert.ok(captured.html.includes('class="y-icon k"'));
    assert.strictEqual(el.nodeName, "svg");
    assert.strictEqual(iconEl("does-not-exist"), null);
  } finally {
    delete global.document;
  }
});

// ---- 下游引用自检（后续阶段替换 emoji 时守门） ----

test("modules/** 中引用的图标名均已在 ICON_NAMES 内置", async () => {
  const { ICON_NAMES } = await importIcons();
  const known = new Set(ICON_NAMES);
  const offenders = [];
  for (const file of collectJs(path.join(APP_ROOT, "modules"))) {
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes("/web/icons.mjs")) continue; // 只校验真正引用本基座的文件
    for (const m of src.matchAll(/\bicon\(\s*["']([a-zA-Z0-9-]+)["']/g)) {
      if (!known.has(m[1])) offenders.push(`${path.relative(APP_ROOT, file)} → ${m[1]}`);
    }
  }
  assert.deepStrictEqual(offenders, [], `引用了未内置图标:\n  ${offenders.join("\n  ")}`);
});

if (require.main === module) runTests(__filename).then((code) => process.exit(code));
