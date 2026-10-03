/**
 * API路由模块
 */
const { dbManager } = require("../database");

// 获取数据库实例
function getDB(name) {
  return dbManager.get(name);
}

// 原型污染防护（v6.3.1）：__proto__ / constructor / prototype 键一律拒绝——
// 直接下标赋值或 setPath 点路径穿过这些段会改写对象原型 / Object.prototype，
// 一条请求即可让全进程 hasOwnProperty 等基础方法失效直至重启。
function isUnsafeKey(key) {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

// 设置API路由
function setupApiRoutes(app) {
  // 获胜者相关API
  app.post("/api/winners", (req, res) => {
    try {
      console.log("收到获胜者数据:", req.body);
      const winnersDB = getDB("winners");
      const currentState = winnersDB.getState();

      // 先整体验证再变更：非法键名在触碰 state 之前以 400 拒绝
      const chapterKeys = Object.keys(req.body || {});
      if (chapterKeys.some(isUnsafeKey)) {
        return res.status(400).send("非法键名");
      }
      chapterKeys.forEach((chapterKey) => {
        if (!currentState[chapterKey]) {
          currentState[chapterKey] = {};
        }
        currentState[chapterKey] = { ...currentState[chapterKey], ...req.body[chapterKey] };
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

      // id 为点路径（存储层按 "." 拆段下标写入），含危险段以 400 显式拒绝
      const idPath = data && data.id != null ? String(data.id) : "";
      if (idPath.split(".").some(isUnsafeKey)) {
        return res.status(400).json({ success: false, error: "id 含非法路径段" });
      }

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

  console.log("API路由已设置完成");
}

module.exports = setupApiRoutes;
