/**
 * web/lib/undo.mjs 单测 —— P11-B0/B2
 *
 * 覆盖：push/undo/canUndo/peek/size/clear 基本契约、上限策略（FIFO 丢最旧、Infinity、
 * 非法 limit 回退）、toArray/load（持久化往返）、引用语义（不做隐式深拷贝）。
 */
const { test, runTests, assert } = require("../../server/test-lib");

const importUndo = () => import("./undo.mjs");

test("push/undo/canUndo：LIFO 弹出，栈空 → null", async () => {
  const { createUndoStack } = await importUndo();
  const undo = createUndoStack();

  assert.strictEqual(undo.canUndo(), false);
  assert.strictEqual(undo.size(), 0);
  assert.strictEqual(undo.undo(), null, "空栈 undo 返回 null（不抛错）");
  assert.strictEqual(undo.peek(), null);

  undo.push({ step: 1 });
  undo.push({ step: 2 });
  assert.strictEqual(undo.size(), 2);
  assert.strictEqual(undo.canUndo(), true);
  assert.deepStrictEqual(undo.peek(), { step: 2 }, "peek 不弹出");

  assert.deepStrictEqual(undo.undo(), { step: 2 }, "后进先出");
  assert.deepStrictEqual(undo.undo(), { step: 1 });
  assert.strictEqual(undo.canUndo(), false);
  assert.strictEqual(undo.undo(), null);
});

test("clear：清空后不可撤销（但实例仍可用）", async () => {
  const { createUndoStack } = await importUndo();
  const undo = createUndoStack();
  undo.push("a");
  undo.push("b");
  undo.clear();
  assert.strictEqual(undo.canUndo(), false);
  assert.strictEqual(undo.size(), 0);
  assert.deepStrictEqual(undo.toArray(), []);
  undo.push("c");
  assert.deepStrictEqual(undo.undo(), "c");
});

test("上限：缺省 50，超出丢最旧（FIFO）", async () => {
  const { createUndoStack, MAX_HISTORY } = await importUndo();
  const undo = createUndoStack();
  for (let i = 1; i <= MAX_HISTORY + 10; i++) undo.push(i);

  assert.strictEqual(undo.size(), MAX_HISTORY, "不得超过缺省上限");
  assert.deepStrictEqual(undo.peek(), MAX_HISTORY + 10, "栈顶恒为最新");
  assert.deepStrictEqual(undo.toArray()[0], 11, "最旧的 10 条被淘汰");

  const small = createUndoStack({ limit: 3 });
  [1, 2, 3, 4].forEach((n) => small.push(n));
  assert.deepStrictEqual(small.toArray(), [2, 3, 4]);
  assert.deepStrictEqual(small.undo(), 4);
});

test("上限：limit=Infinity 不限；非法 limit 回退缺省", async () => {
  const { createUndoStack, MAX_HISTORY } = await importUndo();
  const inf = createUndoStack({ limit: Infinity });
  for (let i = 0; i < MAX_HISTORY + 20; i++) inf.push(i);
  assert.strictEqual(inf.size(), MAX_HISTORY + 20);

  for (const bad of [0, -5, NaN, "abc", null, undefined]) {
    const undo = createUndoStack({ limit: bad });
    for (let i = 0; i < MAX_HISTORY + 5; i++) undo.push(i);
    assert.strictEqual(undo.size(), MAX_HISTORY, `非法 limit ${JSON.stringify(bad)} 应回退缺省`);
  }
});

test("toArray/load：持久化往返（旧→新顺序，防御性拷贝）", async () => {
  const { createUndoStack } = await importUndo();
  const src = createUndoStack();
  src.push({ id: 1 });
  src.push({ id: 2 });

  const arr = src.toArray();
  assert.deepStrictEqual(arr, [{ id: 1 }, { id: 2 }]);
  arr.push({ id: 3 });
  assert.strictEqual(src.size(), 2, "toArray 是副本：外部改动不回污染栈");

  const dst = createUndoStack();
  assert.strictEqual(dst.load([{ id: 1 }, { id: 2 }]), 2);
  assert.deepStrictEqual(dst.undo(), { id: 2 });
  assert.strictEqual(dst.load(null), 0, "非数组按空处理");
});

test("load：超上限时只保留最新 limit 条", async () => {
  const { createUndoStack } = await importUndo();
  const undo = createUndoStack({ limit: 2 });
  undo.load([1, 2, 3, 4]);
  assert.deepStrictEqual(undo.toArray(), [3, 4]);
});

test("快照按引用保存（不做隐式深拷贝）—— 调用方负责传入已定型对象", async () => {
  const { createUndoStack } = await importUndo();
  const undo = createUndoStack();
  const live = { phase: "playing" };
  undo.push(live);
  live.phase = "mutated";
  assert.deepStrictEqual(undo.peek(), { phase: "mutated" }, "引用语义：文档已声明调用方应先定型（既有实现推入字面量/深拷贝）");
});

test("load：limit:Infinity + 超大数组逐条灌入，不因 spread 展开爆栈", async () => {
  const { createUndoStack } = await importUndo();
  const undo = createUndoStack({ limit: Infinity });
  const big = Array.from({ length: 100_000 }, (_, i) => ({ i }));
  assert.strictEqual(undo.load(big), 100_000, "实参数超 V8 上限会抛 RangeError，load 是恢复入口不能崩");
  assert.strictEqual(undo.size(), 100_000);
  assert.strictEqual(undo.peek().i, 99_999, "顺序保持旧→新，栈顶为最新");
});

if (require.main === module) {
  runTests("web/lib/undo.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
