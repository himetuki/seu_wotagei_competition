/**
 * modules/music-import 后端插件（P5 终审补齐）
 *
 * 纯前端模块（上传/列表/回收 API 位于纯后端功能件 music-library，属插件间隐式依赖：
 * 该插件被停用时本页上传/回收请求 404，页面降级报错不崩），
 * 插件职责 = 页面元数据注册 + 卸载清理。
 * 元数据与 modules/modules.json 中 music-import 条目逐字段一致。
 */
module.exports = {
  name: "music-import",
  inject: ["modules"],
  apply(ctx) {
    ctx.modules.registerPage({
      id: "music-import",
      name: "音乐导入",
      description: "批量导入音乐文件",
      icon: "playlist",
      nav: [],
      order: 40,
    });
    ctx.effect(() => () => ctx.modules.unregister("music-import"));
  },
};
