/**
 * 模块元数据可变数据源（v1 计划 D2 间接层）
 *
 * 默认源 = module-loader 清单投影（装配前兜底）；P5a 起 server.js 默认即 cordis
 * 装配，装配成功后 setSource() 切到 ctx.modules（/api/modules 与 /m/:id 数据源）。
 * reset() 恢复默认源，供测试/回退。
 * 惰性 require：避免启动期 server/module-loader ↔ 路由 的加载环。
 */
let listFn = () => require("./module-loader").getModules();
let getFn = (id) => require("./module-loader").getModule(id);

function listModules() {
  return listFn();
}

function getModule(id) {
  return getFn(id);
}

function setSource(list, get) {
  listFn = list;
  getFn = get;
}

function reset() {
  listFn = () => require("./module-loader").getModules();
  getFn = (id) => require("./module-loader").getModule(id);
}

module.exports = { listModules, getModule, setSource, reset };
