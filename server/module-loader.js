/**
 * 模块清单读取器 + 投影器（P5a 瘦身）
 *
 * 职责（legacy 双路径已在 P5a 移除，模块后端一律走 cordis 插件装配）：
 *  1. 读取 modules/modules.json（模块注册清单，单一事实来源），真实文件直读
 *  2. 导出清单查询接口 getModules() / getModule(id)，供消费方投影：
 *     - server/module-registry.cjs：/api/modules 与 /m/:id 的默认（装配前兜底）数据源
 *     - server/cordis/selfcheck.cjs A3：ctx.modules.list() 与本投影逐字节 parity 断言
 *     - server/cordis/loader.js：装配时填充本清单（宇宙集合）
 *
 * 路径（P6b）：modules 目录经 server/paths.cjs 解析——dev = <APP_ROOT>/modules，
 * 便携 = Y_STAGE_PLUGINS_DIR/modules。
 */
const fs = require("fs");
const paths = require("./paths.cjs");
const { serverLog } = require("./utils");

const MODULES_DIR = paths.modulesDir();
const MANIFEST_PATH = paths.modulesManifestPath();

// 已加载的模块清单（module.json 数组）
let modules = [];

// 读取模块清单。返回解析后的数组（失败为空数组）。
function loadManifest() {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    modules = Array.isArray(parsed) ? parsed : parsed.modules || [];
    return modules;
  } catch (e) { /* fall through */ }

  serverLog("加载模块清单失败（请确保 modules/modules.json 存在）", "error");
  modules = [];
  return modules;
}

// 返回模块清单（引用）
function getModules() {
  return modules;
}

// 按 id 查询模块
function getModule(id) {
  return modules.find((m) => m.id === id) || null;
}

module.exports = {
  loadManifest,
  getModules,
  getModule,
};
