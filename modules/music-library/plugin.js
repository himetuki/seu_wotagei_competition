/**
 * music-library 后端功能件（P13 自 server/music-scanner.js + server/routes/music-routes.js 迁入）
 *
 * 定位：纯后端功能插件（无页面、不进导航）——音乐文件扫描、音乐列表维护、音乐上传/回收。
 * 与 component-*（纯前端功能件，仅进 web/front.json）对偶：本插件仅进 server/plugins.json。
 *
 * 迁移说明：
 *   - scanner.js  = 原 server/music-scanner.js 逐行迁入（仅 require 相对路径调整）
 *   - routes.js   = 原 server/routes/music-routes.js 迁入，Express Router 平铺为
 *                   registerMusicRoutes(app)（端点路径补 /api 前缀，行为逐字节一致）
 *   - 原服务器 listening 回调中的启动扫描（initializeMusicScanner）迁入本插件 apply——
 *     cordis 装配先于 http listen，时序语义等价（扫描完成后服务器才开始服务）
 *
 * 路由注册在 apply 同步窗口内完成（ctx.server.route 约束）：管理页停用本插件时
 * /api/musics*、/api/upload_music 等路由物理移除、立即 404。
 */
const scanner = require("./scanner");
const { registerMusicRoutes } = require("./routes");

module.exports = {
  name: "music-library",
  inject: ["server"],
  apply(ctx) {
    // 启动扫描（原 server.js listening 回调职责迁此）：确保回收目录存在 + 全量扫描五组曲目
    scanner.initializeMusicScanner();

    ctx.server.route((app) => {
      registerMusicRoutes(app);
    });

    ctx.effect(() => () => {
      // 无需清理：路由由 ctx.server.route 的 scope 生命周期统一移除；
      // 扫描器无驻留句柄（全同步 fs 操作）
    });
  },
};
