/**
 * theme-manager 后端插件 —— 系统主题管理（主题插件组 · 管理页）
 *
 * 职责：
 *   1) db.define theme-store（系统级当前主题，落盘 resource/sqlite/y-stage.sqlite）
 *   2) GET /api/theme/active → { active }（缺省 "default"）
 *      PUT /api/theme/active { active } → 校验 /^[a-z][a-z0-9-]{0,39}$/ 后整包写回
 *      （前端各主题插件在每页装配时读本接口对账——系统级切换，全场同主题）
 *   3) registerPage 页面元数据（与 modules/modules.json 条目逐字段一致）
 *
 * 主题发现机制：前端侧各主题以组件名 "theme:<id>" 注册进组件表（见
 * component-theme-neon 的契约注释），本页前端枚举 ctx.ui.listComponents() 中
 * "theme:" 前缀名渲染主题卡——新增主题插件即自动出现在本页，无需改本插件。
 */
const THEME_ID_RE = /^[a-z][a-z0-9-]{0,39}$/;

module.exports = {
  name: "theme-manager",
  inject: ["db", "server", "modules"],
  apply(ctx) {
    // ---- 数据库定义（SQLite 文档存储） ----
    ctx.db.define([
      { name: "theme-store", defaultValue: { active: "default" } },
    ]);

    // ---- 路由注册（apply 同步窗口内；scope 生命周期 = 本插件 fiber） ----
    ctx.server.route((app, { dbManager }) => {
      app.get("/api/theme/active", (req, res) => {
        try {
          const state = dbManager.get("theme-store").getState() || {};
          res.json({ active: typeof state.active === "string" && state.active ? state.active : "default" });
        } catch (error) {
          console.error("[theme-manager] 读取主题失败:", error);
          res.status(500).json({ error: error.message });
        }
      });

      app.put("/api/theme/active", (req, res) => {
        try {
          const body = req.body && typeof req.body === "object" ? req.body : {};
          const id = typeof body.active === "string" ? body.active : "";
          if (!THEME_ID_RE.test(id)) {
            return res.status(400).json({ error: "active 必须为小写字母开头的 kebab-case 主题 id" });
          }
          dbManager.get("theme-store").setState({ active: id }).write();
          console.log(`[theme-manager] 系统主题已切换: ${id}`);
          res.json({ active: id });
        } catch (error) {
          console.error("[theme-manager] 写入主题失败:", error);
          res.status(500).json({ error: error.message });
        }
      });
    });

    // ---- 页面元数据（与 modules/modules.json 中 theme-manager 条目逐字段一致） ----
    // nav 留空：不进主页导航（入口 = 插件管理页「主题插件」tab 的「管理」链接 + 直链 /m/theme-manager/）
    ctx.modules.registerPage({
      id: "theme-manager",
      name: "主题管理",
      description: "系统主题切换：默认 / 霓虹 / 自建主题插件",
      icon: "sparkles",
      nav: [],
      order: 3,
    });

    // 插件卸载时同步注销页面元数据（管理页停用后 /api/modules 与 /m/theme-manager 同步消失）
    ctx.effect(() => () => ctx.modules.unregister("theme-manager"));
  },
};
