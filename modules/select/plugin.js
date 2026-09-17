/**
 * modules/select 后端插件（P3b 迁移）
 *
 * 本模块为纯页面/导航模块：无 server/routes.js、无 server/db.js，
 * 插件职责 = 页面元数据注册 + 卸载清理（inject 相应收窄为 ["modules"]）。
 * 元数据原样迁自 modules/modules.json 中 select 条目（route 由 ctx.modules.list() 投影自动补）。
 * P5a：legacy 双路径已移除，本插件是唯一后端装配入口。
 */
module.exports = {
  name: "select",
  inject: ["modules"],
  apply(ctx) {
    ctx.modules.registerPage({
      id: "select",
      name: "赛制选择",
      description: "选择赛制：单人/团体/Drag",
      icon: "swords",
      nav: ["index", "select"],
      order: 1,
    });
    ctx.effect(() => () => ctx.modules.unregister("select"));
  },
};
