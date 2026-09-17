/**
 * 路径解析中枢（P6b 便携化 / P7 esbuild 全量打包）
 *
 * dev / portable 双模式共存：默认值精确等于历史 dev 布局（铁门，endpoint-diff
 * 基线零漂移）；便携目录经环境变量把「插件组件层」与「数据层」指到 app 之外：
 *
 *   dev（未设 env，一切在项目根 APP_ROOT 内，与 P6b 之前逐字节同路径）：
 *     后端装配清单  <APP_ROOT>/server/plugins.json
 *     前端装配清单  <APP_ROOT>/web/front.json
 *     模块宇宙      <APP_ROOT>/modules/<id>/…（含 modules/modules.json）
 *     数据层        <APP_ROOT>/resource/{json,sqlite,musics,images}
 *
 *   portable（构建产物 YStage3-Portable/，启动 bat 注入 env）：
 *     Y_STAGE_PLUGINS_DIR=<便携根>/plugins   → 清单 plugins.json/front.json + modules/
 *     Y_STAGE_RESOURCE_DIR=<便携根>/resource → json/sqlite/musics/images
 *
 *   APP_ROOT 的两种推导（P7）：
 *     - 源码形态：本文件位于 <app>/server/paths.cjs，__dirname 推导 = <app>
 *     - bundle 形态（esbuild 全量打包）：本模块内联进 app/server.bundle.cjs，
 *       __dirname 语义变为「bundle 所在目录」= <app>——恰好正确，但属实现细节；
 *       Y_STAGE_APP_ROOT env 可显式覆盖（bundle 模式 APP_ROOT = bundle 所在目录），
 *       启动 bat 可按需注入以消除对放置位置的隐式依赖。
 *
 * 所有取值为函数（每次读 env）：环境变量运行时可变，测试可逐用例覆盖。
 */
const path = require("path");

// app 目录：源码形态由本文件位置推导；bundle 形态 = bundle 所在目录（同值）；
// Y_STAGE_APP_ROOT 显式覆盖优先。
const APP_ROOT = process.env.Y_STAGE_APP_ROOT || path.join(__dirname, "..");

/**
 * 纯解析器：给定 env 形状（默认 process.env）返回全部路径。
 * 供单测以显式 env 对象调用，不触碰 process.env。
 */
function resolvePaths(env) {
  const e = env || process.env;
  const appRoot = e.Y_STAGE_APP_ROOT || APP_ROOT;
  const pluginsDir = e.Y_STAGE_PLUGINS_DIR || appRoot;
  // 未指明插件层时保持历史 dev 布局（清单在 server/ 与 web/ 子目录）；
  // 指明后为便携扁平布局（清单在插件层根目录）。
  const portablePlugins = !!e.Y_STAGE_PLUGINS_DIR;
  const resourceDir = e.Y_STAGE_RESOURCE_DIR || path.join(appRoot, "resource");
  return {
    appRoot,
    pluginsDir,
    resourceDir,
    jsonDir: path.join(resourceDir, "json"),
    sqliteDir: path.join(resourceDir, "sqlite"),
    sqliteFile: path.join(resourceDir, "sqlite", "y-stage.sqlite"),
    musicsDir: path.join(resourceDir, "musics"),
    modulesDir: path.join(pluginsDir, "modules"),
    modulesManifestPath: path.join(pluginsDir, "modules", "modules.json"),
    backendManifestPath: portablePlugins
      ? path.join(pluginsDir, "plugins.json")
      : path.join(pluginsDir, "server", "plugins.json"),
    frontManifestPath: portablePlugins
      ? path.join(pluginsDir, "front.json")
      : path.join(pluginsDir, "web", "front.json"),
    portable: portablePlugins || !!e.Y_STAGE_RESOURCE_DIR,
  };
}

// ---- 常用单值取值函数（消费方按需调用，语义见 resolvePaths）----
const modulesDir = () => resolvePaths().modulesDir;
const modulesManifestPath = () => resolvePaths().modulesManifestPath;
const backendManifestPath = () => resolvePaths().backendManifestPath;
const frontManifestPath = () => resolvePaths().frontManifestPath;
const resourceDir = () => resolvePaths().resourceDir;
const jsonDir = () => resolvePaths().jsonDir;
const sqliteDir = () => resolvePaths().sqliteDir;
const sqliteFile = () => resolvePaths().sqliteFile;
const musicsDir = () => resolvePaths().musicsDir;
const isPortable = () => resolvePaths().portable;

module.exports = {
  APP_ROOT,
  resolvePaths,
  modulesDir,
  modulesManifestPath,
  backendManifestPath,
  frontManifestPath,
  resourceDir,
  jsonDir,
  sqliteDir,
  sqliteFile,
  musicsDir,
  isPortable,
};
