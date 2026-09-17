/**
 * server/utils.js 路径安全助手单测
 *
 * 背景：本项目插件层（modules/**）与数据层（resource/**）在便携形态下是可写目录，
 * 凡"外部输入 → 文件路径"的汇聚点必须经 safeJoin/safeBasename 校验，避免 ../ 逃逸。
 * 这些用例锁定三个助手的行为契约，防止未来被弱化。
 */
const path = require("path");
const { test, runTests, assert } = require("./test-lib");
const { safeJoin, safeBasename } = require("./utils");

const BASE = path.join("D:", "t", "resource", "musics", "1yearplus");

test("safeJoin：目录内的合法拼接通过，返回规范化绝对路径", () => {
  const p = safeJoin(BASE, "song.mp3");
  assert.strictEqual(p, path.resolve(BASE, "song.mp3"));
  // 多段与内嵌合法子目录
  assert.strictEqual(safeJoin(BASE, "sub", "a.mp3"), path.resolve(BASE, "sub", "a.mp3"));
});

test("safeJoin：../ 逃逸（单级/多级/中段）与绝对路径一律抛错", () => {
  for (const evil of ["../secret", "../../server/database.js", "a/../../b", "/etc/passwd"]) {
    let threw = false;
    try { safeJoin(BASE, evil); } catch (e) { threw = true; }
    assert.ok(threw, `应拒绝: ${evil}`);
  }
});

test("safeJoin：路径指向 base 本身被允许（rel 为空串）", () => {
  assert.strictEqual(safeJoin(BASE, "."), path.resolve(BASE));
});

test("safeBasename：纯文件名通过，含目录成分/null/空/点段一律拒绝", () => {
  assert.strictEqual(safeBasename("song.mp3"), "song.mp3");
  assert.strictEqual(safeBasename("中文名 - 副本.wav"), "中文名 - 副本.wav");
  assert.strictEqual(safeBasename("../../server/database.js"), null);
  assert.strictEqual(safeBasename("a/b.mp3"), null);
  assert.strictEqual(safeBasename("a\\b.mp3"), null);
  assert.strictEqual(safeBasename(".."), null);
  assert.strictEqual(safeBasename("."), null);
  assert.strictEqual(safeBasename(""), null);
  assert.strictEqual(safeBasename(null), null);
  assert.strictEqual(safeBasename(undefined), null);
  assert.strictEqual(safeBasename(123), null);
});

runTests();
