/**
 * custom-stage 后端插件
 *
 * 契约要点：
 * - CJS：module.exports = { name, inject, apply(ctx) }
 * - inject 白名单 = server / db / modules / assembly + 清单条目 provides 声明的服务；
 *   拼写错误会让 fiber 永久挂起（装配死锁），loader 会校验并跳过该插件
 * - ctx.modules.registerPage 的字段必须与 modules/modules.json 的 custom-stage 条目逐字段一致
 *   （页面元数据单一来源 = modules.json，registerPage 是其运行时声明处）
 */
module.exports = {
  name: "custom-stage",
  inject: ["modules"],
  apply(ctx) {
    // ---- 需要后端 API 时再补充 ----
    // 1) inject 改为 ["db", "server", "modules"]
    // 2) 数据库：ctx.db.define([{ name: "custom-stage-process", defaultValue: {} }])
    // 3) 路由（必须在 apply 同步窗口内调用）：
    //    ctx.server.route((app, { dbManager, serverLog }) => {
    //      app.get("/api/custom-stage/ping", (req, res) => res.json({ ok: true }));
    //    });
    // 4) 改完后在 /m/plugin-manager/ 对本插件点「热重载」，或重启 node server.js

    // ---- 页面元数据（与 modules/modules.json 中 custom-stage 条目逐字段一致） ----
    ctx.modules.registerPage({
      id: "custom-stage",
      name: "组合舞台",
      description: "运行可视化编排保存的赛制",
      icon: "apps",
      nav: ["select"],
      order: 18,
    });

    // 插件卸载时同步注销页面元数据（管理页停用后 /api/modules 与 /m/custom-stage 同步消失）
    ctx.effect(() => () => ctx.modules.unregister("custom-stage"));
  },
};
