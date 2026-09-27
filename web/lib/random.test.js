/**
 * web/lib/random.mjs 单测 —— P11-B0/B2
 *
 * 覆盖：shuffle（不改长度/元素集不变/不改原数组/等概率位置分布）、pickN（n=0、n≥len、
 * 不重复、非数组与非法 n）、pickOne。harness 跟随 server/test-lib（PASS/FAIL + 退出码）。
 * 被测源为 .mjs（根 package.json "type":"commonjs"），故经动态 import() 加载。
 */
const { test, runTests, assert } = require("../../server/test-lib");

const importRandom = () => import("./random.mjs");

/** 确定性 RNG（mulberry32）：同一 seed 必得同一序列，用于可复现断言 */
function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("shuffle：长度不变、元素集不变、返回新数组且不改原数组", async () => {
  const { shuffle } = await importRandom();
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const copy = src.slice();
  const out = shuffle(src);
  assert.notStrictEqual(out, src, "必须返回新数组（不原地改）");
  assert.strictEqual(out.length, src.length);
  assert.deepStrictEqual(src, copy, "原数组必须逐元素不变");
  assert.deepStrictEqual(out.slice().sort((a, b) => a - b), copy, "元素集必须一致（无丢失/重复）");
});

test("shuffle：空数组/单元素/非数组边界", async () => {
  const { shuffle } = await importRandom();
  assert.deepStrictEqual(shuffle([]), []);
  assert.deepStrictEqual(shuffle([7]), [7]);
  assert.deepStrictEqual(shuffle(null), []);
  assert.deepStrictEqual(shuffle(undefined), []);
  assert.deepStrictEqual(shuffle("nope"), []);
});

test("shuffle：注入 rng 可复现（同 seed 同结果，测试友好）", async () => {
  const { shuffle } = await importRandom();
  const src = Array.from({ length: 20 }, (_, i) => i);
  const a = shuffle(src, seededRng(42));
  const b = shuffle(src, seededRng(42));
  assert.deepStrictEqual(a, b, "同一 seed 必须产生同一排列");
  assert.notDeepStrictEqual(a, src, "20 元素下极不可能是恒等排列（shuffle 真的动了）");
});

test("shuffle：位置分布合理（1000 次 × 4 元素，宽松阈值防 flaky）", async () => {
  const { shuffle } = await importRandom();
  const items = ["a", "b", "c", "d"];
  const RUNS = 1000;
  const freq = new Map(items.map((x) => [x, [0, 0, 0, 0]]));
  for (let r = 0; r < RUNS; r++) {
    const out = shuffle(items);
    out.forEach((x, pos) => freq.get(x)[pos] += 1);
  }
  // 期望每格 250；二项分布 σ≈13.7，阈值 [150,350] 约 ±7σ，正常实现不会越界
  for (const x of items) {
    for (let pos = 0; pos < items.length; pos++) {
      const n = freq.get(x)[pos];
      assert.ok(
        n >= 150 && n <= 350,
        `元素 ${x} 在第 ${pos} 位出现 ${n} 次（1000 次洗牌），超出 [150,350] —— 分布可疑`
      );
    }
  }
});

test("pickN：n=0 / n≥len / 不重复取样 / 不改原数组", async () => {
  const { pickN } = await importRandom();
  const src = [1, 2, 3, 4, 5];
  const copy = src.slice();

  assert.deepStrictEqual(pickN(src, 0), []);
  assert.deepStrictEqual(pickN(src, -3), [], "负数按 0 处理");
  assert.deepStrictEqual(pickN(src, NaN), []);
  assert.deepStrictEqual(pickN(src, "abc"), []);

  const two = pickN(src, 2);
  assert.strictEqual(two.length, 2);
  assert.strictEqual(new Set(two).size, 2, "不许重复取样");
  two.forEach((x) => assert.ok(src.includes(x), "取样必须来自入参"));

  const all = pickN(src, src.length);
  assert.deepStrictEqual(all.slice().sort((a, b) => a - b), copy, "n≥len 时返回全量元素各一次");
  const over = pickN(src, 99);
  assert.strictEqual(over.length, src.length, "n 超长按全量处理");
  assert.deepStrictEqual(src, copy, "原数组不动");

  assert.deepStrictEqual(pickN(null, 3), []);
  assert.deepStrictEqual(pickN([], 3), []);
});

test("pickN：多次取样覆盖全部元素（不重复 + 不总是同几项）", async () => {
  const { pickN } = await importRandom();
  const src = ["p1", "p2", "p3", "p4", "p5", "p6"];
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const got = pickN(src, 3);
    assert.strictEqual(new Set(got).size, 3);
    got.forEach((x) => seen.add(x));
  }
  assert.strictEqual(seen.size, src.length, "200 次抽 3 应覆盖全部 6 人");
});

test("pickOne：空 → null、单元素 → 该元素、结果 ∈ 入参", async () => {
  const { pickOne } = await importRandom();
  assert.strictEqual(pickOne([]), null);
  assert.strictEqual(pickOne(null), null);
  assert.strictEqual(pickOne(["solo"]), "solo");
  const src = ["x", "y", "z"];
  for (let i = 0; i < 50; i++) assert.ok(src.includes(pickOne(src)));
});

test("shuffle：rng 越下界（负值）同样被钳制，不产生越界键/元素丢失", async () => {
  const { shuffle } = await importRandom();
  const out = shuffle([1, 2, 3, 4], () => -0.5);
  assert.deepStrictEqual(
    [...out].sort(),
    [1, 2, 3, 4],
    "负 j 曾把元素写到 \"-1\" 键上致其静默丢失；双向钳制后仍为合法排列"
  );
});

if (require.main === module) {
  runTests("web/lib/random.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
