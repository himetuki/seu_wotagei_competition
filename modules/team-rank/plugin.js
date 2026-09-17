/**
 * modules/team-rank 后端插件（P4 迁移）
 *
 * 本模块为纯页面模块：无 server/routes.js、无 server/db.js，
 * 插件职责 = 页面元数据注册 + 卸载清理（inject 相应收窄为 ["modules"]）。
 * 元数据原样迁自 modules/modules.json 中 team-rank 条目（route 由 ctx.modules.list() 投影自动补）。
 * P5a：legacy 双路径已移除，本插件是唯一后端装配入口。
 */
module.exports = {
  name: "team-rank",
  inject: ["modules"],
  apply(ctx) {
    ctx.modules.registerPage({
      id: "team-rank",
      name: "团体排名",
      description: "团体赛排名",
      icon: "award",
      nav: ["index"],
      order: 23,
    });
    ctx.effect(() => () => ctx.modules.unregister("team-rank"));
  },
};
