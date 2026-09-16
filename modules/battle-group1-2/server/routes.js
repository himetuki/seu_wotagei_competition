/**
 * battle-group1-2 模块后端路由
 * 从原 server/routes/game-routes.js 的 battle-group1-2 段落迁移而来
 */
module.exports = (app, { dbManager, serverLog }) => {
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
};