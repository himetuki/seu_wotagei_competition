/**
 * web/ui.mjs 组件注册表单测 —— P11-B0/B1（§5.3 陷阱 7：内核改动必须有回归网）
 *
 * 覆盖：
 *   - registerComponent 注册/覆盖、component(name) 取用、listComponents 快照
 *   - 两张表分离：页面 key 与组件名同名互不影响（页面表 register/unregister 不动组件表）
 *   - 组件永不被 kernel 自动渲染：assemblePage 只渲染页面 key；组件仅在被显式取用后实例化
 *   - 工厂返回的 cleanup：页面卸载时由页面自己的 cleanup 调用（真实装配链路 + 真 cordis Context）
 *   - 既有 register/render/unregister 契约回归（占位、重复 render 先调旧 cleanup）
 *
 * harness 跟随 server/test-lib；被测源为 .mjs，经动态 import() 加载；kernel 装配用真 Context。
 */
const { test, runTests, assert } = require("../server/test-lib");

const importUi = () => import("./ui.mjs");
const importKernel = () => import("./kernel.mjs");

/** installUi 只依赖 ctx.provide，最小假 ctx 即可（免 cordis 依赖） */
function fakeCtx() {
  return { ui: null, provide(name, service) { this[name] = service; } };
}

test("registerComponent/component：注册后可取用，未注册 → null", async () => {
  const { installUi } = await importUi();
  const ctx = fakeCtx();
  const ui = installUi(ctx);
  assert.strictEqual(ctx.ui, ui, "installUi 必须 provide ui 服务");

  const factory = (host, props) => () => {};
  assert.strictEqual(ui.component("music-player"), null, "未注册 → null（页面据此优雅降级）");
  ui.registerComponent("music-player", factory);
  assert.strictEqual(ui.component("music-player"), factory, "取回的必须是注册时的函数本体");
  assert.strictEqual(ui.component("nope"), null);
  assert.strictEqual(ui.component(null), null, "非字符串名不抛错，返回 null");
  assert.strictEqual(ui.component(123), null);
});

test("registerComponent：同 name 后注册覆盖先注册（组件名自由，无 key 校验）", async () => {
  const { installUi } = await importUi();
  const ui = installUi(fakeCtx());
  const first = () => "first";
  const second = () => "second";
  ui.registerComponent("draw-machine", first);
  ui.registerComponent("draw-machine", second);
  assert.strictEqual(ui.component("draw-machine"), second);
  assert.deepStrictEqual(ui.listComponents(), ["draw-machine"], "覆盖不新增条目");
});

test("registerComponent：非法参数直接抛错（fail fast，与 register 一致）", async () => {
  const { installUi } = await importUi();
  const ui = installUi(fakeCtx());
  assert.throws(() => ui.registerComponent("", () => {}), /name/);
  assert.throws(() => ui.registerComponent("x", "not-a-function"), /factory/);
  assert.throws(() => ui.registerComponent(undefined, () => {}), /name/);
  assert.throws(() => ui.registerComponent("x", null), /factory/);
  assert.deepStrictEqual(ui.listComponents(), [], "非法调用不留残留");
});

test("listComponents：插入序 + 防御性拷贝（外部改动不回污染注册表）", async () => {
  const { installUi } = await importUi();
  const ui = installUi(fakeCtx());
  ui.registerComponent("b", () => {});
  ui.registerComponent("a", () => {});
  const list = ui.listComponents();
  assert.deepStrictEqual(list, ["b", "a"], "返回插入序快照");
  list.push("ghost");
  list.length = 0;
  assert.deepStrictEqual(ui.listComponents(), ["b", "a"]);
});

test("两张表分离：同名页面 key 与组件名互不影响", async () => {
  const { installUi } = await importUi();
  const container = { innerHTML: "" };
  const ctx = fakeCtx();
  const ui = installUi(ctx);

  const pageComponent = (el) => {
    el.innerHTML = "<b>page</b>";
    return () => {};
  };
  const componentFactory = () => {};
  ui.register({ key: "music-player", component: pageComponent });
  ui.registerComponent("music-player", componentFactory);

  // 页面表：key 命中页面组件；组件表：name 命中工厂 —— 互不覆盖
  ui.render("music-player", null, container);
  assert.ok(container.innerHTML.includes("page"));
  assert.strictEqual(ui.component("music-player"), componentFactory);

  // 注销页面 key 只影响页面表（容器清空），组件表原样保留
  ui.unregister("music-player");
  assert.strictEqual(container.innerHTML, "");
  assert.strictEqual(ui.component("music-player"), componentFactory, "unregister 不得动组件表");

  // 反向：注册组件名与页面 key 同名不覆盖页面
  ui.register({ key: "drag", component: (el) => (el.innerHTML = "drag-page") });
  ui.registerComponent("drag", () => {});
  ui.render("drag", null, container);
  assert.strictEqual(container.innerHTML, "drag-page");
});

test("组件永不被 kernel 自动渲染：未被取用 → 工厂零调用；被取用 → 由页面实例化", async () => {
  const { assemblePage } = await importKernel();
  const calls = { factory: 0, cleanup: 0, gotProps: null, gotHost: null, gotCtx: null };
  const hostEl = { id: "slot-music" };
  const container = {
    innerHTML: "",
    querySelector: (sel) => (sel === "[data-slot=music]" ? hostEl : null),
  };

  // 组件库条目：pages 命中 drag 页，kind 为可选元数据（loader 忽略未知字段）
  const componentPlugin = {
    name: "component-music-player-front",
    inject: ["ui"],
    apply(ctx) {
      ctx.ui.registerComponent("music-player", (host, props, innerCtx) => {
        calls.factory += 1;
        calls.gotHost = host;
        calls.gotProps = props;
        calls.gotCtx = innerCtx;
        return () => { calls.cleanup += 1; };
      });
    },
  };
  // 页面插件：显式取用组件（这是唯一的实例化途径）
  const pagePlugin = {
    name: "drag-front",
    inject: ["ui"],
    apply(ctx) {
      ctx.ui.register({
        key: "drag",
        component(el, meta) {
          const factory = ctx.ui.component("music-player");
          const cleanups = [];
          if (factory) cleanups.push(factory(el.querySelector("[data-slot=music]"), meta, ctx));
          return () => { while (cleanups.length) cleanups.pop()(); };
        },
      });
    },
  };

  const { ctx, errors } = await assemblePage({
    moduleId: "drag",
    manifest: {
      plugins: [
        { target: "modules/component-music-player", kind: "component", pages: ["drag"], config: { rollTicks: 40 } },
        { target: "modules/drag", config: { players: ["p1", "p2"] } },
      ],
    },
    container,
    loadPlugin: async (id) => (id === "drag" ? pagePlugin : componentPlugin),
  });

  assert.strictEqual(errors.length, 0);
  assert.strictEqual(calls.factory, 1, "页面取用后恰好实例化一次");
  assert.strictEqual(calls.gotHost, hostEl, "host 由页面决定（组件只操作其内部）");
  assert.deepStrictEqual(calls.gotProps, { players: ["p1", "p2"] }, "props 由页面传入（meta = 本模块条目 config）");
  // 注：断言服务实例而非 ctx 代理本身——cordis Context 是 Proxy（deepStrictEqual/对象比较会触发
  // 未 inject 的服务访问报错），ui 服务在全装配期是同一实例，足以证明传参链路
  assert.strictEqual(calls.gotCtx.ui, ctx.ui, "第三参 = 页面 ctx（同一 ui 服务实例，可继续用 ui/api/state）");

  // 页面重渲染 → 页面 cleanup 链式调用组件 cleanup（组件不会自己消失）
  ctx.ui.render("drag", null, container);
  assert.strictEqual(calls.cleanup, 1, "重渲染必须先回收组件实例");
  assert.strictEqual(calls.factory, 2);

  // 组件未被任何页面取用的场景：只装组件库条目 → 页面渲染占位、工厂零调用
  const container2 = { innerHTML: "" };
  const before = calls.factory;
  await assemblePage({
    moduleId: "drag",
    manifest: { plugins: [{ target: "modules/component-music-player", kind: "component", pages: ["drag"] }] },
    container: container2,
    loadPlugin: async () => componentPlugin,
  });
  assert.strictEqual(calls.factory, before, "kernel 不自动实例化组件（页面未取用 = 零调用）");
  assert.ok(container2.innerHTML.includes("插件未启用或未提供界面"), "仅组件条目的页面按占位降级");
});

test("页面契约回归：重复 render 先调旧 cleanup；未注册 key 渲染占位", async () => {
  const { installUi } = await importUi();
  const container = { innerHTML: "" };
  const ctx = fakeCtx();
  const ui = installUi(ctx);
  let cleanups = 0;
  ui.register({
    key: "a",
    component: (el) => {
      el.innerHTML = "A";
      return () => { cleanups += 1; };
    },
  });
  ui.register({ key: "b", component: (el) => (el.innerHTML = "B") });
  ui.render("a", null, container);
  ui.render("b", null, container);
  assert.strictEqual(cleanups, 1, "切 key 先调旧 cleanup");
  assert.strictEqual(container.innerHTML, "B");
  ui.render("ghost", null, container);
  assert.ok(container.innerHTML.includes("插件未启用或未提供界面"));
  assert.throws(() => ui.register({ component: () => {} }), /key/);
});

if (require.main === module) {
  runTests("web/ui.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
