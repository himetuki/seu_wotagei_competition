/**
 * web/lib/reactive.mjs 单测 —— node 全流程（vendor 永不在 node 加载：deps 注入 fake）
 *
 * 覆盖：createReactiveScope（init 函数求值/对象直传/加载失败上抛）、
 * mountReactiveSafe 的挂载契约（template 写入、scope 传递、mount(host)）与
 * cleanup 契约（unmount 恰一次、幂等）、晚到守卫（dispose 先于加载完成 → 零挂载）、
 * 降级不崩（加载失败/createApp 抛错 → console.error + cleanup 可安全调用）、
 * 无 template 时保留宿主 DOM、非法宿主跳过。
 */
const { test, runTests, assert } = require("../../server/test-lib");

const importReactive = () => import("./reactive.mjs");

/** 捕获 console.error（断言降级路径，同时保持测试输出干净） */
async function withConsole(fn) {
  const errors = [];
  const origError = console.error;
  console.error = (...args) => errors.push(args.map((a) => String(a)).join(" "));
  try {
    const result = await fn();
    return { result, errors };
  } finally {
    console.error = origError;
  }
}

/** 等待微任务队列排空（mountReactiveSafe 的 then 链落地） */
const settle = () => new Promise((r) => setImmediate(r));

/** 最小宿主假件：只有 innerHTML（本封装不依赖其他 DOM API） */
const fakeHost = (html = "") => ({ innerHTML: html });

/** petite-vue 假件：记录 createApp/mount/unmount 调用 */
function fakePV() {
  const calls = { createApp: 0, mountedHosts: [], unmount: 0 };
  const createApp = (scope) => {
    calls.createApp++;
    return {
      mount(host) {
        calls.mountedHosts.push(host);
      },
      unmount() {
        calls.unmount++;
      },
    };
  };
  return { calls, createApp, loader: async () => ({ createApp }) };
}

test("createReactiveScope：init 函数求值结果经 reactive 包装返回", async () => {
  const { createReactiveScope } = await importReactive();
  let inited = null;
  const scope = await createReactiveScope(() => {
    inited = { a: 1 };
    return inited;
  }, { loadReactive: async () => ({ reactive: (o) => ({ ...o, __reactive: true }) }) });
  assert.deepStrictEqual(inited, { a: 1 }, "init 函数被求值一次");
  assert.strictEqual(scope.a, 1);
  assert.strictEqual(scope.__reactive, true, "返回值经过 reactive 包装");
});

test("createReactiveScope：对象直传等价；加载失败原样上抛", async () => {
  const { createReactiveScope } = await importReactive();
  const scope = await createReactiveScope({ b: 2 }, { loadReactive: async () => ({ reactive: (o) => o }) });
  assert.deepStrictEqual(scope, { b: 2 });
  await assert.rejects(
    createReactiveScope({}, { loadReactive: async () => { throw new Error("net down"); } }),
    /net down/,
  );
});

test("mount：template 写入宿主、scope 传入 createApp、mount(host) 被调", async () => {
  const { mountReactiveSafe } = await importReactive();
  const host = fakeHost("<旧骨架></旧骨架>");
  const { calls, loader } = fakePV();
  const scope = { query: "" };
  const cleanup = mountReactiveSafe(host, { template: "<input>", scope }, { loadReactive: loader });
  await settle(); // template 写入发生在 loader resolve 之后的 then 内（异步挂载流程）
  assert.strictEqual(host.innerHTML, "<input>", "template 经挂载流程写入宿主");
  assert.strictEqual(calls.createApp, 1);
  assert.strictEqual(calls.mountedHosts[0], host, "mount 收到宿主元素");
  assert.strictEqual(typeof cleanup, "function");
});

test("cleanup：unmount 恰一次；重复调用幂等", async () => {
  const { mountReactiveSafe } = await importReactive();
  const host = fakeHost();
  const { calls, loader } = fakePV();
  const cleanup = mountReactiveSafe(host, { scope: {} }, { loadReactive: loader });
  await settle();
  assert.strictEqual(calls.unmount, 0, "未 cleanup 前不卸载");
  cleanup();
  cleanup();
  cleanup();
  assert.strictEqual(calls.unmount, 1, "幂等：多次调用只卸载一次");
});

test("晚到守卫：dispose 先于加载完成 → 零挂载、模板不写入", async () => {
  const { mountReactiveSafe } = await importReactive();
  const host = fakeHost("<keep></keep>");
  const { calls, createApp } = fakePV();
  let resolveLoader;
  const cleanup = mountReactiveSafe(
    host,
    { template: "<div>never</div>", scope: {} },
    { loadReactive: () => new Promise((r) => (resolveLoader = r)), createApp },
  );
  cleanup(); // 加载还在途 → 挂载流程整体取消
  resolveLoader({ createApp });
  await settle();
  assert.strictEqual(calls.createApp, 0, "晚到的挂载被取消");
  assert.strictEqual(host.innerHTML, "<keep></keep>", "宿主 DOM 不被触碰");
});

test("加载失败 → console.error 降级不崩，cleanup 可安全调用", async () => {
  const { mountReactiveSafe } = await importReactive();
  const host = fakeHost();
  const { result: cleanup, errors } = await withConsole(async () => {
    const fn = mountReactiveSafe(host, { scope: {} }, {
      loadReactive: async () => { throw new Error("vendor 404"); },
    });
    await settle();
    return fn;
  });
  assert.strictEqual(errors.length, 1);
  assert.ok(errors[0].includes("响应式挂载失败"), errors[0]);
  assert.doesNotThrow(cleanup, "失败路径的 cleanup 仍可安全调用");
});

test("createApp 抛错 → 降级不崩；宿主保留已写入的静态模板骨架", async () => {
  const { mountReactiveSafe } = await importReactive();
  const host = fakeHost();
  const { errors } = await withConsole(async () => {
    mountReactiveSafe(host, { template: "<div>骨架</div>", scope: {} }, {
      loadReactive: async () => ({ createApp: () => { throw new Error("bad scope"); } }),
    });
    await settle();
  });
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(host.innerHTML, "<div>骨架</div>", "静态骨架保留，页面不白屏");
});

test("无 template → 宿主现有 DOM 保留（骨架已在页面就位的用法）", async () => {
  const { mountReactiveSafe } = await importReactive();
  const host = fakeHost("<section>已有骨架</section>");
  const { calls, loader } = fakePV();
  mountReactiveSafe(host, { scope: {} }, { loadReactive: loader });
  await settle();
  assert.strictEqual(host.innerHTML, "<section>已有骨架</section>");
  assert.strictEqual(calls.mountedHosts.length, 1);
});

test("非法宿主（null）→ console.error + 返回 noop cleanup，不抛", async () => {
  const { mountReactiveSafe } = await importReactive();
  const { result: cleanup, errors } = await withConsole(async () => mountReactiveSafe(null, { scope: {} }));
  assert.strictEqual(errors.length, 1);
  assert.ok(errors[0].includes("宿主不是元素"), errors[0]);
  assert.doesNotThrow(cleanup);
});

if (require.main === module) {
  runTests("web/lib/reactive.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
