/**
 * drag 后端插件（P3c）—— 原 server/routes.js + server/db.js 纯搬运包壳
 *
 * 挂载语义：由 server/cordis/loader.js 按装配清单挂载（P5a 起 cordis 为唯一装配路径）。
 * 路由注册在 apply 同步窗口内完成（ctx.server.route 约束）。
 */
module.exports = {
  name: "drag",
  inject: ["db", "server", "modules"],
  apply(ctx) {
    // ---- 原 modules/drag/server/db.js 原样迁入 ----
    ctx.db.define([
      {
        name: "drag-process",
        defaultValue: {
          phase: "idle",
          players: [],
          playerSource: "player1",
          totalCount: 8,
          currentRound: 1,
          totalRounds: 1,
          bracket: { rounds: [] },
          currentMatch: null,
          currentMusic: null,
          currentMusicLib: null,
          matchHistory: [],
          undoStack: [],
          lastUpdate: new Date().toISOString(),
        },
      },
      {
        name: "drag-settings",
        defaultValue: {
          totalCount: 8,
        },
      },
    ]);

    // ---- 原 modules/drag/server/routes.js 回调整体迁入 ----
    ctx.server.route((app, { dbManager, serverLog }) => {
      // 获取数据库实例
      function getDB(name) {
        try {
          return dbManager.get(name);
        } catch (error) {
          serverLog(`获取数据库[${name}]失败: ${error.message}`, "error");
          throw error;
        }
      }

      // ========== Drag式比赛进度API ==========
      app.post("/api/drag-process", (req, res) => {
        try {
          serverLog(
            "收到 drag-process 进度数据: " +
              JSON.stringify(req.body).substring(0, 100) +
              "..."
          );
          getDB("drag-process")
            .setState({ ...req.body, lastUpdate: new Date().toISOString() })
            .write();
          serverLog("成功保存 drag-process 进度数据");
          res.status(200).send("保存成功");
        } catch (error) {
          serverLog("保存 drag-process 进度失败: " + error.message, "error");
          res.status(500).send("Error: " + error.message);
        }
      });

      app.get("/api/drag-process", (req, res) => {
        try {
          const data = getDB("drag-process").getState();
          res.json(data);
        } catch (error) {
          serverLog("获取 drag-process 进度失败: " + error.message, "error");
          res.status(500).send("Error: " + error.message);
        }
      });

      app.post("/api/clear-drag-process", (req, res) => {
        try {
          getDB("drag-process")
            .setState({
              phase: "idle",
              players: [],
              playerSource: "player1",
              totalCount: 8,
              currentRound: 1,
              totalRounds: 1,
              bracket: { rounds: [] },
              currentMatch: null,
              currentMusic: null,
              currentMusicLib: null,
              matchHistory: [],
              undoStack: [],
              lastUpdate: new Date().toISOString(),
            })
            .write();
          serverLog("已清除 drag-process 进度数据");
          res.status(200).send("清除成功");
        } catch (error) {
          serverLog("清除 drag-process 进度失败: " + error.message, "error");
          res.status(500).send("Error: " + error.message);
        }
      });

      // ========== Drag式比赛设置API ==========
      app.get("/api/drag-settings", (req, res) => {
        try {
          const data = getDB("drag-settings").getState();
          res.json(data);
        } catch (error) {
          serverLog("获取 drag-settings 失败: " + error.message, "error");
          res.status(500).send("Error: " + error.message);
        }
      });

      app.post("/api/drag-settings", (req, res) => {
        try {
          getDB("drag-settings")
            .setState({ ...req.body })
            .write();
          serverLog("成功保存 drag-settings");
          res.status(200).send("保存成功");
        } catch (error) {
          serverLog("保存 drag-settings 失败: " + error.message, "error");
          res.status(500).send("Error: " + error.message);
        }
      });

      serverLog("drag 模块路由已设置完成");
    });

    // ---- 元数据（原 modules/modules.json 条目，随迁移移至插件注册） ----
    ctx.modules.registerPage({
      id: "drag",
      name: "Drag式比赛",
      description: "对阵树式四强双败赛",
      icon: "trophy",
      nav: ["select"],
      order: 15,
    });
    ctx.effect(() => () => ctx.modules.unregister("drag"));
  },
};
