#!/usr/bin/env node
/**
 * make-portable.js — 便携式打包（P6b 引入；P7 起默认 bundle 形态）
 *
 * 前置（调用方保证，build.bat / CI 已先行执行）：
 *   npm install
 *   npm run build:kernel   → server/cordis/kernel.cjs
 *   npm run build:web      → web/dist/kernel.js
 *   npm run build:server   → dist-server/server.bundle.cjs（仅 bundle 形态需要）
 *
 * 产物布局（YStage3-Portable/，P7 默认 bundle 形态）：
 *   node/node.exe         运行时（复制构建机的 process.execPath）
 *   app/
 *     server.bundle.cjs   ★ 应用核心 + 全部生产依赖的 esbuild 单文件 bundle
 *     server.bundle.cjs.map  sourcemap（外置，不参与运行）
 *     sql-wasm.wasm       唯一外置二进制资产（sqlite-store 按候选路径定位）
 *     web/dist/           前端内核等静态文件（/web/kernel.js 别名目标）
 *     favicon.ico
 *   plugins/              ★ 插件组件层（可写、可热替换）：
 *                         plugins.json / front.json / modules/<id>/…
 *   resource/             数据层：sqlite/、musics/、json/、images/（--no-resource 跳过）
 *   启动YStage.bat        注入 Y_STAGE_PLUGINS_DIR / Y_STAGE_RESOURCE_DIR /
 *                         Y_STAGE_APP_ROOT 后启动 server.bundle.cjs
 *   说明.txt
 *
 * 外置插件热替换原理：bundle 内唯一动态 require = loader 的插件加载
 * （require(modulesDir/<id>/plugin.js)，运行期绝对路径），esbuild 原样保留为
 * 原生 require → 外置插件参与真实 require.cache，管理面 reload 逐出即新代码。
 *
 * `--loose`：调试用旧形态——app/ 内放全源码树 + node_modules（排除顶层 devDeps），
 * 以 server.js 启动。布局与 P6b 相同。
 *
 * 用法：node scripts/make-portable.js [--out <dir>] [--zip] [--no-resource] [--loose]
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const hasFlag = (name) => args.includes(name);

const OUT = path.resolve(argOf("--out") || path.join(ROOT, "YStage3-Portable"));
const WITH_ZIP = hasFlag("--zip");
const WITH_RESOURCE = !hasFlag("--no-resource");
const LOOSE = hasFlag("--loose");

const log = (m) => console.log(`[make-portable] ${m}`);
const die = (m) => {
  console.error(`[make-portable] 错误: ${m}`);
  process.exit(1);
};

// ---- 前置校验 ----
// 防呆：OUT 不得为项目根本身或其祖先目录（后续 rmSync 会清空目标）
const ROOT_ABS = path.resolve(ROOT);
if (OUT === ROOT_ABS || ROOT_ABS.startsWith(OUT + path.sep)) {
  die(`产物目录不得为项目根或其祖先目录: ${OUT}`);
}
const REQUIRED = [
  ["cordis 内核产物", path.join(ROOT, "server", "cordis", "kernel.cjs")],
  ["前端内核产物", path.join(ROOT, "web", "dist", "kernel.js")],
  ["后端装配清单", path.join(ROOT, "server", "plugins.json")],
  ["前端装配清单", path.join(ROOT, "web", "front.json")],
  ["模块宇宙清单", path.join(ROOT, "modules", "modules.json")],
];
if (!LOOSE) {
  REQUIRED.push(
    ["服务端 bundle 产物（npm run build:server）", path.join(ROOT, "dist-server", "server.bundle.cjs")],
    ["sql.js wasm（node_modules）", path.join(ROOT, "node_modules", "sql.js", "dist", "sql-wasm.wasm")]
  );
}
for (const p of REQUIRED) {
  if (!fs.existsSync(p[1])) die(`缺少${p[0]}: ${p[1]}`);
}

// ---- 工具 ----
function copyTree(src, dest, filter) {
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: filter ? (s, d) => filter(s, d) : undefined,
  });
}
// server/ 内排除历史 pkg 产物（若存在）与测试文件（运行时不需要）——仅 --loose 用
const serverFilter = (s) =>
  !s.endsWith("inlined-assets.js") &&
  !s.endsWith("plugin-registry.cjs") &&
  !s.endsWith("module-servers.js") &&
  !s.endsWith(".test.js");
// web/ 排除测试文件与 front.json（P6b 终审 [P1]：清单走插件层，不留冻结副本）
const webFilter = (s) =>
  !s.endsWith(".test.js") && s !== path.join(ROOT, "web", "front.json");

// node_modules 排除顶层 devDependencies（含其 .bin 项与 esbuild 专属平台二进制包
// @esbuild/*）。只做顶层精确名单排除，不追传递依赖——残留的少量共享传递包无害
// （prod 与 dev 共享平铺副本，排除 dev 顶层后 prod 依赖不受影响），正确性优先。
// 仅 --loose 形态使用。
const devDepNames = new Set(
  Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).devDependencies || {})
);
devDepNames.add("@esbuild"); // esbuild 的平台二进制全部在 @esbuild scope，dev 专属
const nmRoot = path.join(ROOT, "node_modules");
const nmFilter = (s) => {
  const rel = path.relative(nmRoot, s);
  if (rel === "" || rel.startsWith("..")) return true; // 目录本身与 nm 外路径放行
  const segs = rel.split(path.sep);
  if (segs[0] === ".bin") return !devDepNames.has(path.basename(s)); // dev 包的 bin 链接
  const name = segs[0].startsWith("@") ? segs.slice(0, 2).join("/") : segs[0];
  // scoped 包整域排除：scope 名被声明为 dev 专属（如 @esbuild）时，其下平台二进制全跳过
  if (segs[0].startsWith("@") && devDepNames.has(segs[0])) return false;
  return !devDepNames.has(name);
};

// ---- 组装 ----
log(`产物目录: ${OUT}（${LOOSE ? "loose 源码形态" : "bundle 形态"}）`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 1. node/node.exe —— 构建机运行时
const nodeDir = path.join(OUT, "node");
fs.mkdirSync(nodeDir, { recursive: true });
const nodeExe = path.join(nodeDir, path.basename(process.execPath));
fs.copyFileSync(process.execPath, nodeExe);
log(`运行时: ${nodeExe}（${(fs.statSync(nodeExe).size / 1048576).toFixed(1)} MB）`);

// 2. app/ —— 应用程序核心
const appDir = path.join(OUT, "app");
fs.mkdirSync(appDir, { recursive: true });

if (LOOSE) {
  // ---- 旧形态：全源码树 + node_modules（调试用） ----
  fs.copyFileSync(path.join(ROOT, "server.js"), path.join(appDir, "server.js"));
  for (const f of ["package.json", "package-lock.json", "favicon.ico"]) {
    if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(appDir, f));
  }
  copyTree(nmRoot, path.join(appDir, "node_modules"), nmFilter);
  copyTree(path.join(ROOT, "server"), path.join(appDir, "server"), serverFilter);
  copyTree(path.join(ROOT, "web"), path.join(appDir, "web"), webFilter);
  log("app/ 完成（loose：server.js + package.json + node_modules（devDeps 已排除）+ server + web）");
} else {
  // ---- P7 默认形态：esbuild 单文件 bundle + 外置 wasm + web 静态 ----
  fs.copyFileSync(
    path.join(ROOT, "dist-server", "server.bundle.cjs"),
    path.join(appDir, "server.bundle.cjs")
  );
  const mapSrc = path.join(ROOT, "dist-server", "server.bundle.cjs.map");
  if (fs.existsSync(mapSrc)) fs.copyFileSync(mapSrc, path.join(appDir, "server.bundle.cjs.map"));
  fs.copyFileSync(
    path.join(ROOT, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    path.join(appDir, "sql-wasm.wasm")
  );
  fs.copyFileSync(path.join(ROOT, "favicon.ico"), path.join(appDir, "favicon.ico"));
  // web/：/web/kernel.js 别名目标（dist/）与共享前端资产（如 icons.mjs）。
  // 整树复制（webFilter 排除测试文件与 front.json）——避免逐个补文件，
  // 未来新增 web 级共享资产在 bundle 形态下自动可达。
  copyTree(path.join(ROOT, "web"), path.join(appDir, "web"), webFilter);
  log("app/ 完成（bundle：server.bundle.cjs(+.map) + sql-wasm.wasm + web/ + favicon）");
}

// 3. plugins/ —— 插件组件层（可写、可热替换）
const pluginsDir = path.join(OUT, "plugins");
fs.mkdirSync(pluginsDir, { recursive: true });
fs.copyFileSync(path.join(ROOT, "server", "plugins.json"), path.join(pluginsDir, "plugins.json"));
fs.copyFileSync(path.join(ROOT, "web", "front.json"), path.join(pluginsDir, "front.json"));
copyTree(path.join(ROOT, "modules"), path.join(pluginsDir, "modules"), webFilter);
log("plugins/ 完成（plugins.json + front.json + modules）");

// 4. resource/ —— 数据层
if (WITH_RESOURCE) {
  copyTree(path.join(ROOT, "resource"), path.join(OUT, "resource"));
  log("resource/ 完成（现状数据原样携带）");
} else {
  log("resource/ 跳过（--no-resource：首次启动自动创建空白数据层）");
}

// 5. 启动YStage.bat（CRLF；%~dp0 自身带尾反斜杠）
const ENTRY = LOOSE ? "server.js" : "server.bundle.cjs";
const batLines = [
  "@echo off",
  "chcp 65001 >nul",
  "title Y.Stage X（便携版）",
  'cd /d "%~dp0app"',
  'set "Y_STAGE_PLUGINS_DIR=%~dp0plugins"',
  'set "Y_STAGE_RESOURCE_DIR=%~dp0resource"',
];
if (!LOOSE) batLines.push('set "Y_STAGE_APP_ROOT=%~dp0app"'); // bundle 形态显式声明 app 根
batLines.push(
  'echo [Y.Stage X] plugins=%Y_STAGE_PLUGINS_DIR%',
  'echo [Y.Stage X] resource=%Y_STAGE_RESOURCE_DIR%',
  '"%~dp0node\\node.exe" ' + ENTRY,
  "pause"
);
fs.writeFileSync(path.join(OUT, "启动YStage.bat"), batLines.join("\r\n") + "\r\n", "utf8");

// 6. 说明.txt
const layoutLines = LOOSE
  ? [
      "  app/         应用程序核心（源码树 + node_modules + 构建产物，升级时整体替换）",
      "                 启动入口 app/server.js（--loose 调试形态）",
    ]
  : [
      "  app/         应用程序核心（升级时整体替换）",
      "                 server.bundle.cjs       应用 + 全部生产依赖的单文件 bundle",
      "                 server.bundle.cjs.map   调试用 sourcemap（可删，不参与运行）",
      "                 sql-wasm.wasm           唯一外置二进制资产（SQLite 引擎用）",
      "                 web/dist/               前端内核等静态文件",
    ];
const readme = [
  "Y.Stage X 便携版",
  "================",
  "",
  "目录布局：",
  "  node/        Node.js 运行时（免安装，随包分发）",
  ...layoutLines,
  "  plugins/     ★ 插件组件层（可写、可热替换）：",
  "                 plugins.json        后端装配清单（enabled:false = 不挂载，数据保留）",
  "                 front.json          前端装配清单",
  "                 modules/<模块id>/   全部模块（plugin.js + front/ + 页面 + 静态资源）",
  "  resource/    数据层（SQLite 业务库 / 音乐库 / 图片 / 纯数据 JSON）",
  "  启动YStage.bat  双击启动（默认端口 3000，被占用自动 +1，最多尝试 10 次）",
  "",
  "环境要求：",
  "  无需安装 Node.js —— node/ 内已随包附带运行时。",
  "  如需用系统 Node 启动：在 app/ 下运行 `node " + ENTRY + "`，",
  "  并先设置环境变量 Y_STAGE_PLUGINS_DIR=..\\plugins 与 Y_STAGE_RESOURCE_DIR=..\\resource" +
    (LOOSE ? "" : "（bundle 形态另设 Y_STAGE_APP_ROOT=app 绝对路径）") + "。",
  "",
  "插件热替换（无需重新打包）：",
  "  1. 直接修改 plugins/ 下的文件（改 plugin.js 逻辑、增删 modules/<id>/ 目录）；",
  "  2. 打开「插件管理」页（/m/plugin-manager/）对该插件点「热重载」；",
  "     bundle 形态下外置插件参与真实模块缓存，reload 逐出即新代码，改盘即生效；",
  "     新增/移除模块则编辑 plugins/plugins.json 后重启，或在管理页 toggle 启停；",
  "  3. 清单与 config 的全部改动即时落盘到 plugins/*.json，重启后保持。",
  "",
  "数据备份：",
  "  业务数据都在 resource/sqlite/y-stage.sqlite（SQLite 单文件），",
  "  备份该文件即可；音乐库在 resource/musics/。",
  "",
  "体积说明：",
  LOOSE
    ? "  app/node_modules 已排除 devDependencies（esbuild/nodemon 及其 bin、@esbuild/*）；" +
      "少量与生产共享的传递依赖按 npm 平铺布局保留（正确性优先）。"
    : "  bundle 形态无 node_modules：应用与全部生产依赖打进单文件（约 1.4 MB），" +
      "大头是 resource/ 音乐库与 node/ 运行时（约 90 MB）。",
  "  resource/ 携带现状数据，不需要可直接删除。",
  "",
].join("\r\n");
fs.writeFileSync(path.join(OUT, "说明.txt"), "\uFEFF" + readme, "utf8");
log("启动YStage.bat / 说明.txt 完成");

// 7. 可选 zip
if (WITH_ZIP) {
  const zip = OUT.replace(/[\\/]+$/, "") + ".zip";
  log(`压缩: ${zip}`);
  const r = spawnSync("powershell", [
    "-NoProfile", "-Command",
    `Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zip}' -Force`,
  ], { stdio: "inherit" });
  if (r.status !== 0) die("Compress-Archive 失败");
}

log("便携包组装完成");
