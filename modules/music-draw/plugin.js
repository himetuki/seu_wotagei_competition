/**
 * modules/music-draw 后端插件（P5 终审补齐）
 *
 * 纯前端模块：无独立 API 与数据库，插件职责 = 页面元数据注册 + 卸载清理。
 * 元数据与 modules/modules.json 中 music-draw 条目逐字段一致（route 由投影自动补）。
 */
module.exports = {
  name: "music-draw",
  inject: ["modules"],
  apply(ctx) {
    ctx.modules.registerPage({
      id: "music-draw",
      name: "音乐抽取",
      description: "直接抽取音乐",
      icon: "music",
      nav: ["select"],
      order: 16,
    });
    ctx.effect(() => () => ctx.modules.unregister("music-draw"));
  },
};
