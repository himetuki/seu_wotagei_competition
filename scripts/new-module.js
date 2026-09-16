#!/usr/bin/env node
/**
 * 模块脚手架：生成一个新模块并注册进 modules/modules.json
 *
 * 用法：
 *   node scripts/new-module.js <模块id> "<模块名称>" [--server]
 *   示例：
 *   node scripts/new-module.js my-feature "我的功能"
 *   node scripts/new-module.js my-feature "我的功能" --server   // 附带 server/routes.js + db.js 模板
 *
 * 模块id 要求：小写字母/数字/连字符，全局唯一。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MODULES_DIR = path.join(ROOT, "modules");
const TPL_DIR = path.join(MODULES_DIR, "_template");
const MANIFEST_PATH = path.join(MODULES_DIR, "modules.json");

// ---- 参数解析 ----
const args = process.argv.slice(2);
const serverFlag = args.includes("--server");
const positional = args.filter((a) => !a.startsWith("--"));

const id = positional[0];
const name = positional[1] || id;

if (!id) {
  console.error("用法: node scripts/new-module.js <模块id> \"<模块名称>\" [--server]");
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
  console.error(`非法模块id「${id}」: 仅允许小写字母/数字/连字符，且不能以连字符开头`);
  process.exit(1);
}

const targetDir = path.join(MODULES_DIR, id);
if (fs.existsSync(targetDir)) {
  console.error(`模块目录已存在: ${targetDir}`);
  process.exit(1);
}

// ---- 复制模板 ----
fs.mkdirSync(targetDir, { recursive: true });
const tplFiles = fs.readdirSync(TPL_DIR);
for (const file of tplFiles) {
  if (file === "server") continue;
  const src = path.join(TPL_DIR, file);
  const dst = path.join(targetDir, file);
  let content = fs.readFileSync(src, "utf8");
  content = content
    .replace(/__MODULE_ID__/g, id)
    .replace(/__MODULE_NAME__/g, name);
  fs.writeFileSync(dst, content, "utf8");
  console.log(`✓ 生成 ${path.relative(ROOT, dst)}`);
}

// ---- 可选 server 端 ----
if (serverFlag) {
  fs.mkdirSync(path.join(targetDir, "server"), { recursive: true });
  const routesTpl = `/**
 * ${id} 模块后端路由（可选）
 * 导出 (app, ctx) => {...}，ctx 由模块加载器注入共享设施：
 *   ctx.dbManager / ctx.serverLog / ctx.dataDir
 */
module.exports = (app, { dbManager, serverLog }) => {
  // 示例: app.get("/api/${id}/ping", (req, res) => res.json({ message: "pong" }));
};
`;
  const dbTpl = `/**
 * ${id} 模块数据库定义（可选）
 * 格式: [{ name: "数据库名", defaultValue: {...} }]  或  { databases: [...] }
 * 数据库文件将保存在 resource/json/<name>.json
 */
module.exports = [];
`;
  fs.writeFileSync(path.join(targetDir, "server", "routes.js"), routesTpl, "utf8");
  fs.writeFileSync(path.join(targetDir, "server", "db.js"), dbTpl, "utf8");
  console.log(`✓ 生成 server/routes.js（示例）`);
  console.log(`✓ 生成 server/db.js（示例）`);
}

// ---- 注册进 modules.json ----
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const list = Array.isArray(manifest) ? manifest : manifest.modules;

if (list.some((m) => m.id === id)) {
  console.warn(`⚠ 清单中已存在 id=${id}，跳过注册`);
} else {
  const maxOrder = list.reduce((max, m) => Math.max(max, m.order || 0), 0);
  list.push({
    id,
    name,
    description: "模块说明",
    icon: "🧩",
    nav: ["select"],
    order: maxOrder + 1,
  });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`✓ 已注册进 modules/modules.json（nav=select，order=${maxOrder + 1}）`);
}

console.log(`\n完成！重启 node server.js 后访问 http://localhost:3000/m/${id}`);
console.log("如需自定义模块元信息，请编辑 modules/<id>/module.json。");