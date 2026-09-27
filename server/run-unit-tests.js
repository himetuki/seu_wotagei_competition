/**
 * 单元测试统一入口 —— node server/run-unit-tests.js
 *
 * 逐个以子进程运行全部 *.test.js（进程级隔离：端口、模块单例、cordis 状态互不干扰，
 * 单文件挂掉不污染后续文件），聚合退出码：任一文件失败 → 本命令退出码 1。
 * 与既有命令并存且互不影响：
 *   node server.js --test          # 既有：数据库操作 6 项测试（交互式服务器内）
 *   node server.js --test-cordis   # 既有：cordis 装配自检（selfcheck.cjs）
 */
const { spawnSync } = require("child_process");
const path = require("path");

const APP_ROOT = path.join(__dirname, "..");

const FILES = [
  "server/paths.test.js",
  "server/utils.test.js",
  "server/http/router.test.js",
  "server/http/shim.test.js",
  "server/http/index.test.js",
  "server/http/static.test.js",
  "server/cordis/services/modules.test.js",
  "server/cordis/services/server.test.js",
  "server/cordis/services/db.test.js",
  "web/loader.test.js",
  "web/icons.test.js",
  // P11：内核组件注册表 + L1 共享库（random/persist/undo）
  "web/ui.test.js",
  "web/lib/random.test.js",
  "web/lib/persist.test.js",
  "web/lib/undo.test.js",
  "web/components/compose.test.js",
  // 响应式装配基座（petite-vue vendor；node 经 deps 注入 fake，永不加载 vendor）
  "web/lib/reactive.test.js",
  // L1 共享库补充：定时器登记表（组件卸载安全）+ body class 引用计数开关
  "web/lib/timers.test.js",
  "web/lib/body-class.test.js",
];

let failed = 0;
const failedFiles = [];

for (const rel of FILES) {
  const abs = path.join(APP_ROOT, rel);
  const r = spawnSync(process.execPath, [abs], { stdio: "inherit", cwd: APP_ROOT });
  const code = r.status === null ? 1 : r.status;
  if (code !== 0) {
    failed += 1;
    failedFiles.push(rel);
  }
}

console.log("");
if (failed === 0) {
  console.log(`UNIT TESTS: ALL PASS（${FILES.length} 个测试文件）`);
} else {
  console.log(`UNIT TESTS: ${failed}/${FILES.length} 个文件失败:`);
  failedFiles.forEach((f) => console.log(`  - ${f}`));
}
process.exit(failed === 0 ? 0 : 1);
