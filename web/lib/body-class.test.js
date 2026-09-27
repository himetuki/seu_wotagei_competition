/**
 * web/lib/body-class.mjs 单测 —— L1 body class 引用计数开关（多实例共享 body 类）
 *
 * 覆盖：首次 acquire 加类且 count=1、重复 acquire 只计数不重复 add、release 递减
 * 到 0 时 remove、超额 release 钳 0（不重复 remove、无负数）、两实例（不同
 * className）互不影响、className 非字符串只计数不动 classList、add/remove 调用
 * 次数与计数严格对应（无冗余 DOM 写，归零后再 acquire 重新 add）。
 * 假 document：记录 classList.add/remove 调用序列（断言调用而非真实 DOM）。
 */
const { test, runTests, assert } = require("../../server/test-lib");

const importBodyClass = () => import("./body-class.mjs");

/** 假 document：记录 add/remove 调用序列；带 contains 语义（防实现先查询再写） */
function fakeDocument() {
  const live = new Set();
  const doc = {
    body: {
      classList: {
        adds: [],
        removes: [],
        add(c) { doc.body.classList.adds.push(c); live.add(c); },
        remove(c) { doc.body.classList.removes.push(c); live.delete(c); },
        contains(c) { return live.has(c); },
      },
    },
  };
  return doc;
}

/** 造一个接好假 document 的引用（被测 .mjs 为 ESM，动态 import） */
async function makeRef(className) {
  const { createBodyClassRef } = await importBodyClass();
  const doc = fakeDocument();
  const ref = createBodyClassRef({ document: doc, className });
  return { ref, doc };
}

test("首次 acquire：body.classList.add(className) 且 count=1", async () => {
  const { ref, doc } = await makeRef("battle-mode");
  assert.strictEqual(ref.count(), 0);
  assert.strictEqual(ref.acquire(), 1, "acquire 返回递增后的计数");
  assert.deepStrictEqual(doc.body.classList.adds, ["battle-mode"], "首次 acquire 恰好 add 一次");
  assert.deepStrictEqual(doc.body.classList.removes, []);
});

test("重复 acquire：只计数不重复 add", async () => {
  const { ref, doc } = await makeRef("battle-mode");
  assert.strictEqual(ref.acquire(), 1);
  assert.strictEqual(ref.acquire(), 2, "重复 acquire 计数递增");
  assert.strictEqual(ref.acquire(), 3);
  assert.strictEqual(ref.count(), 3);
  assert.deepStrictEqual(doc.body.classList.adds, ["battle-mode"], "add 只在首次发生一次");
  assert.deepStrictEqual(doc.body.classList.removes, []);
});

test("release：递减计数，到 0 时 remove", async () => {
  const { ref, doc } = await makeRef("battle-mode");
  ref.acquire();
  ref.acquire();
  ref.acquire();
  assert.strictEqual(ref.release(), 2, "未到 0 不 remove");
  assert.strictEqual(ref.release(), 1);
  assert.deepStrictEqual(doc.body.classList.removes, [], "计数未归零前无 remove");
  assert.strictEqual(ref.release(), 0, "归零");
  assert.deepStrictEqual(doc.body.classList.removes, ["battle-mode"], "到 0 时恰好 remove 一次");
  assert.strictEqual(ref.count(), 0);
});

test("超额 release：钳 0、不重复 remove、无负数", async () => {
  const { ref, doc } = await makeRef("battle-mode");
  ref.acquire();
  assert.strictEqual(ref.release(), 0);
  assert.strictEqual(ref.release(), 0, "超额 release 返回 0 不变负");
  assert.strictEqual(ref.release(), 0);
  assert.deepStrictEqual(doc.body.classList.removes, ["battle-mode"], "remove 只发生到 0 的那一次");
  assert.strictEqual(ref.count(), 0);

  const fresh = await makeRef("fresh-mode");
  assert.strictEqual(fresh.ref.release(), 0, "从未 acquire 直接 release 也钳 0");
  assert.deepStrictEqual(fresh.doc.body.classList.removes, [], "零计数 release 不触发 remove");
});

test("两实例（不同 className）互不影响", async () => {
  const { createBodyClassRef } = await importBodyClass();
  const doc = fakeDocument();
  const a = createBodyClassRef({ document: doc, className: "a-mode" });
  const b = createBodyClassRef({ document: doc, className: "b-mode" });

  a.acquire();
  b.acquire();
  b.acquire();
  assert.strictEqual(a.count(), 1, "计数各自独立");
  assert.strictEqual(b.count(), 2);
  assert.deepStrictEqual(doc.body.classList.adds, ["a-mode", "b-mode"], "各自只 add 自己的类");

  assert.strictEqual(a.release(), 0);
  assert.strictEqual(b.count(), 2, "a 的释放不影响 b 的计数");
  assert.deepStrictEqual(doc.body.classList.removes, ["a-mode"], "只移除 a 的类，b-mode 保留");

  assert.strictEqual(a.release(), 0, "a 超额释放钳 0");
  assert.deepStrictEqual(doc.body.classList.removes, ["a-mode"], "b 仍在用，无额外 remove");
});

test("className 非字符串：acquire/release 只计数、不动 classList", async () => {
  for (const bad of [undefined, null, 123]) {
    const { ref, doc } = await makeRef(bad);
    assert.strictEqual(ref.acquire(), 1, `className=${String(bad)} 仍计数`);
    assert.strictEqual(ref.acquire(), 2);
    assert.deepStrictEqual(doc.body.classList.adds, [], "不加类");
    assert.strictEqual(ref.release(), 1, "release 仍计数");
    assert.strictEqual(ref.release(), 0);
    assert.deepStrictEqual(doc.body.classList.removes, [], "不移除类");
  }
});

test("add/remove 调用次数与计数严格对应（归零后再次 acquire 重新 add）", async () => {
  const { ref, doc } = await makeRef("battle-mode");
  const counts = [];
  counts.push(ref.acquire(), ref.acquire(), ref.acquire());
  assert.deepStrictEqual(counts, [1, 2, 3]);
  assert.strictEqual(doc.body.classList.adds.length, 1, "三次 acquire 只写一次 DOM");

  assert.deepStrictEqual([ref.release(), ref.release(), ref.release()], [2, 1, 0]);
  assert.strictEqual(doc.body.classList.removes.length, 1, "三次 release 只写一次 DOM");

  assert.strictEqual(ref.acquire(), 1, "归零后再 acquire 重新计数");
  assert.deepStrictEqual(
    doc.body.classList.adds,
    ["battle-mode", "battle-mode"],
    "归零后再次 acquire 必须重新 add",
  );
  assert.deepStrictEqual(doc.body.classList.removes, ["battle-mode"], "remove 序列不变（无冗余写）");
});

if (require.main === module) {
  runTests("web/lib/body-class.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
