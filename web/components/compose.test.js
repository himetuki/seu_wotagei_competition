/**
 * web/components/compose.mjs 单测 —— P11-B7（L1 装配器：无 DOM 也能全流程验证）
 *
 * 覆盖：compose 缺省推导、factory 缺失/槽位未声明/宿主不存在/选择器非法的逐项降级、
 * **document 回退成功路径（8 个接入页面的 data-slot 宿主都在 #plugin-root 之外，
 * el.querySelector 必然落空——document 分支才是生产上唯一生效路径）**、
 * props 优先级（静态 < 运行时）与多实例按下标对应、对象 props 的值引用共用、
 * cleanups 收集与逆序释放、单个 cleanup 抛错隔离、names 过滤 + 未知名字告警 + 空数组零告警、
 * 非函数返回值不回收、meta/slots/入参畸形不抛错、自动装配的 onReady 时序不变量、
 * factory 抛错的整体回滚（逆序清理已挂实例后原错误对象原样上抛，不包新 Error；
 * 回滚中单个 cleanup 抛错被 console.error 上报、不掩盖原错误）。
 *
 * 假件是本文件自建的最小 DOM（node 无 document）：fakeEl 只实现 querySelector，
 * 需要"诚实失败"的用例用 strictEl（非字符串选择器直接抛，验证实现侧的类型守卫）；
 * document 回退路径用 withDocument 临时替换 globalThis.document，finally 内原样还原。
 */
const { test, runTests, assert } = require("../../server/test-lib");

const importCompose = () => import("./compose.mjs");

/** 最小宿主容器假件：只认自己声明过的选择器，其余返回 null（同真实 DOM 未命中） */
const fakeEl = (map) => ({ querySelector: (sel) => map[sel] || null });

/** 严格假件：选择器必须为字符串（真实 DOM 对非字符串/非法串会抛错） */
const strictEl = (map) => ({
  querySelector(sel) {
    if (typeof sel !== "string") throw new TypeError("selector must be a string");
    if (!(sel in map)) throw new SyntaxError(`invalid selector ${sel}`);
    return map[sel] || null;
  },
});

/** 最小 ctx 假件：只实现 ctx.ui.component(name)；log 记录取值顺序 */
function fakeCtx(factories = {}, log = []) {
  return {
    log,
    ui: {
      component(name) {
        log.push(`component:${name}`);
        return factories[name] || null;
      },
    },
  };
}

/** 捕获 console.warn / console.error（断言告警文案，同时保持测试输出干净） */
async function withConsole(fn) {
  const warns = [];
  const errors = [];
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...args) => warns.push(args.map((a) => String(a)).join(" "));
  console.error = (...args) => errors.push(args.map((a) => String(a)).join(" "));
  try {
    const result = await fn();
    return { result, warns, errors };
  } finally {
    console.warn = origWarn;
    console.error = origError;
  }
}

/** 临时替换 globalThis.document（node 默认无 document）：结束后无论成败一律还原，不污染其它用例 */
async function withDocument(fakeDoc, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "document");
  const prev = globalThis.document;
  globalThis.document = fakeDoc;
  try {
    return await fn();
  } finally {
    if (had) globalThis.document = prev;
    else delete globalThis.document;
  }
}

/** 记录调用的组件工厂 */
function recorder(calls, name, ret) {
  return (host, props, ctx) => {
    calls.push({ name, host, props, ctx });
    return ret;
  };
}

test("compose 缺省 = defaultSlots 键序；宿主在 el 内命中，props 缺省 {}", async () => {
  const { mountFromConfig } = await importCompose();
  const hostA = { id: "host-a" };
  const hostB = { id: "host-b" };
  const calls = [];
  const { result, warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=a]": hostA, "[data-slot=b]": hostB }),
      meta: null,
      ctx: fakeCtx({ a: recorder(calls, "a"), b: recorder(calls, "b") }),
      label: "t1",
      defaultSlots: { a: "[data-slot=a]", b: "[data-slot=b]" },
    }),
  );

  assert.deepStrictEqual(calls.map((c) => c.name), ["a", "b"], "无 compose 时按 defaultSlots 键序挂载");
  assert.strictEqual(calls[0].host, hostA);
  assert.deepStrictEqual(calls[0].props, {}, "无静态/运行时 props → 空对象");
  assert.deepStrictEqual(warns, [], "全部就位时零告警");
  assert.deepStrictEqual(result.cleanups, [], "工厂无返回值 → cleanups 为空");
  assert.strictEqual(typeof result.mountAll, "function");
  assert.strictEqual(typeof result.cleanup, "function");
});

test("factory 缺失（未注册/enabled:false）→ warn 后跳过，其余组件照挂", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const { result, warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=draw]": {} }),
      meta: { compose: ["music-player", "draw-machine"] },
      ctx: fakeCtx({ "draw-machine": recorder(calls, "draw-machine") }),
      label: "bg1",
      defaultSlots: { "music-player": "[data-slot=music]", "draw-machine": "[data-slot=draw]" },
    }),
  );

  assert.deepStrictEqual(calls.map((c) => c.name), ["draw-machine"], "缺失组件跳过，后续组件继续装配");
  assert.strictEqual(warns.length, 1);
  assert.ok(warns[0].startsWith("[bg1] "), "warn 带 [label] 前缀");
  assert.ok(warns[0].includes('组件 "music-player" 未注册或已禁用'), warns[0]);
  assert.deepStrictEqual(result.cleanups, [], "缺失组件不产出 cleanup");
});

test("槽位未在 config.slots 声明 → warn 后跳过（不调用工厂）", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const { result, warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=a]": {} }),
      meta: { compose: ["ghost"] },
      ctx: fakeCtx({ ghost: recorder(calls, "ghost") }),
      label: "t3",
      defaultSlots: {},
    }),
  );

  assert.deepStrictEqual(calls, [], "无插槽声明 → 不调用工厂");
  assert.strictEqual(warns.length, 1);
  assert.ok(warns[0].includes('组件 "ghost" 未在 config.slots 声明插槽'), warns[0]);
  assert.deepStrictEqual(result.cleanups, []);
});

test("config.compose 显式空数组 → 仍按缺省全挂并告警（与 names:[] 零装配语义相反，须可见）", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const { result, warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=a]": {} }),
      meta: { compose: [], slots: { a: "[data-slot=a]" } },
      ctx: fakeCtx({ a: recorder(calls, "a", () => {}) }),
      label: "t-empty-compose",
      defaultSlots: {},
    }),
  );

  assert.deepStrictEqual(calls.map((c) => c.name), ["a"], "既有缺省语义不变：空数组落入缺省分支装配全部 slots");
  assert.strictEqual(warns.length, 1);
  assert.ok(warns[0].includes("config.compose 为空数组"), warns[0]);
  assert.strictEqual(result.cleanups.length, 1);
});

test("slots 值为空数组 → warn 后跳过（不再静默零挂载）", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const { result, warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({}),
      meta: { compose: ["a"], slots: { a: [] } },
      ctx: fakeCtx({ a: recorder(calls, "a") }),
      label: "t-empty-slot",
      defaultSlots: {},
    }),
  );

  assert.deepStrictEqual(calls, [], "空数组选择器 → 不调用工厂");
  assert.strictEqual(warns.length, 1);
  assert.ok(warns[0].includes("插槽选择器为空数组"), warns[0]);
  assert.deepStrictEqual(result.cleanups, []);
});

test("宿主不存在 → warn 后跳过（含 el 未命中且 node 无 document 的回退路径）", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const { result, warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({}),
      meta: { slots: { "music-player": "[data-slot=music]" } },
      ctx: fakeCtx({ "music-player": recorder(calls, "music-player") }),
      label: "drag",
      defaultSlots: { "music-player": "[data-slot=music]" },
    }),
  );

  assert.deepStrictEqual(calls, []);
  assert.strictEqual(warns.length, 1);
  assert.strictEqual(warns[0], '[drag] 组件 "music-player" 的插槽 [data-slot=music] 不存在，跳过挂载');
  assert.deepStrictEqual(result.cleanups, []);
});

test("单实例：props 优先级 = 静态 < 运行时（浅合并，同名键被运行时覆盖）", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const trigger = () => {};
  const staticOverlay = { textContent: "BATTLE START" };
  const ctx = fakeCtx({ "music-player": recorder(calls, "music-player") });
  const { warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=music]": {} }),
      meta: {
        slots: { "music-player": "[data-slot=music]" },
        components: {
          "music-player": { folder: "1yearplus", exitOnClick: true, overlay: staticOverlay },
        },
      },
      ctx,
      label: "t5",
      defaultSlots: {},
      runtimeProps: { "music-player": { folder: "runtime-folder", overlay: { x: 1 }, trigger } },
    }),
  );

  assert.deepStrictEqual(warns, []);
  assert.deepStrictEqual(
    calls[0].props,
    { folder: "runtime-folder", exitOnClick: true, overlay: { x: 1 }, trigger },
    "运行时覆盖静态、静态独有键保留、浅合并不递归（overlay 整体被替换）",
  );
  assert.notStrictEqual(calls[0].props.overlay, staticOverlay, "浅合并：静态 overlay 整块被替换");
  assert.deepStrictEqual(calls[0].props.overlay, { x: 1 }, "同名键整体取运行时值（不递归合并）");
  assert.strictEqual(calls[0].ctx, ctx, "第三参原样透传 ctx（同一引用，而非仅非空）");
});

test("单实例：字符串槽位 + 对象 props（等价于长度 1 的数组）", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const host = { id: "solo" };
  await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=draw]": host }),
      meta: { components: { "draw-machine": { ticks: 40 } } },
      ctx: fakeCtx({ "draw-machine": recorder(calls, "draw-machine") }),
      label: "t6",
      defaultSlots: { "draw-machine": "[data-slot=draw]" },
      runtimeProps: { "draw-machine": { tickMs: 50 } },
    }),
  );

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].host, host);
  assert.deepStrictEqual(calls[0].props, { ticks: 40, tickMs: 50 });
});

test("多实例：数组槽位 + 数组 props 按下标一一对应（长度不足 → 该实例运行时 props = {}）", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const host0 = { id: "m0" };
  const host1 = { id: "m1" };
  const host2 = { id: "m2" };
  const { result, warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({
        "[data-slot=m0]": host0,
        "[data-slot=m1]": host1,
        "[data-slot=m2]": host2,
      }),
      meta: {
        slots: { "music-player": ["[data-slot=m0]", "[data-slot=m1]", "[data-slot=m2]"] },
        components: { "music-player": [{ k: 0 }, { k: 1 }, { k: 2 }] },
      },
      ctx: fakeCtx({ "music-player": recorder(calls, "music-player", () => {}) }),
      label: "music-draw",
      defaultSlots: {},
      runtimeProps: { "music-player": [{ r: 0 }, { r: 1 }] },
    }),
  );

  assert.deepStrictEqual(warns, []);
  assert.deepStrictEqual(calls.map((c) => c.host), [host0, host1, host2], "按槽位数组顺序逐个挂载");
  assert.deepStrictEqual(calls.map((c) => c.props), [{ k: 0, r: 0 }, { k: 1, r: 1 }, { k: 2 }]);
  assert.strictEqual(result.cleanups.length, 3);
});

test("多实例：某个宿主缺失 → 只 warn 该实例，其余照挂且下标不变", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const { warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=m0]": {}, "[data-slot=m2]": {} }),
      meta: {
        slots: { "draw-machine": ["[data-slot=m0]", "[data-slot=gone]", "[data-slot=m2]"] },
        components: { "draw-machine": [{ k: 0 }, { k: 1 }, { k: 2 }] },
      },
      ctx: fakeCtx({ "draw-machine": recorder(calls, "draw-machine") }),
      label: "music-draw",
      defaultSlots: {},
    }),
  );

  assert.deepStrictEqual(
    calls.map((c) => c.props),
    [{ k: 0 }, { k: 2 }],
    "第 2 个实例缺失宿主，第 3 个实例仍按原下标取 props",
  );
  assert.strictEqual(warns.length, 1);
  assert.ok(warns[0].includes('第 2 个插槽 [data-slot=gone] 不存在'), warns[0]);
});

test("多实例：数组槽位 + 对象 props → 所有实例共用同一份 props", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const sharedOverlay = { textContent: "BATTLE START" }; // 值对象：应被所有实例共用（浅合并只换容器）
  await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=m0]": {}, "[data-slot=m1]": {} }),
      meta: {
        slots: { "draw-machine": ["[data-slot=m0]", "[data-slot=m1]"] },
        components: { "draw-machine": { ticks: 15, overlay: sharedOverlay } },
      },
      ctx: fakeCtx({ "draw-machine": recorder(calls, "draw-machine") }),
      label: "music-draw",
      defaultSlots: {},
      runtimeProps: { "draw-machine": { tickMs: 80 } },
    }),
  );

  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(calls[0].props, { ticks: 15, tickMs: 80, overlay: sharedOverlay });
  assert.deepStrictEqual(calls[1].props, { ticks: 15, tickMs: 80, overlay: sharedOverlay });
  assert.strictEqual(calls[1].props.overlay, sharedOverlay, "值对象引用原样透传（非深拷贝）");
  assert.strictEqual(calls[1].props.overlay, calls[0].props.overlay, "所有实例共用同一值对象引用");
  assert.notStrictEqual(calls[1].props, calls[0].props, "props 容器按实例浅拷贝，实例间改 key 不互相污染");
});

test("cleanups 收集顺序 = 挂载顺序（compose 顺序 + 实例下标顺序）", async () => {
  const { mountFromConfig } = await importCompose();
  const mounted = [];
  const seen = [];
  const { result } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({
        "[data-slot=a]": { i: 0 },
        "[data-slot=b0]": { i: 1 },
        "[data-slot=b1]": { i: 2 },
      }),
      meta: { slots: { a: "[data-slot=a]", b: ["[data-slot=b0]", "[data-slot=b1]"] } },
      ctx: fakeCtx({
        a: () => {
          mounted.push("a");
          return () => seen.push("a");
        },
        b: (host) => {
          mounted.push(`b${host.i}`);
          return () => seen.push(`b${host.i}`);
        },
      }),
      label: "t9",
      defaultSlots: {},
    }),
  );

  assert.deepStrictEqual(mounted, ["a", "b1", "b2"], "装配顺序 = compose 顺序 × 实例下标顺序");
  assert.strictEqual(result.cleanups.length, 3, "cleanups 按挂载顺序收集");
  assert.deepStrictEqual(seen, [], "collect 阶段不调用 cleanup");

  result.cleanup();
  assert.deepStrictEqual(seen, ["b2", "b1", "a"], "释放顺序 = 收集顺序的逆序（实例逆序 → 组件逆序）");
});

test("cleanup()：逆序调用并清空；重复调用无副作用", async () => {
  const { mountFromConfig } = await importCompose();
  const seen = [];
  const { result } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=a]": {}, "[data-slot=b]": {} }),
      meta: { slots: { a: "[data-slot=a]", b: "[data-slot=b]" } },
      ctx: fakeCtx({
        a: () => () => seen.push("a"),
        b: () => () => seen.push("b"),
      }),
      label: "t10",
      defaultSlots: {},
    }),
  );

  assert.deepStrictEqual(result.cleanups.length, 2);
  result.cleanup();
  assert.deepStrictEqual(seen, ["b", "a"], "后进先出：组件逆序卸载");
  assert.deepStrictEqual(result.cleanups, [], "cleanup 后清空数组");
  result.cleanup();
  assert.deepStrictEqual(seen, ["b", "a"], "再次调用不得重复执行（幂等）");
});

test("cleanup()：单个抛错不影响其余（console.error 上报，不向外抛）", async () => {
  const { mountFromConfig } = await importCompose();
  const seen = [];
  const { result } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=a]": {}, "[data-slot=b]": {}, "[data-slot=c]": {} }),
      meta: { slots: { a: "[data-slot=a]", b: "[data-slot=b]", c: "[data-slot=c]" } },
      ctx: fakeCtx({
        a: () => () => seen.push("a"),
        b: () => () => {
          seen.push("b");
          throw new Error("boom b");
        },
        c: () => () => seen.push("c"),
      }),
      label: "t11",
      defaultSlots: {},
    }),
  );

  const { errors } = await withConsole(() => {
    result.cleanup(); // 不得抛
    return null;
  });
  assert.deepStrictEqual(seen, ["c", "b", "a"], "抛错实例两侧的 cleanup 照常执行");
  assert.strictEqual(errors.length, 1);
  assert.ok(errors[0].startsWith("[t11] 组件 cleanup 失败:"), errors[0]);
  assert.ok(errors[0].includes("boom b"), errors[0]);
  assert.deepStrictEqual(result.cleanups, [], "抛错项同样从数组移除");
});

test("names：只装配列出的组件名（保持 compose 顺序），未列出者不取工厂", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const ctx = fakeCtx(
    { a: recorder(calls, "a"), b: recorder(calls, "b"), c: recorder(calls, "c") },
    [],
  );
  const { warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=a]": {}, "[data-slot=b]": {}, "[data-slot=c]": {} }),
      meta: { slots: { a: "[data-slot=a]", b: "[data-slot=b]", c: "[data-slot=c]" } },
      ctx,
      label: "t12",
      defaultSlots: {},
      names: ["c", "a"],
    }),
  );

  assert.deepStrictEqual(calls.map((c) => c.name), ["a", "c"], "过滤而不重排：保持 compose 顺序");
  assert.deepStrictEqual(ctx.log, ["component:a", "component:c"], "未列出的组件不查组件表");
  assert.deepStrictEqual(warns, []);
});

test("非函数返回值（undefined/null/字符串）不入 cleanups；手塞的非函数项被跳过", async () => {
  const { mountFromConfig } = await importCompose();
  const { result } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=a]": {}, "[data-slot=b]": {}, "[data-slot=c]": {} }),
      meta: { slots: { a: "[data-slot=a]", b: "[data-slot=b]", c: "[data-slot=c]" } },
      ctx: fakeCtx({ a: () => undefined, b: () => "not-a-function", c: () => null }),
      label: "t13",
      defaultSlots: {},
    }),
  );

  assert.deepStrictEqual(result.cleanups, []);
  result.cleanups.push("junk", null); // 防御：外部塞入脏项也不得让 cleanup 抛错
  const { errors } = await withConsole(() => {
    result.cleanup();
    return null;
  });
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(result.cleanups, []);
});

test("meta 畸形（null / 非对象 / compose 非数组 / slots 为数组）→ 降级不抛错", async () => {
  const { mountFromConfig } = await importCompose();

  // ① meta = null：用 defaultSlots 照常装配
  const calls1 = [];
  await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=a]": {} }),
      meta: null,
      ctx: fakeCtx({ a: recorder(calls1, "a") }),
      label: "t14",
      defaultSlots: { a: "[data-slot=a]" },
    }),
  );
  assert.deepStrictEqual(calls1.map((c) => c.name), ["a"]);

  // ② meta 各字段类型全错：compose 非数组 → 回退 defaultSlots 键序；components/slots 非对象 → {}
  const calls2 = [];
  const { warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=a]": {} }),
      meta: { compose: "music-player", slots: ["[data-slot=a]"], components: 42 },
      ctx: fakeCtx({ a: recorder(calls2, "a") }),
      label: "t14",
      defaultSlots: { a: "[data-slot=a]" },
      runtimeProps: "nope",
    }),
  );
  assert.deepStrictEqual(calls2.map((c) => c.name), ["a"], "畸形 compose/slots 降级为 defaultSlots 键序");
  assert.deepStrictEqual(calls2.map((c) => c.props), [{}], "畸形 components/runtimeProps 降级为空");
  assert.deepStrictEqual(warns, []);

  // ③ 完全空 spec：不抛错、空装配
  const { result } = await withConsole(() => mountFromConfig());
  assert.deepStrictEqual(result.cleanups, []);
});

test("选择器畸形：非字符串被类型守卫拦下，非法串被 try/catch 兜住（均只 warn）", async () => {
  const { mountFromConfig } = await importCompose();

  // ① slots 值为数字 → 不把非字符串交给 querySelector（strictEl 会抛 TypeError）
  const calls1 = [];
  const { warns: w1 } = await withConsole(() =>
    mountFromConfig({
      el: strictEl({ "[data-slot=a]": {} }),
      meta: { slots: { a: 123 } },
      ctx: fakeCtx({ a: recorder(calls1, "a") }),
      label: "t15",
      defaultSlots: {},
    }),
  );
  assert.deepStrictEqual(calls1, []);
  assert.deepStrictEqual(
    w1,
    ['[t15] 组件 "a" 的插槽 123 不存在，跳过挂载'],
    "非字符串被类型守卫静默归一为宿主不存在（不把非法值丢给 querySelector）",
  );

  // ② 非法选择器串 → querySelector 抛 SyntaxError，被归一为"宿主不存在"
  const calls2 = [];
  const { warns: w2 } = await withConsole(() =>
    mountFromConfig({
      el: strictEl({ "[data-slot=a]": {} }),
      meta: { slots: { a: "[" } },
      ctx: fakeCtx({ a: recorder(calls2, "a") }),
      label: "t15",
      defaultSlots: {},
    }),
  );
  assert.deepStrictEqual(calls2, []);
  assert.deepStrictEqual(
    w2,
    ["[t15] 插槽选择器 [ 非法，跳过挂载", '[t15] 组件 "a" 的插槽 [ 不存在，跳过挂载'],
    "非法串先打选择器 warn，再按宿主不存在降级（全文案锁定）",
  );

  // ③ el 为 null：回退 document（node 无 document → 归一为宿主不存在）
  const calls3 = [];
  const { warns: w3 } = await withConsole(() =>
    mountFromConfig({
      el: null,
      meta: null,
      ctx: fakeCtx({ a: recorder(calls3, "a") }),
      label: "t15",
      defaultSlots: { a: "[data-slot=a]" },
      runtimeProps: { a: { k: 1 } },
    }),
  );
  assert.deepStrictEqual(calls3, []);
  assert.strictEqual(w3.length, 1);
});

test("mountAll()：可显式再次装配（追加实例与 cleanup），返回前已自动挂载一次", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const { result } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=a]": {} }),
      meta: null,
      ctx: fakeCtx({ a: recorder(calls, "a", () => {}) }),
      label: "t16",
      defaultSlots: { a: "[data-slot=a]" },
    }),
  );

  assert.strictEqual(calls.length, 1, "mountFromConfig 返回前已自动装配一次");
  result.mountAll();
  assert.strictEqual(calls.length, 2, "重复调用追加新实例");
  assert.strictEqual(result.cleanups.length, 2);
  result.cleanup();
  assert.strictEqual(result.cleanups.length, 0);
});

// ---------- 独立审查补强：document 回退（唯一线上路径）/ names 告警 / 时序不变量 / 畸形入参 ----------

test("document 回退成功：el 内未命中 → 以同一选择器查全文档，工厂收到的宿主即该节点（生产唯一生效路径）", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const host = { id: "doc-host" };
  const ctx = fakeCtx({ "music-player": recorder(calls, "music-player") });
  const docQueries = [];
  let elQueries = 0;

  const { result, warns } = await withDocument(
    {
      querySelector: (sel) => {
        docQueries.push(sel);
        return sel === "[data-slot=music]" ? host : null;
      },
    },
    () =>
      withConsole(() =>
        mountFromConfig({
          // 8 个接入页面（battle-group*/drag/music-draw/group-battle/movement-teaching）的 data-slot
          // 宿主都位于 #plugin-root 之外的兄弟节点 → el.querySelector 必然落空，document 分支才生效
          el: {
            querySelector: () => {
              elQueries += 1;
              return null;
            },
          },
          meta: null,
          ctx,
          label: "doc-fallback",
          defaultSlots: { "music-player": "[data-slot=music]" },
        }),
      ),
  );

  assert.strictEqual(elQueries, 1, "先查页面根（未命中才回退）");
  assert.deepStrictEqual(docQueries, ["[data-slot=music]"], "回退时用同一选择器查全文档");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].host, host, "工厂收到的宿主必须是 document 命中的同一节点");
  assert.strictEqual(calls[0].ctx, ctx, "第三参 ctx 原样透传（同一引用）");
  assert.deepStrictEqual(warns, [], "命中即零告警");
  assert.deepStrictEqual(result.cleanups, []);
});

test("el 为 null 但 document 存在 → 仍完成 document 回退装配（宿主身份 strictEqual）", async () => {
  const { mountFromConfig } = await importCompose();
  const host = { id: "doc-only" };
  const calls = [];
  const ctx = fakeCtx({ "draw-machine": recorder(calls, "draw-machine") });

  const { warns } = await withDocument(
    { querySelector: (sel) => (sel === "[data-slot=draw]" ? host : null) },
    () =>
      withConsole(() =>
        mountFromConfig({
          el: null,
          meta: {},
          ctx,
          label: "el-null",
          defaultSlots: { "draw-machine": "[data-slot=draw]" },
        }),
      ),
  );

  assert.strictEqual(calls.length, 1, "缺 el 不降级为空挂：宿主来自 document");
  assert.strictEqual(calls[0].host, host);
  assert.strictEqual(calls[0].ctx, ctx);
  assert.deepStrictEqual(warns, []);
});

test("names 含未知名字 → 逐条 warn（不在 compose/slots 中，已忽略），未知名不查组件表", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const ctx = fakeCtx({ a: recorder(calls, "a") }, []);
  const { result, warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=a]": {} }),
      meta: { slots: { a: "[data-slot=a]" } },
      ctx,
      label: "t17",
      defaultSlots: {},
      names: ["a", "typo", "draw-machin"], // 已知名照挂；两个疑似拼错的名字各一条 warn
    }),
  );

  assert.deepStrictEqual(calls.map((c) => c.name), ["a"], "已知名字照常装配");
  assert.deepStrictEqual(ctx.log, ["component:a"], "未知名字不查组件表（零装配而非报错）");
  assert.deepStrictEqual(
    warns,
    [
      '[t17] names 中的组件 "typo" 不在 compose/slots 中，已忽略',
      '[t17] names 中的组件 "draw-machin" 不在 compose/slots 中，已忽略',
    ],
    "warn 顺序 = names 声明顺序，文案逐字锁定（名字拼错不再静默失效）",
  );
  assert.deepStrictEqual(result.cleanups, []);
});

test("names: [] → 本页零装配且零告警（movement-teaching 记录/设置页真实用法回归）", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const ctx = fakeCtx({ a: recorder(calls, "a"), b: recorder(calls, "b") }, []);
  const { result, warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=a]": {}, "[data-slot=b]": {} }),
      meta: { slots: { a: "[data-slot=a]", b: "[data-slot=b]" } },
      ctx,
      label: "t18",
      defaultSlots: {},
      names: [],
    }),
  );

  assert.deepStrictEqual(calls, [], "空 names = 零装配（而非不过滤）");
  assert.deepStrictEqual(ctx.log, [], "零装配连组件表都不查");
  assert.deepStrictEqual(warns, [], "空数组是合法用法：零告警");
  assert.deepStrictEqual(result.cleanups, []);
});

test("names 为非数组畸形值（字符串/数字/null/对象）→ 降级为不过滤、零告警（既有语义不变）", async () => {
  const { mountFromConfig } = await importCompose();

  for (const bad of ["a", 42, null, { 0: "a" }]) {
    const calls = [];
    const { warns } = await withConsole(() =>
      mountFromConfig({
        el: fakeEl({ "[data-slot=a]": {}, "[data-slot=b]": {} }),
        meta: { slots: { a: "[data-slot=a]", b: "[data-slot=b]" } },
        ctx: fakeCtx({ a: recorder(calls, "a"), b: recorder(calls, "b") }),
        label: "t18b",
        defaultSlots: {},
        names: bad,
      }),
    );
    assert.deepStrictEqual(calls.map((c) => c.name), ["a", "b"], `${JSON.stringify(bad)} 不参与过滤`);
    assert.deepStrictEqual(warns, [], `${JSON.stringify(bad)} 不产生 names 告警（只有数组分支才遍历）`);
  }
});

test("静态 props 数组短于槽位数组 → 缺位实例 props = {}（不抛错、下标不错位）", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const hosts = [{ id: "s0" }, { id: "s1" }, { id: "s2" }];
  const { warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({
        "[data-slot=s0]": hosts[0],
        "[data-slot=s1]": hosts[1],
        "[data-slot=s2]": hosts[2],
      }),
      meta: {
        slots: { a: ["[data-slot=s0]", "[data-slot=s1]", "[data-slot=s2]"] },
        components: { a: [{ k: 0 }] }, // 静态数组只覆盖第 1 个实例
      },
      ctx: fakeCtx({ a: recorder(calls, "a") }),
      label: "t19",
      defaultSlots: {},
    }),
  );

  assert.deepStrictEqual(calls.map((c) => c.host), hosts, "三个实例照挂，宿主顺序不变");
  assert.deepStrictEqual(calls.map((c) => c.props), [{ k: 0 }, {}, {}], "数组越界项按 {} 处理");
  assert.deepStrictEqual(warns, []);
});

test("自动装配因果不变量：返回时所有实例的 onReady 已回填（页面 flow 取 bridge 的时序契约）", async () => {
  const { mountFromConfig } = await importCompose();
  const ready = [];
  const factory = (host, props) => {
    // 组件契约：工厂内同步调用 props.onReady(bridge)，真实组件借此把 bridge 交给页面 flow
    if (typeof props.onReady === "function") props.onReady({ host, ticks: props.ticks });
    return null;
  };

  const { warns } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=m0]": { id: "m0" }, "[data-slot=m1]": { id: "m1" } }),
      meta: {
        slots: { "draw-machine": ["[data-slot=m0]", "[data-slot=m1]"] },
        components: { "draw-machine": [{ ticks: 1 }, { ticks: 2 }] },
      },
      ctx: fakeCtx({ "draw-machine": factory }),
      label: "t20",
      defaultSlots: {},
      runtimeProps: {
        "draw-machine": [
          { onReady: (b) => ready.push(["i0", b.ticks, b.host.id]) },
          { onReady: (b) => ready.push(["i1", b.ticks, b.host.id]) },
        ],
      },
    }),
  );

  assert.deepStrictEqual(
    ready,
    [["i0", 1, "m0"], ["i1", 2, "m1"]],
    "mountFromConfig 返回前每个实例都已同步回填 onReady（否则页面 flow 拿到空 bridge）",
  );
  assert.deepStrictEqual(warns, []);
});

test("畸形入参（null / 数字 / 字符串 / 布尔）→ 不抛错、零装配、零告警（默认参不覆盖 null）", async () => {
  const { mountFromConfig } = await importCompose();

  for (const bad of [null, 42, "x", true, false]) {
    const { result, warns } = await withConsole(() => mountFromConfig(bad)); // 修复前 null 抛 TypeError
    assert.deepStrictEqual(result.cleanups, [], `${String(bad)} 应零装配`);
    assert.deepStrictEqual(warns, [], `${String(bad)} 不应产生告警`);
    result.mountAll(); // 空 compose：重复装配同样不抛
    result.cleanup();
    assert.deepStrictEqual(result.cleanups, [], `${String(bad)} cleanup 后仍为空`);
  }

  // undefined / 无参走默认参路径，与 {} 等价
  const { result: r1 } = await withConsole(() => mountFromConfig(undefined));
  const { result: r2 } = await withConsole(() => mountFromConfig());
  assert.deepStrictEqual(r1.cleanups, []);
  assert.deepStrictEqual(r2.cleanups, []);
});

test("非法选择器 warn 全文案锁定：选择器 warn + 宿主不存在 warn 各一条，工厂未调用", async () => {
  const { mountFromConfig } = await importCompose();
  const calls = [];
  const { warns } = await withConsole(() =>
    mountFromConfig({
      el: strictEl({}), // 真实 DOM 上 querySelector("[") 抛 SyntaxError
      meta: { slots: { a: "[" } },
      ctx: fakeCtx({ a: recorder(calls, "a") }),
      label: "t21",
      defaultSlots: {},
    }),
  );

  assert.deepStrictEqual(
    warns,
    ["[t21] 插槽选择器 [ 非法，跳过挂载", '[t21] 组件 "a" 的插槽 [ 不存在，跳过挂载'],
    "非法选择器降级为宿主不存在，两条 warn 文案逐字锁定",
  );
  assert.deepStrictEqual(calls, []);
});

// ---------- 失败即整体回滚：factory 抛错 → 逆序清理已挂实例后原样上抛（不包新 Error） ----------

test("第二个工厂抛错 → 第一个实例 cleanup 先被调用，原错误对象原样传播（strictEqual 同一引用）", async () => {
  const { mountFromConfig } = await importCompose();
  const seen = [];
  const original = new Error("draw-machine boom");
  assert.throws(
    () =>
      mountFromConfig({
        el: fakeEl({ "[data-slot=music]": { id: "m" }, "[data-slot=draw]": { id: "d" } }),
        meta: { slots: { "music-player": "[data-slot=music]", "draw-machine": "[data-slot=draw]" } },
        ctx: fakeCtx({
          "music-player": () => () => seen.push("music"),
          "draw-machine": () => {
            throw original;
          },
        }),
        label: "t22",
        defaultSlots: {},
      }),
    (e) => e === original,
    "传播的必须是原错误对象本身（不得包一层新 Error）",
  );
  assert.deepStrictEqual(seen, ["music"], "抛出前第一个实例的 cleanup 已被调用（整体回滚）");
});

test("多实例：第 3 个工厂抛错 → 已挂 2 个实例按逆序回滚（后挂的先清理），原错误传播", async () => {
  const { mountFromConfig } = await importCompose();
  const seen = [];
  const original = new Error("boom on i2");
  assert.throws(
    () =>
      mountFromConfig({
        el: fakeEl({
          "[data-slot=i0]": { id: 0 },
          "[data-slot=i1]": { id: 1 },
          "[data-slot=i2]": { id: 2 },
        }),
        meta: { slots: { a: ["[data-slot=i0]", "[data-slot=i1]", "[data-slot=i2]"] } },
        ctx: fakeCtx({
          a: (host) => {
            if (host.id === 2) throw original;
            return () => seen.push(host.id);
          },
        }),
        label: "t23",
        defaultSlots: {},
      }),
    (e) => e === original,
  );
  assert.deepStrictEqual(seen, [1, 0], "回滚顺序 = 挂载顺序的逆序（i1 先于 i0）");
});

test("第一个（唯一的）工厂就抛错 → 异常原样传播、零已挂实例、零回滚噪音（无 console.error）", async () => {
  const { mountFromConfig } = await importCompose();
  const original = new Error("boom on first");
  const { errors } = await withConsole(() => {
    assert.throws(
      () =>
        mountFromConfig({
          el: fakeEl({ "[data-slot=a]": {} }),
          meta: { slots: { a: "[data-slot=a]" } },
          ctx: fakeCtx({
            a: () => {
              throw original;
            },
          }),
          label: "t24",
          defaultSlots: {},
        }),
      (e) => e === original,
    );
    return null;
  });
  assert.deepStrictEqual(errors, [], "无已挂实例 → 回滚为空操作，不得产生 console.error");
});

test("回滚时某个 cleanup 自身也抛错 → 不掩盖原工厂错误（仍传播原对象），cleanup 错误经 console.error 上报", async () => {
  const { mountFromConfig } = await importCompose();
  const original = new Error("factory boom");
  const { errors } = await withConsole(() => {
    assert.throws(
      () =>
        mountFromConfig({
          el: fakeEl({ "[data-slot=a]": {}, "[data-slot=b]": {} }),
          meta: { slots: { a: "[data-slot=a]", b: "[data-slot=b]" } },
          ctx: fakeCtx({
            a: () => () => {
              throw new Error("cleanup boom");
            },
            b: () => {
              throw original;
            },
          }),
          label: "t25",
          defaultSlots: {},
        }),
      (e) => e === original,
      "传播出的仍是原工厂错误（cleanup 的错误不得覆盖它）",
    );
    return null;
  });
  assert.strictEqual(errors.length, 1, "cleanup 抛错被单错隔离为一次 console.error");
  assert.ok(errors[0].startsWith("[t25] 组件 cleanup 失败:"), errors[0]);
  assert.ok(errors[0].includes("cleanup boom"), errors[0]);
});

test("mountAll() 显式重挂时工厂抛错 → 同样整体回滚（含上一批已收集的 cleanup）后原样上抛", async () => {
  const { mountFromConfig } = await importCompose();
  const seen = [];
  const original = new Error("boom on remount");
  let calls = 0;
  const { result } = await withConsole(() =>
    mountFromConfig({
      el: fakeEl({ "[data-slot=a]": {} }),
      meta: null,
      ctx: fakeCtx({
        a: () => {
          calls += 1;
          if (calls === 1) return () => seen.push("batch1");
          throw original;
        },
      }),
      label: "t26",
      defaultSlots: { a: "[data-slot=a]" },
    }),
  );

  assert.strictEqual(calls, 1, "返回前自动装配成功一次");
  assert.throws(() => result.mountAll(), (e) => e === original, "重挂抛错同样向上传播");
  assert.deepStrictEqual(seen, ["batch1"], "回滚范围 = 已收集的全部 cleanups（含上一批成功实例）");
  assert.deepStrictEqual(result.cleanups, [], "回滚后 cleanups 已清空");
  result.cleanup();
  assert.deepStrictEqual(seen, ["batch1"], "回滚后调用 cleanup() 为无副作用的空操作");
});

if (require.main === module) {
  runTests("web/components/compose.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
