/**
 * 构建辅助脚本：把所有静态文件内联到 JS 模块中
 * 解决 pkg 无法可靠打包 assets 的问题
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "server", "inlined-assets.js");

const dirs = ["html", "css", "js", "resource/images", "favicon.ico"];

const assets = {};

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
