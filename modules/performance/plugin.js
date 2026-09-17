/**
 * modules/performance 后端插件（P5 终审补齐）
 *
 * 纯占位页面模块（select 页中键快捷入口），
 * 插件职责 = 页面元数据注册 + 卸载清理。
 * 元数据与 modules/modules.json 中 performance 条目逐字段一致。
 */
module.exports = {
  name: "performance",
  inject: ["modules"],
  apply(ctx) {
    ctx.modules.registerPage({
      id: "performance",
      name: "演出",
      description: "演出/中键快捷页面",
      icon: "microphone",
      nav: [],
      order: 20,
    });
    ctx.effect(() => () => ctx.modules.unregister("performance"));
  },
};
