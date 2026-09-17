/**
 * battle-group2 后端插件（P4）—— 原 server/routes.js + server/db.js 纯搬运包壳
 *
 * 挂载语义：由 server/cordis/loader.js 按装配清单挂载（P5a 起 cordis 为唯一装配路径）。
 * 路由注册在 apply 同步窗口内完成（ctx.server.route 约束）。
 */
module.exports = {
  name: "battle-group2",
  inject: ["db", "server", "modules"],
  apply(ctx) {
    // ---- 原 modules/battle-group2/server/db.js 原样迁入 ----
    ctx.db.define([
      {
        name: "battle-group2-process",
        defaultValue: {
          players: [],
          currentIndex: 0,
          currentTrick: "",
          currentMusic: "",
          crossedTricks: [],
        },
      },
    ]);

    // ---- 原 modules/battle-group2/server/routes.js 回调整体迁入 ----
    ctx.server.route((app, { dbManager, serverLog }) => {
      function getDB(name) {
        try {
          return dbManager.get(name);
        } catch (error) {
          serverLog(`获取数据库[${name}]失败: ${error.message}`, "error");
          throw error;
        }
      }

      app.post("/api/battle-group2-process", (req, res) => {
        try {
          serverLog(
            "收到 battle-group2 进度数据: " +
              JSON.stringify(req.body).substring(0, 100) +
              "..."
          );
          getDB("battle-group2-process").setState(req.body).write();
          serverLog("成功保存 battle-group2 进度数据");
          res.status(200).send("保存成功");
        } catch (error) {
          serverLog("保存 battle-group2 进度失败: " + error.message, "error");
          res.status(500).send(`Error: ${error.message}`);
        }
      });

      app.get("/api/battle-group2-process", (req, res) => {
        try {
          const data = getDB("battle-group2-process").getState();
          res.json(data);
        } catch (error) {
          serverLog("获取 battle-group2 进度失败: " + error.message, "error");
          res.status(500).send(`Error: ${error.message}`);
        }
      });

      app.post("/api/clear-battle-group2-process", (req, res) => {
        try {
          getDB("battle-group2-process")
            .setState({
              players: [],
              currentIndex: 0,
              currentTrick: "",
              currentMusic: "",
              crossedTricks: [],
            })
            .write();
          serverLog("已清除 battle-group2 进度数据");
          res.status(200).send("清除成功");
        } catch (error) {
          serverLog("清除 battle-group2 进度失败: " + error.message, "error");
          res.status(500).send(`Error: ${error.message}`);
        }
      });

      serverLog("battle-group2 模块路由已设置完成");
    });

    // ---- 元数据（原 modules/modules.json 条目，随迁移移至插件注册） ----
    ctx.modules.registerPage({
      id: "battle-group2",
      name: "Rookies II（一年内组）",
      description: "一年内组章节赛",
      icon: "seedling",
      nav: ["select"],
      order: 12,
    });
    ctx.effect(() => () => ctx.modules.unregister("battle-group2"));
  },
};
