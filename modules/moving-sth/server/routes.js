/**
 * moving-sth 模块后端路由（定时搬化棒）
 * /api/settings/moving-sth 从原 server/routes/api-routes.js 迁移而来
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
};