/**
 * modules/home 后端插件（P4 迁移）
 *
 * 本模块为纯页面/导航模块：无 server/routes.js、无 server/db.js，
 * 插件职责 = 页面元数据注册 + 卸载清理（inject 相应收窄为 ["modules"]）。
 * 元数据原样迁自 modules/modules.json 中 home 条目（route 由 ctx.modules.list() 投影自动补）。
 * 本页面同时由根路径 "/"（server/routes/static-routes.js 直接服务 home/index.html）
 * 与 /m/home/ 提供；前端 moduleId 由 web/loader 按 "/" 与 "/index.html" 归一为 "home"。
 * P5a：legacy 双路径已移除，本插件是唯一后端装配入口。
 */
module.exports = {
  name: "home",
  inject: ["modules"],
  apply(ctx) {
    ctx.modules.registerPage({
      id: "home",
      name: "主页",
      description: "2026 Y.Stage 4 比赛现场入口",
      icon: "home",
      nav: [],
      order: 0,
    });
    ctx.effect(() => () => ctx.modules.unregister("home"));
  },
};
