/**
 * 测试API路由模块
 * 用于测试数据库操作（读取、写入、删除）
 */
const { dbManager } = require("../database");
const { serverLog } = require("../utils");

// 设置测试API路由
function setupTestRoutes(app) {
  // 测试数据库名称，避免影响正式数据
  const TEST_DB_NAME = "test_database";

  // 测试读取功能
  app.get("/api/test/read", (req, res) => {
    try {
      // 初始化一个测试数据库（如果不存在）
      const db = dbManager.init(TEST_DB_NAME, {
        timestamp: new Date().toISOString(),
        message: "这是一个测试数据库",
        items: [],
      });

      // 读取数据库内容
      const data = db.getState();

      serverLog(`测试读取成功: ${TEST_DB_NAME}`);
      res.status(200).json({
        success: true,
        operation: "read",
        data: data,
      });
    } catch (error) {
      serverLog(`测试读取失败: ${error.message}`, "error");
      res.status(500).json({
        success: false,
        operation: "read",
        error: error.message,
      });
    }
  });

  // 测试写入功能
  app.post("/api/test/write", (req, res) => {
    try {
      const db = dbManager.get(TEST_DB_NAME);
      const testItem = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        content:
          req.body.content ||
          "测试数据" + Math.random().toString(36).substring(2, 8),
      };

      // 添加一条测试数据
      db.get("items").push(testItem).write();

      serverLog(`测试写入成功: ${JSON.stringify(testItem)}`);
      res.status(200).json({
        success: true,
        operation: "write",
        item: testItem,
        data: db.getState(),
      });
    } catch (error) {
      serverLog(`测试写入失败: ${error.message}`, "error");
      res.status(500).json({
        success: false,
        operation: "write",
        error: error.message,
      });
    }
  });

  // 测试删除功能
  app.delete("/api/test/delete/:id", (req, res) => {
    try {
      const db = dbManager.get(TEST_DB_NAME);
      const id = req.params.id;

      // 查找项目
      const items = db.get("items").value();
      const itemExists = items.some((item) => item.id === id);

      if (!itemExists) {
        return res.status(404).json({
          success: false,
          operation: "delete",
          error: `ID为${id}的项目不存在`,
        });
      }

      // 删除指定ID的项目
      db.get("items").remove({ id: id }).write();

      serverLog(`测试删除成功: 项目ID ${id}`);
      res.status(200).json({
        success: true,
        operation: "delete",
        deletedId: id,
        data: db.getState(),
      });
    } catch (error) {
      serverLog(`测试删除失败: ${error.message}`, "error");
      res.status(500).json({
        success: false,
        operation: "delete",
        error: error.message,
      });
    }
  });

  // 清空测试数据库
  app.post("/api/test/reset", (req, res) => {
    try {
      const db = dbManager.get(TEST_DB_NAME);

      // 重置数据库到初始状态
      db.setState({
        timestamp: new Date().toISOString(),
        message: "测试数据库已重置",
        items: [],
      }).write();

      serverLog(`测试数据库已重置: ${TEST_DB_NAME}`);
      res.status(200).json({
        success: true,
        operation: "reset",
        data: db.getState(),
      });
    } catch (error) {
      serverLog(`重置测试数据库失败: ${error.message}`, "error");
      res.status(500).json({
        success: false,
        operation: "reset",
        error: error.message,
      });
    }
  });

  // 测试数据库状态
  app.get("/api/test/status", (req, res) => {
    try {
      // 检查所有关键数据库
      const criticalDbs = [
        "battle-group2-2-process",
        "winners",
        "battle-group1-2-process",
        "battle-group1-process",
        "battle-group1-pre-process",
        "player1",
        "player2",
        "tricks",
        "tricks_for_group2",
        "award",
      ];

      const status = {};
      criticalDbs.forEach((dbName) => {
        status[dbName] = dbManager.exists(dbName);
      });

      // 包含测试数据库状态
      status[TEST_DB_NAME] = dbManager.exists(TEST_DB_NAME);

      res.status(200).json({
        success: true,
        operation: "status",
        databases: status,
      });
    } catch (error) {
      serverLog(`获取测试状态失败: ${error.message}`, "error");
      res.status(500).json({
        success: false,
        operation: "status",
        error: error.message,
      });
    }
  });

  serverLog("测试API路由已设置完成");
}

module.exports = setupTestRoutes;
