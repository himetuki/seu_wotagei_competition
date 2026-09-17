/**
 * moving-sth 后端插件（P4 迁移）—— 原 server/routes.js + server/db.js 纯搬运包壳
 *
 * 挂载语义：由 server/cordis/loader.js 按装配清单挂载（P5a 起 cordis 为唯一装配路径）。
 * 路由注册在 apply 同步窗口内完成（ctx.server.route 约束）。
 */
module.exports = {
  name: "moving-sth",
  inject: ["db", "server", "modules"],
  apply(ctx) {
    // ---- 原 modules/moving-sth/server/db.js 原样迁入 ----
    ctx.db.define([
      {
        name: "game_setting",
        defaultValue: {
          "moving-sth": {
            timeLimit: 60,
          },
        },
      },
    ]);

    // ---- 原 modules/moving-sth/server/routes.js 回调整体迁入 ----
    ctx.server.route((app, { dbManager, serverLog }) => {
      function getDB(name) {
        try {
          return dbManager.get(name);
        } catch (error) {
          serverLog(`获取数据库[${name}]失败: ${error.message}`, "error");
          throw error;
        }
      }

      // 搬化棒游戏设置API
      app.get("/api/settings/moving-sth", (req, res) => {
        try {
          const settings = getDB("game_setting").get("moving-sth").value();
          res.json(settings);
        } catch (error) {
          serverLog("获取搬化棒游戏设置失败:", "error");
          serverLog(error.message, "error");
          res.status(500).send(`Error: ${error.message}`);
        }
      });

      app.post("/api/settings/moving-sth", (req, res) => {
        try {
          serverLog("收到搬化棒游戏设置: " + JSON.stringify(req.body));
          getDB("game_setting").set("moving-sth", req.body).write();
          serverLog("成功保存搬化棒游戏设置");
          res.status(200).send("保存成功");
        } catch (error) {
          serverLog("保存搬化棒游戏设置失败: " + error.message, "error");
          res.status(500).send(`Error: ${error.message}`);
        }
      });

      serverLog("moving-sth 模块路由已设置完成");
    });

    // ---- 元数据（原 modules/modules.json 条目，随迁移移至插件注册） ----
    ctx.modules.registerPage({
      id: "moving-sth",
      name: "定时搬化棒",
      description: "在规定时间内完成化棒移动挑战",
      icon: "clock-play",
      nav: ["games"],
      order: 1,
    });
    ctx.effect(() => () => ctx.modules.unregister("moving-sth"));
  },
};
