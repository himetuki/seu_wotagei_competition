/**
 * API路由模块
 */
const { dbManager } = require("../database");

// 导入音乐路由模块
const musicRoutes = require("./music-routes");

// 获取数据库实例
function getDB(name) {
  return dbManager.get(name);
}

// 设置API路由
function setupApiRoutes(app) {
  // 获胜者相关API
  app.post("/api/winners", (req, res) => {
    try {
      console.log("收到获胜者数据:", req.body);
      const winnersDB = getDB("winners");
      const currentState = winnersDB.getState();

      Object.entries(req.body).forEach(([chapterKey, rounds]) => {
        if (!currentState[chapterKey]) {
          currentState[chapterKey] = {};
        }
        currentState[chapterKey] = { ...currentState[chapterKey], ...rounds };
      });

      winnersDB.setState(currentState).write();
      console.log("成功保存获胜者数据:", currentState);
      res.status(200).send("保存成功");
    } catch (error) {
      console.error("保存获胜者数据失败:", error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.post("/api/winner", (req, res) => {
    try {
      console.log("收到获胜者数据:", req.body);
      const winnersDB = getDB("winners");
      const winnerData = req.body;
      const chapterKey = `chapter${winnerData.chapter}`;
      const roundKey = `round${winnerData.round}`;

      if (!winnersDB.has(chapterKey).value()) {
        winnersDB.set(chapterKey, {}).write();
      }

      winnersDB.get(chapterKey).set(roundKey, winnerData.winner).write();
      console.log("成功保存获胜者数据");
      res.send("Winner recorded successfully");
    } catch (error) {
      console.error("保存获胜者数据出错:", error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.get("/resource/json/winner.json", (req, res) => {
    try {
      const winners = getDB("winners").getState();
      res.json(winners);
    } catch (error) {
      console.error("读取获胜者数据出错:", error);
      res.status(500).send("Error reading winners data");
    }
  });

  // 通用数据API
  app.post("/api/data/:collection", (req, res) => {
    try {
      const collection = req.params.collection;
      console.log(`保存到数据集[${collection}]:`, req.body);
      const db = dbManager.init(collection);
      const data = req.body;

      if (data.id) {
        db.set(data.id.toString(), data).write();
      } else {
        const id = Date.now().toString();
        data.id = id;
        db.set(id, data).write();
      }

      res.json({ success: true, data });
    } catch (error) {
      console.error(`保存数据到[${req.params.collection}]出错:`, error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.get("/api/data/:collection", (req, res) => {
    try {
      const collection = req.params.collection;
      const db = dbManager.get(collection);
      res.json(db.getState());
    } catch (error) {
      console.error(`读取数据集[${req.params.collection}]出错:`, error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.get("/api/data/:collection/:id", (req, res) => {
    try {
      const { collection, id } = req.params;
      const db = dbManager.get(collection);
      const data = db.get(id).value();

      if (data) {
        res.json(data);
      } else {
        res.status(404).send(`Item not found in ${collection}`);
      }
    } catch (error) {
      console.error(
        `读取数据[${req.params.collection}/${req.params.id}]出错:`,
        error
      );
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 搬化棒游戏设置API
  app.get("/api/settings/moving-sth", (req, res) => {
    try {
      const settings = getDB("game_setting").get("moving-sth").value();
      res.json(settings);
    } catch (error) {
      console.error("获取搬化棒游戏设置失败:", error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.post("/api/settings/moving-sth", (req, res) => {
    try {
      console.log("收到搬化棒游戏设置:", req.body);
      getDB("game_setting").set("moving-sth", req.body).write();
      console.log("成功保存搬化棒游戏设置");
      res.status(200).send("保存成功");
    } catch (error) {
      console.error("保存搬化棒游戏设置失败:", error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 重置API
  app.post("/api/reset-winners", (req, res) => {
    try {
      if (!req.body || !req.body.confirm) {
        return res.status(400).send("需要确认重置操作");
      }

      getDB("winners").setState({}).write();
      console.log("已成功重置获胜者数据");
      res.status(200).send("获胜者数据已重置");
    } catch (error) {
      console.error("重置获胜者数据失败:", error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 添加音乐管理API路由
  app.use("/api", musicRoutes);

  console.log("API路由已设置完成");
}

module.exports = setupApiRoutes;
