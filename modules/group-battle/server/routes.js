/**
 * group-battle 模块后端路由
 * 从原 server/routes/game-routes.js 与 api-routes.js 的 group-battle 段落迁移而来（原两处重复定义，合并于此）
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

  app.post("/api/group-battle-process", (req, res) => {
    try {
      serverLog(
        "收到 group-battle 进度数据: " +
          JSON.stringify(req.body).substring(0, 100) +
          "..."
      );
      getDB("group-battle-process")
        .set("currentState", req.body)
        .set("lastUpdate", new Date().toISOString())
        .write();
      serverLog("成功保存 group-battle 进度数据");
      res.status(200).send("保存成功");
    } catch (error) {
      serverLog("保存 group-battle 进度失败: " + error.message, "error");
      res.status(500).send("Error: " + error.message);
    }
  });

  app.get("/api/group-battle-process", (req, res) => {
    try {
      const data = getDB("group-battle-process").getState();
      res.json(data);
    } catch (error) {
      serverLog("获取 group-battle 进度失败: " + error.message, "error");
      res.status(500).send("Error: " + error.message);
    }
  });

  app.post("/api/clear-group-battle-process", (req, res) => {
    try {
      getDB("group-battle-process")
        .setState({
          currentState: null,
          lastUpdate: new Date().toISOString(),
        })
        .write();
      serverLog("已清除 group-battle 进度数据");
      res.status(200).send("清除成功");
    } catch (error) {
      serverLog("清除 group-battle 进度失败: " + error.message, "error");
      res.status(500).send("Error: " + error.message);
    }
  });

  serverLog("group-battle 模块路由已设置完成");
};