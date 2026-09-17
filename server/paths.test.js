/**
 * server/paths.cjs — 便携化路径解析单测（P6b）
 *
 * 铁门用例：dev 默认（不设任何 env）解析结果必须与历史布局逐字节同路径；
 * env 覆盖（Y_STAGE_PLUGINS_DIR / Y_STAGE_RESOURCE_DIR）生效且切换便携布局。
 * resolvePaths(envObj) 为纯函数（不触碰 process.env）；取值函数走 process.env
 * （用例内 set/delete 后即时生效）。
 */
const path = require("path");
const { test, runTests, assert } = require("./test-lib");
const paths = require("./paths.cjs");

test("dev 默认：清单/模块/资源路径与历史布局逐字节一致（铁门）", () => {
  const p = paths.resolvePaths({}); // 空 env = 未设任何覆盖
  assert.strictEqual(p.appRoot, path.join(__dirname, ".."));
  assert.strictEqual(p.backendManifestPath, path.join(__dirname, "..", "server", "plugins.json"));
  assert.strictEqual(p.frontManifestPath, path.join(__dirname, "..", "web", "front.json"));
  assert.strictEqual(p.modulesDir, path.join(__dirname, "..", "modules"));
  assert.strictEqual(p.modulesManifestPath, path.join(__dirname, "..", "modules", "modules.json"));
  assert.strictEqual(p.resourceDir, path.join(__dirname, "..", "resource"));
  assert.strictEqual(p.jsonDir, path.join(__dirname, "..", "resource", "json"));
  assert.strictEqual(p.sqliteDir, path.join(__dirname, "..", "resource", "sqlite"));
  assert.strictEqual(p.sqliteFile, path.join(__dirname, "..", "resource", "sqlite", "y-stage.sqlite"));
  assert.strictEqual(p.musicsDir, path.join(__dirname, "..", "resource", "musics"));
  assert.strictEqual(p.portable, false);
});

test("env 覆盖：Y_STAGE_PLUGINS_DIR → 便携扁平布局（清单在层根，modules 在层内）", () => {
  const p = paths.resolvePaths({ Y_STAGE_PLUGINS_DIR: path.join("X:", "portable", "plugins") });
  assert.strictEqual(p.modulesDir, path.join("X:", "portable", "plugins", "modules"));
  assert.strictEqual(p.modulesManifestPath, path.join("X:", "portable", "plugins", "modules", "modules.json"));
  assert.strictEqual(p.backendManifestPath, path.join("X:", "portable", "plugins", "plugins.json"));
  assert.strictEqual(p.frontManifestPath, path.join("X:", "portable", "plugins", "front.json"));
  assert.strictEqual(p.portable, true);
  // 数据层未被覆盖 → 仍锚定 app 根
  assert.strictEqual(p.resourceDir, path.join(__dirname, "..", "resource"));
});

test("env 覆盖：Y_STAGE_APP_ROOT → 应用根整体迁移（清单/模块/资源随动，非便携布局）", () => {
  const p = paths.resolvePaths({ Y_STAGE_APP_ROOT: path.join("X:", "app") });
  assert.strictEqual(p.appRoot, path.join("X:", "app"));
  assert.strictEqual(p.backendManifestPath, path.join("X:", "app", "server", "plugins.json"));
  assert.strictEqual(p.frontManifestPath, path.join("X:", "app", "web", "front.json"));
  assert.strictEqual(p.modulesDir, path.join("X:", "app", "modules"));
  assert.strictEqual(p.modulesManifestPath, path.join("X:", "app", "modules", "modules.json"));
  assert.strictEqual(p.resourceDir, path.join("X:", "app", "resource"));
  assert.strictEqual(p.sqliteFile, path.join("X:", "app", "resource", "sqlite", "y-stage.sqlite"));
  assert.strictEqual(p.portable, false);
});

test("env 覆盖：Y_STAGE_RESOURCE_DIR → 数据层外置（json/sqlite/musics 跟随）", () => {
  const p = paths.resolvePaths({ Y_STAGE_RESOURCE_DIR: path.join("X:", "data") });
  assert.strictEqual(p.resourceDir, path.join("X:", "data"));
  assert.strictEqual(p.jsonDir, path.join("X:", "data", "json"));
  assert.strictEqual(p.sqliteFile, path.join("X:", "data", "sqlite", "y-stage.sqlite"));
  assert.strictEqual(p.musicsDir, path.join("X:", "data", "musics"));
  assert.strictEqual(p.portable, true);
  // 插件层未被覆盖 → 仍为 dev 布局
  assert.strictEqual(p.backendManifestPath, path.join(__dirname, "..", "server", "plugins.json"));
});

test("取值函数：默认返回 dev 路径，改 process.env 后即时生效（恢复后回默认）", () => {
  assert.strictEqual(paths.modulesDir(), path.join(__dirname, "..", "modules"));
  assert.strictEqual(paths.isPortable(), false);
  try {
    process.env.Y_STAGE_PLUGINS_DIR = path.join("X:", "p");
    process.env.Y_STAGE_RESOURCE_DIR = path.join("X:", "r");
    assert.strictEqual(paths.modulesDir(), path.join("X:", "p", "modules"));
    assert.strictEqual(paths.backendManifestPath(), path.join("X:", "p", "plugins.json"));
    assert.strictEqual(paths.resourceDir(), path.join("X:", "r"));
    assert.strictEqual(paths.sqliteFile(), path.join("X:", "r", "sqlite", "y-stage.sqlite"));
    assert.strictEqual(paths.isPortable(), true);
  } finally {
    delete process.env.Y_STAGE_PLUGINS_DIR;
    delete process.env.Y_STAGE_RESOURCE_DIR;
  }
  assert.strictEqual(paths.modulesDir(), path.join(__dirname, "..", "modules"));
  assert.strictEqual(paths.isPortable(), false);
});

if (require.main === module) {
  runTests("server/paths.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
