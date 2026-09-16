/**
 * 构建辅助脚本：把所有静态文件内联到 JS 模块中
 * 解决 pkg 无法可靠打包 assets 的问题
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "server", "inlined-assets.js");

// html/ 旧跳转存根已随迁移删除，不再内联
const dirs = ["css", "js", "modules", "resource/images", "favicon.ico"];

const assets = {};

function isServerSubdir(dir) {
  // modules/<id>/server 为后端代码，由 pkg 打包，不内联进静态资源
  const parts = dir.split(/[\\/]/);
  return parts.includes("server");
}

function walk(dir, base) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return;
  const stat = fs.statSync(full);
  if (stat.isFile()) {
    const key = dir.replace(/\\/g, "/");
    const buf = fs.readFileSync(full);
    assets[key] = { data: buf.toString("base64"), isBinary: isBinaryExt(key) };
    return;
  }
  const entries = fs.readdirSync(full, { withFileTypes: true });
  for (const entry of entries) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isServerSubdir(rel)) continue; // 跳过 server 目录
      walk(rel, base);
    } else if (entry.isFile()) {
      const key = rel.replace(/\\/g, "/");
      const buf = fs.readFileSync(path.join(ROOT, rel));
      assets[key] = { data: buf.toString("base64"), isBinary: isBinaryExt(key) };
    }
  }
}

function isBinaryExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".ico", ".mp3", ".wav", ".woff", ".woff2", ".ttf"].includes(ext);
}

for (const dir of dirs) {
  walk(dir, dir);
}

// pkg 兼容：sql.js 的 wasm 以 base64 内联，供 server/sqlite-store.js 以 wasmBinary 初始化
const sqlWasmPath = path.join(ROOT, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
if (fs.existsSync(sqlWasmPath)) {
  assets["sql-wasm.wasm"] = { data: fs.readFileSync(sqlWasmPath).toString("base64"), isBinary: true };
}

const mimeMap = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".wasm": "application/wasm",
};

// 生成 JS 模块
const lines = [];
lines.push("// 自动生成，请勿手动编辑");
lines.push(`// 生成时间: ${new Date().toISOString()}`);
lines.push(`// 文件总数: ${Object.keys(assets).length}`);
lines.push("");
lines.push("const assets = {");

for (const [key, val] of Object.entries(assets)) {
  const ext = path.extname(key).toLowerCase();
  const mime = mimeMap[ext] || "application/octet-stream";
  lines.push(`  ${JSON.stringify(key)}: {`);
  lines.push(`    data: ${JSON.stringify(val.data)},`);
  lines.push(`    mime: ${JSON.stringify(mime)},`);
  lines.push(`    isBinary: ${val.isBinary},`);
  lines.push(`  },`);
}

lines.push("};");
lines.push("");
lines.push("const mimeMap = {");
for (const [ext, mime] of Object.entries(mimeMap)) {
  lines.push(`  ${JSON.stringify(ext)}: ${JSON.stringify(mime)},`);
}
lines.push("};");
lines.push("");
lines.push("// 所有内联资源的相对路径（用于匹配请求）");
lines.push("const assetKeys = Object.keys(assets);");
lines.push("");
lines.push("function getAsset(filePath) {");
lines.push("  // 1. 去掉开头的 /");
lines.push("  let key = filePath.replace(/^\\/+/, '');");
lines.push("  // 2. 把反斜杠转成正斜杠");
lines.push("  key = key.replace(/\\\\/g, '/');");
lines.push("  // 3. 直接匹配");
lines.push("  if (assets[key]) return assets[key];");
lines.push("  // 4. 尝试匹配路径后缀（去掉盘符前缀如 D:/Code/HTML/）");
lines.push("  for (const ak of assetKeys) {");
lines.push("    if (key.endsWith('/' + ak) || key.endsWith(ak)) {");
lines.push("      return assets[ak];");
lines.push("    }");
lines.push("  }");
lines.push("  return null;");
lines.push("}");
lines.push("");
lines.push("function getMime(filePath) {");
lines.push("  const ext = require('path').extname(filePath).toLowerCase();");
lines.push("  return mimeMap[ext] || 'application/octet-stream';");
lines.push("}");
lines.push("");
lines.push("module.exports = { assets, getAsset, getMime };");

fs.writeFileSync(OUT, lines.join("\n"), "utf8");
console.log(`✓ 已生成: ${OUT} (${Object.keys(assets).length} 个文件)`);

// ===== 生成模块 server 注册表 =====
// 用「静态 require」引用各模块的 server/db.js 与 server/routes.js，
// 使 pkg 在依赖图分析时自动内嵌这些文件（pkg 的 scripts/assets 通配在此环境不可靠）。
// module-loader 在 pkg 模式下改从此注册表读取模块后端。
const MODULE_SERVERS_OUT = path.join(ROOT, "server", "module-servers.js");
const msLines = [];
msLines.push("// 自动生成（build-inline.js），请勿手动编辑");
msLines.push("// 模块 server 端文件注册表：静态 require 使 pkg 打包时自动内嵌");
msLines.push("const entries = {");
let mods = [];
try {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "modules", "modules.json"), "utf8"));
  mods = Array.isArray(raw) ? raw : raw.modules || [];
} catch (e) {
  mods = [];
}
for (const mod of mods) {
  const id = mod && mod.id;
  if (!id) continue;
  const dbPath = path.join(ROOT, "modules", id, "server", "db.js");
  const routesPath = path.join(ROOT, "modules", id, "server", "routes.js");
  const hasDb = fs.existsSync(dbPath);
  const hasRoutes = fs.existsSync(routesPath);
  if (!hasDb && !hasRoutes) continue;
  msLines.push(`  ${JSON.stringify(id)}: {`);
  if (hasDb) {
    msLines.push(`    db: require(${JSON.stringify(path.join("..", "modules", id, "server", "db.js").replace(/\\/g, "/"))}),`);
  }
  if (hasRoutes) {
    msLines.push(`    routes: require(${JSON.stringify(path.join("..", "modules", id, "server", "routes.js").replace(/\\/g, "/"))}),`);
  }
  msLines.push(`  },`);
}
msLines.push("};");
msLines.push("module.exports = { entries };");
fs.writeFileSync(MODULE_SERVERS_OUT, msLines.join("\n"), "utf8");
console.log(`✓ 已生成: ${MODULE_SERVERS_OUT} (${(mods.filter((m) => m && m.id)).length} 个模块)`);
