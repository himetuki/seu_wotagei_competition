/**
 * battle-group1-2 后端插件（P4）—— 原 server/routes.js + server/db.js 纯搬运包壳
 *
 * 挂载语义：由 server/cordis/loader.js 按装配清单挂载（P5a 起 cordis 为唯一装配路径）。
 * 路由注册在 apply 同步窗口内完成（ctx.server.route 约束）。
 */
module.exports = {
  name: "battle-group1-2",
  inject: ["db", "server", "modules"],
  apply(ctx) {
    // ---- 原 modules/battle-group1-2/server/db.js 原样迁入 ----
    ctx.db.define([
      {
        name: "battle-group1-2-process",
        defaultValue: {
          currentRound: 1,
          currentBracket: "winner",
          currentMatchIndex: 0,
          currentWinner: null,
          players: [],
          playerStats: {},
          matches: [],
          bracket: {
            winner: [],
            loser: [],
            final: [],
          },
          chapter: 2,
          lastUpdate: new Date().toISOString(),
        },
      },
    ]);

    // ---- 原 modules/battle-group1-2/server/routes.js 回调整体迁入 ----
    ctx.server.route((app, { dbManager, serverLog }) => {
      function getDB(name) {
        try {
          return dbManager.get(name);
        } catch (error) {
          serverLog(`获取数据库[${name}]失败: ${error.message}`, "error");
          throw error;
        }
      }

      app.post("/api/battle-group1-2-process", (req, res) => {
        try {
          serverLog(
            "收到 battle-group1-2 进度数据: " +
              JSON.stringify(req.body).substring(0, 100) +
              "..."
          );
          getDB("battle-group1-2-process").setState(req.body).write();
          serverLog("成功保存 battle-group1-2 进度数据");
          res.status(200).send("保存成功");
        } catch (error) {
          serverLog("保存 battle-group1-2 进度失败: " + error.message, "error");
          res.status(500).send(`Error: ${error.message}`);
        }
      });

      app.get("/api/battle-group1-2-process", (req, res) => {
        try {
          const data = getDB("battle-group1-2-process").getState();
          res.json(data);
        } catch (error) {
          serverLog("获取 battle-group1-2 进度失败: " + error.message, "error");
          res.status(500).send(`Error: ${error.message}`);
        }
      });

      app.post("/api/clear-battle-group1-2-process", (req, res) => {
        try {
          getDB("battle-group1-2-process")
            .setState({
              currentRound: 1,
              currentBracket: "winner",
              currentMatchIndex: 0,
              currentWinner: null,
              players: [],
              playerStats: {},
              matches: [],
              bracket: {
                winner: [],
                loser: [],
                final: [],
              },
              chapter: 2,
              lastUpdate: new Date().toISOString(),
            })
            .write();
          serverLog("已清除 battle-group1-2 进度数据");
          res.status(200).send("清除成功");
        } catch (error) {
          serverLog("清除 battle-group1-2 进度失败: " + error.message, "error");
          res.status(500).send(`Error: ${error.message}`);
        }
      });

      serverLog("battle-group1-2 模块路由已设置完成");
    });

    // ---- 元数据（原 modules/modules.json 条目，随迁移移至插件注册） ----
    ctx.modules.registerPage({
      id: "battle-group1-2",
      name: "一年加组第二章",
      description: "一年加组第二章节",
      icon: "target-arrow",
      nav: ["select"],
      order: 11,
    });
    ctx.effect(() => () => ctx.modules.unregister("battle-group1-2"));
  },
};
