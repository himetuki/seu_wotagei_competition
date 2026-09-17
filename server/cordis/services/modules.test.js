/**
 * server/cordis/services/modules.js — ctx.modules 单元测试（真实 cordis Context）
 *
 * 覆盖：registerPage/unregister/list/get；按 id 去重（后注册者优先，迁移期插件注册
 * 覆盖同名桥接条目 D3）；7 字段投影一致性（与 server/routes/module-routes.js:20-29
 * 逐字段一致，selfcheck A3 守门员的同一基准）；缺省值与假值字段归一。
 */
const { test, runTests, assert } = require("../../test-lib");
const { Context } = require("cordis");
const { installModules } = require("./modules");

function makeCtx() {
  const ctx = new Context();
  const service = installModules(ctx, {});
  return { ctx, service };
}

test("installModules 向真实 cordis Context provide 服务（ctx.modules 即服务对象）", () => {
  const { ctx, service } = makeCtx();
  assert.strictEqual(ctx.modules, service);
  for (const k of ["registerPage", "unregister", "list", "get"]) {
    assert.strictEqual(typeof service[k], "function");
  }
});

test("list() 输出 7 字段投影且键序与 module-routes 投影一致", () => {
  const { service } = makeCtx();
  service.registerPage({ id: "drag", name: "拖拽" });
  const [item] = service.list();
  assert.deepStrictEqual(Object.keys(item), [
    "id", "name", "description", "icon", "nav", "order", "route",
  ]);
  assert.deepStrictEqual(item, {
    id: "drag", name: "拖拽", description: "", icon: "", nav: [], order: 0,
    route: "/m/drag/",
  });
});

test("完整字段原样投影；route 恒按 /m/<id>/ 生成", () => {
  const { service } = makeCtx();
  service.registerPage({
    id: "gb", name: "团体赛", description: "desc", icon: "puzzle",
    nav: ["select"], order: 5,
  });
  assert.deepStrictEqual(service.list(), [{
    id: "gb", name: "团体赛", description: "desc", icon: "puzzle",
    nav: ["select"], order: 5, route: "/m/gb/",
  }]);
});

test("get() 返回原始元数据（无投影缺省值），未知 id 返回 null", () => {
  const { service } = makeCtx();
  service.registerPage({ id: "raw", name: "R" });
  const raw = service.get("raw");
  assert.strictEqual(raw.route, undefined);
  assert.strictEqual(raw.description, undefined);
  assert.strictEqual(service.get("nope"), null);
});

test("按 id 去重：后注册者覆盖且保持原插入位（插件注册优先于桥接条目 D3）", () => {
  const { service } = makeCtx();
  service.registerPage({ id: "a", name: "A" });
  service.registerPage({ id: "m", name: "桥接条目", nav: ["select"] }); // 模拟 loader 投影
  service.registerPage({ id: "b", name: "B" });
  service.registerPage({ id: "m", name: "插件注册" }); // 插件后挂载覆盖
  const list = service.list();
  assert.strictEqual(list.length, 3);
  assert.deepStrictEqual(list.map((m) => m.id), ["a", "m", "b"]);
  assert.strictEqual(list[1].name, "插件注册");
  assert.deepStrictEqual(list[1].nav, []); // 整条覆盖，不残留桥接条目字段
});

test("registerPage 缺 meta 或缺 id 抛错", () => {
  const { service } = makeCtx();
  assert.throws(() => service.registerPage(null), /meta\.id/);
  assert.throws(() => service.registerPage({ name: "no-id" }), /meta\.id/);
});

test("unregister 移除条目：list 清空、get 回落 null、重复 unregister 为 no-op", () => {
  const { service } = makeCtx();
  service.registerPage({ id: "x", name: "X" });
  service.unregister("x");
  assert.deepStrictEqual(service.list(), []);
  assert.strictEqual(service.get("x"), null);
  service.unregister("x");
  assert.deepStrictEqual(service.list(), []);
});

test("registerPage 存副本：外部改写原 meta 对象不影响清单输出", () => {
  const { service } = makeCtx();
  const meta = { id: "copy", name: "before" };
  service.registerPage(meta);
  meta.name = "after";
  assert.strictEqual(service.list()[0].name, "before");
});

test("假值字段归一：nav:null→[]、order:null→0、description:null→''（list 层，get 层保持原值）", () => {
  const { service } = makeCtx();
  service.registerPage({ id: "falsy", name: "F", nav: null, order: null, description: null, icon: null });
  assert.deepStrictEqual(service.list()[0], {
    id: "falsy", name: "F", description: "", icon: "", nav: [], order: 0,
    route: "/m/falsy/",
  });
  assert.strictEqual(service.get("falsy").nav, null);
});

test("order 参与输出但不自动排序：list 保持注册序（导航排序由消费方负责）", () => {
  const { service } = makeCtx();
  service.registerPage({ id: "late", name: "L", order: 1 });
  service.registerPage({ id: "early", name: "E", order: 100 });
  assert.deepStrictEqual(service.list().map((m) => m.id), ["late", "early"]);
});

if (require.main === module) {
  runTests("server/cordis/services/modules.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
