/**
 * web/lib/timers.mjs 单测 —— L1 定时器登记表（组件卸载安全的 setTimeout 包装）
 *
 * 覆盖：later 登记即跟踪（size 递增）、回调触发后自动出表、clear(id) 单个取消
 * （经注入的 clearTimeout 取消底层定时器）、clearAll 全清、dispose（清全部在飞 +
 * 卸载后 later 返回 null 不抛错）与幂等、多定时器独立触发、ms 畸形值（0/NaN/负数）
 * 归一不崩、回调内重入 later。
 * 假时钟：注入收集 {id, fn, ms} 队列的 fake（id 自增），测试手动触发队列里的 fn，
 * 触发后过微任务边界再断言（实现可能在回调后才出表）。
 */
const { test, runTests, assert } = require("../../server/test-lib");

const importTimers = () => import("./timers.mjs");

/**
 * 假时钟：setTimeout 收集条目（不真计时），clearTimeout 标记取消（模拟宿主语义：
 * 已取消的条目不再可触发）。测试经 fire/fireAll 手动触发。
 */
function fakeClock() {
  let nextId = 0;
  const entries = []; // { id, fn, ms, fired, cancelled }
  const clearedIds = [];
  const setTimeout_ = (fn, ms) => {
    const entry = { id: ++nextId, fn, ms, fired: false, cancelled: false };
    entries.push(entry);
    return entry.id;
  };
  const clearTimeout_ = (id) => {
    clearedIds.push(id);
    const entry = entries.find((e) => e.id === id);
    if (entry) entry.cancelled = true;
  };
  const pending = () => entries.filter((e) => !e.fired && !e.cancelled);
  /** 过微任务边界（实现可能在回调后才出表） */
  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };
  /** 手动触发第 index 个在飞条目（0 基，按调度顺序） */
  const fire = async (index = 0) => {
    const entry = pending()[index];
    if (!entry) return false;
    entry.fired = true;
    entry.fn();
    await settle();
    return true;
  };
  /** 依次触发全部在飞条目（先快照：回调内新登记的不在本次触发范围） */
  const fireAll = async () => {
    const snapshot = pending();
    for (const entry of snapshot) {
      if (entry.fired || entry.cancelled) continue; // 前序回调可能 clear 掉后序条目
      entry.fired = true;
      entry.fn();
    }
    await settle();
    return snapshot.length;
  };
  return { entries, clearedIds, pending, fire, fireAll, setTimeout: setTimeout_, clearTimeout: clearTimeout_ };
}

/** 造一个接好假时钟的登记表（被测 .mjs 为 ESM，动态 import） */
async function makeRegistry() {
  const { createTimerRegistry } = await importTimers();
  const clock = fakeClock();
  const reg = createTimerRegistry({ setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  return { reg, clock };
}

test("later：登记即跟踪（size 递增），触发后执行且回调后自动出表", async () => {
  const { reg, clock } = await makeRegistry();
  let ran = 0;
  assert.strictEqual(reg.size(), 0, "初始为空");
  const id = reg.later(() => { ran += 1; }, 100);
  assert.ok(id !== null && id !== undefined, "later 返回可用 id");
  assert.strictEqual(reg.size(), 1, "登记即跟踪");
  assert.strictEqual(ran, 0, "未触发不执行");

  assert.ok(await clock.fire(0), "假时钟触发在飞条目");
  assert.strictEqual(ran, 1, "触发后回调执行");
  assert.strictEqual(reg.size(), 0, "回调后自动出表（size 递减）");
});

test("clear(id)：size 减一、回调不再触发、经注入的 clearTimeout 取消底层定时器", async () => {
  const { reg, clock } = await makeRegistry();
  let ranA = 0;
  let ranB = 0;
  const idA = reg.later(() => { ranA += 1; }, 10);
  reg.later(() => { ranB += 1; }, 20); // 干扰项：不受 clear 影响

  reg.clear(idA);
  assert.strictEqual(reg.size(), 1, "clear 后该条目出表");
  assert.ok(clock.clearedIds.length >= 1, "取消必须走注入的 clearTimeout（否则底层定时器泄漏）");

  await clock.fireAll();
  assert.strictEqual(ranA, 0, "已 clear 的回调不触发");
  assert.strictEqual(ranB, 1, "未 clear 的不受影响");
});

test("clearAll：清空全部在飞（size=0、全部不触发、逐个走 clearTimeout）", async () => {
  const { reg, clock } = await makeRegistry();
  const ran = [0, 0, 0];
  for (let i = 0; i < 3; i++) reg.later(() => { ran[i] += 1; }, 10 * (i + 1));
  assert.strictEqual(reg.size(), 3);

  reg.clearAll();
  assert.strictEqual(reg.size(), 0, "clearAll 后全出表");
  assert.strictEqual(clock.clearedIds.length, 3, "三个底层定时器都被取消");
  await clock.fireAll();
  assert.deepStrictEqual(ran, [0, 0, 0], "清空后全部不触发");
});

test("dispose：清空全部在飞，此后 later 返回 null 且不抛错", async () => {
  const { reg, clock } = await makeRegistry();
  let ran = 0;
  reg.later(() => { ran += 1; }, 10);
  reg.later(() => { ran += 1; }, 20);

  reg.dispose();
  assert.strictEqual(reg.size(), 0, "dispose 清空全部在飞");
  assert.strictEqual(clock.clearedIds.length, 2, "在飞底层定时器逐个取消");
  await clock.fireAll();
  assert.strictEqual(ran, 0, "dispose 后在飞回调不触发");

  let second;
  assert.doesNotThrow(() => { second = reg.later(() => {}, 5); }, "卸载后 later 不抛错");
  assert.strictEqual(second, null, "卸载后 later 返回 null");
  assert.strictEqual(reg.size(), 0, "卸载后不新登记");
});

test("dispose 幂等：重复调用无异常，卸载语义保持", async () => {
  const { reg, clock } = await makeRegistry();
  let ran = 0;
  reg.later(() => { ran += 1; }, 10);
  assert.doesNotThrow(() => { reg.dispose(); reg.dispose(); reg.dispose(); });
  assert.strictEqual(reg.size(), 0);
  assert.strictEqual(reg.later(() => {}, 5), null, "多次 dispose 后仍卸载安全");
  await clock.fireAll();
  assert.strictEqual(ran, 0);
});

test("多定时器各自独立触发互不干扰", async () => {
  const { reg, clock } = await makeRegistry();
  const ran = { a: 0, b: 0, c: 0 };
  reg.later(() => { ran.a += 1; }, 10);
  reg.later(() => { ran.b += 1; }, 20);
  reg.later(() => { ran.c += 1; }, 30);
  assert.strictEqual(reg.size(), 3);

  await clock.fire(1); // 只触发中间调度的那一个
  assert.deepStrictEqual(ran, { a: 0, b: 1, c: 0 }, "其余两个不受影响");
  assert.strictEqual(reg.size(), 2, "仅触发的那个出表");

  await clock.fireAll(); // 触发剩余两个
  assert.deepStrictEqual(ran, { a: 1, b: 1, c: 1 }, "各自独立执行");
  assert.strictEqual(reg.size(), 0);
});

test("ms 畸形值（0/NaN/负数）不崩：原样透传底层（宿主按 0 处理），登记触发照常", async () => {
  for (const ms of [0, NaN, -5]) {
    const { reg, clock } = await makeRegistry();
    let ran = 0;
    const id = reg.later(() => { ran += 1; }, ms);
    assert.ok(id !== null && id !== undefined, `ms=${String(ms)} 仍返回可用 id`);
    assert.strictEqual(reg.size(), 1, `ms=${String(ms)} 照常登记（实现：ms 原样透传，宿主归一为 0）`);

    await clock.fire(0);
    assert.strictEqual(ran, 1, `ms=${String(ms)} 可正常触发`);
    assert.strictEqual(reg.size(), 0, `ms=${String(ms)} 触发后出表`);
  }
});

test("回调内重入 later：登记成功并可再次触发", async () => {
  const { reg, clock } = await makeRegistry();
  let inner = 0;
  reg.later(() => { reg.later(() => { inner += 1; }, 50); }, 10);
  assert.strictEqual(reg.size(), 1);

  await clock.fire(0); // 触发外层（回调内登记内层）
  assert.strictEqual(reg.size(), 1, "外层已出表、内层登记成功（重入）");

  await clock.fire(0); // 触发内层
  assert.strictEqual(inner, 1, "内层回调可触发");
  assert.strictEqual(reg.size(), 0);
});

if (require.main === module) {
  runTests("web/lib/timers.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
