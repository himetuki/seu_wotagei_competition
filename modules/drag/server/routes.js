/**
 * drag 模块后端路由
 * 从原 server/routes/game-routes.js 的 Drag 段落迁移而来
 * 共享设施由模块加载器注入 ctx（第 2 参数），支持任意目录深度
 */
module.exports = (app, { dbManager, serverLog }) => {
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
};