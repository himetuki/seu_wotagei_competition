/**
 * 游戏数据API路由模块
 */
const { dbManager } = require("../database");
const { serverLog } = require("../utils");
const path = require("path");
const fs = require("fs");

// 获取数据库实例 - 优化错误处理
function getDB(name) {
  try {
    return dbManager.get(name);
  } catch (error) {
    serverLog(`获取数据库[${name}]失败: ${error.message}`, "error");
    throw error;
  }
}

// 设置游戏数据API路由
function setupGameRoutes(app) {
  // Battle Group 2相关API
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

  // Battle Group 1-2相关API
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

  // Battle Group 1相关API
  app.post("/api/battle-group1-process", (req, res) => {
    try {
      serverLog(
        "收到 battle-group1 进度数据: " +
          JSON.stringify(req.body).substring(0, 100) +
          "..."
      );
      const dbState = getDB("battle-group1-process").getState();
      const battleRecords = dbState.battleRecords || [];

      const battleRecord = {
        timestamp: new Date().toISOString(),
        chapter: req.body.currentChapter,
        round: req.body.currentRound,
        players: {
          player1: req.body.currentPlayers?.player1 || "",
          player2: req.body.currentPlayers?.player2 || "",
        },
        tricks: {
          player1: req.body.selectedPlayer1Trick,
          player2: req.body.selectedPlayer2Trick,
        },
        winner: req.body.currentWinner,
        participatedPlayers: [...req.body.participatedPlayers],
        chapterWinners: [...req.body.chapterWinners],
      };

      const existingIndex = battleRecords.findIndex(
        (record) =>
          record.chapter === battleRecord.chapter &&
          record.round === battleRecord.round
      );

      let updatedRecords;
      if (existingIndex !== -1) {
        updatedRecords = [...battleRecords];
        updatedRecords[existingIndex] = battleRecord;
      } else {
        updatedRecords = [...battleRecords, battleRecord];
      }

      getDB("battle-group1-process")
        .set("currentState", req.body)
        .set("battleRecords", updatedRecords)
        .set("lastUpdate", new Date().toISOString())
        .write();

      serverLog("成功保存 battle-group1 进度数据");
      res.status(200).send("保存成功");
    } catch (error) {
      serverLog("保存 battle-group1 进度失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.get("/api/battle-group1-process", (req, res) => {
    try {
      const data = getDB("battle-group1-process").getState();
      res.json(data);
    } catch (error) {
      serverLog("获取 battle-group1 进度失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.post("/api/clear-battle-group1-process", (req, res) => {
    try {
      getDB("battle-group1-process")
        .setState({
          currentState: {
            currentChapter: 1,
            currentRound: 1,
            participatedPlayers: [],
            chapterWinners: [],
            players: [],
            currentWinner: null,
            currentPlayers: {
              player1: "",
              player2: "",
            },
            selectedTricks: {
              player1: null,
              player2: null,
            },
          },
          battleRecords: [],
          lastUpdate: new Date().toISOString(),
        })
        .write();
      serverLog("已清除 battle-group1 进度数据");
      res.status(200).send("清除成功");
    } catch (error) {
      serverLog("清除 battle-group1 进度失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // Battle Group 2-2进度API
  app.post("/api/battle-group2-2-process", (req, res) => {
    try {
      serverLog(
        "收到 battle-group2-2 进度数据: " +
          JSON.stringify(req.body).substring(0, 100) +
          "..."
      );
      // 修复：直接使用getDB函数获取数据库实例
      getDB("battle-group2-2-process").setState(req.body).write();
      serverLog("成功保存 battle-group2-2 进度数据");
      res.status(200).send("保存成功");
    } catch (error) {
      serverLog("保存 battle-group2-2 进度失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.get("/api/battle-group2-2-process", (req, res) => {
    try {
      // 修复：使用getDB函数获取数据库实例
      const data = getDB("battle-group2-2-process").getState();
      res.json(data);
    } catch (error) {
      serverLog("获取 battle-group2-2 进度失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.post("/api/clear-battle-group2-2-process", (req, res) => {
    try {
      // 修复：使用getDB函数获取数据库实例
      getDB("battle-group2-2-process")
        .setState({
          players: [],
          currentIndex: 0,
          currentTrick: "",
          currentMusic: "",
          crossedTricks: [],
        })
        .write();
      serverLog("已清除 battle-group2-2 进度数据");
      res.status(200).send("清除成功");
    } catch (error) {
      serverLog("清除 battle-group2-2 进度失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // Battle Group 1 Pre-process API
  app.post("/api/battle-group1-pre-process", (req, res) => {
    try {
      serverLog(
        "收到 battle-group1-pre 进度数据: " +
          JSON.stringify(req.body).substring(0, 100) +
          "..."
      );
      // 修复：使用getDB函数获取数据库实例
      getDB("battle-group1-pre-process").setState(req.body).write();
      serverLog("成功保存 battle-group1-pre 进度数据");
      res.status(200).send("保存成功");
    } catch (error) {
      serverLog("保存 battle-group1-pre 进度失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.get("/api/battle-group1-pre-process", (req, res) => {
    try {
      // 修复：使用getDB函数获取数据库实例
      const data = getDB("battle-group1-pre-process").getState();
      res.json(data);
    } catch (error) {
      serverLog("获取 battle-group1-pre 进度失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.post("/api/clear-battle-group1-pre-process", (req, res) => {
    try {
      // 修复：使用getDB函数获取数据库实例
      getDB("battle-group1-pre-process")
        .setState({
          players: [],
          currentIndex: 0,
          currentTrick: "",
          currentMusic: "",
          crossedTricks: [],
        })
        .write();
      serverLog("已清除 battle-group1-pre 进度数据");
      res.status(200).send("清除成功");
    } catch (error) {
      serverLog("清除 battle-group1-pre 进度失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 获取体态传技游戏进度
  app.get("/api/game_2_process", (req, res) => {
    try {
      // 修复：使用getDB函数获取数据库实例
      const data = getDB("game_2_process").getState();
      res.json(data);
    } catch (error) {
      serverLog("获取体态传技游戏进度失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 更新体态传技游戏进度
  app.post("/api/game_2_process", (req, res) => {
    try {
      // 修复：使用getDB函数获取数据库实例
      getDB("game_2_process")
        .setState({
          currentTrick: req.body.currentTrick,
          isPlaying: req.body.isPlaying,
          startTime: req.body.startTime,
          endTime: req.body.endTime,
          elapsedTime: req.body.elapsedTime,
          lastUpdate: req.body.lastUpdate || new Date().toISOString(),
        })
        .write();
      serverLog("已更新体态传技游戏进度数据");
      res.status(200).send("更新成功");
    } catch (error) {
      serverLog("更新体态传技游戏进度失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 清除体态传技游戏进度
  app.post("/api/clear-game_2_process", (req, res) => {
    try {
      // 修复：使用getDB函数获取数据库实例
      getDB("game_2_process")
        .setState({
          currentTrick: null,
          isPlaying: false,
          startTime: null,
          endTime: null,
          elapsedTime: 0,
          lastUpdate: new Date().toISOString(),
        })
        .write();
      serverLog("已清除体态传技游戏进度数据");
      res.status(200).send("清除成功");
    } catch (error) {
      serverLog("清除体态传技游戏进度失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 获取体态传技游戏技能数据
  app.get("/api/tricks_for_game", (req, res) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const filePath = path.join(
        __dirname,
        "../../resource/json/tricks_for_game.json"
      );

      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        res.json(data);
      } else {
        res.status(404).send("tricks_for_game.json 文件不存在");
      }
    } catch (error) {
      serverLog("获取体态传技游戏技能数据失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 更新体态传技游戏技能数据
  app.post("/api/tricks_for_game", (req, res) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const filePath = path.join(
        __dirname,
        "../../resource/json/tricks_for_game.json"
      );

      // 验证请求数据
      if (!req.body || !Array.isArray(req.body)) {
        return res.status(400).send("无效的技能数据格式");
      }

      // 确保所有项都有名称
      const validData = req.body.filter((item) => item && item.name);

      // 写入文件
      fs.writeFileSync(filePath, JSON.stringify(validData, null, 2));
      serverLog("已更新体态传技游戏技能数据");
      res.status(200).send("更新成功");
    } catch (error) {
      serverLog("更新体态传技游戏技能数据失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 获取体态传技游戏设置
  app.get("/api/game_2_settings", (req, res) => {
    try {
      // 使用getDB函数获取数据库实例
      const data = getDB("game_2_settings").getState();
      serverLog("获取体态传技游戏设置成功");
      res.json(data);
    } catch (error) {
      serverLog("获取体态传技游戏设置失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 更新体态传技游戏设置
  app.post("/api/game_2_settings", (req, res) => {
    try {
      // 使用getDB函数获取数据库实例
      serverLog("收到体态传技游戏设置: " + JSON.stringify(req.body));
      getDB("game_2_settings").setState(req.body).write();
      serverLog("已保存体态传技游戏设置");
      res.status(200).send("保存成功");
    } catch (error) {
      serverLog("保存体态传技游戏设置失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 体态传技游戏记录API
  // 获取所有记录
  app.get("/api/movement-partys", (req, res) => {
    try {
      const data = getDB("movement_partys").getState();
      serverLog("获取体态传技游戏记录成功");
      res.json(data);
    } catch (error) {
      serverLog("获取体态传技游戏记录失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 添加新记录
  app.post("/api/movement-partys", (req, res) => {
    try {
      serverLog("收到新的体态传技游戏记录: " + JSON.stringify(req.body));

      // 获取当前记录集
      const db = getDB("movement_partys");
      const currentData = db.getState();
      const records = currentData.records || [];

      // 检查是否已存在相同ID的记录（避免重复提交）
      const existingIndex = records.findIndex(
        (record) => record.id === req.body.id
      );

      if (existingIndex !== -1) {
        // 更新已有记录
        records[existingIndex] = req.body;
        serverLog(`更新已有记录 ID: ${req.body.id}`);
      } else {
        // 添加新记录
        records.push(req.body);
        serverLog(`添加新记录 ID: ${req.body.id}`);
      }

      // 保存更新后的记录集
      db.setState({
        records: records,
        lastUpdate: new Date().toISOString(),
      }).write();

      serverLog("体态传技游戏记录已保存");
      res.status(200).json({
        success: true,
        message: "记录已保存",
        data: req.body,
      });
    } catch (error) {
      serverLog("保存体态传技游戏记录失败: " + error.message, "error");
      res.status(500).json({
        success: false,
        message: `保存失败: ${error.message}`,
      });
    }
  });

  // 删除单个记录
  app.delete("/api/movement-partys/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10) || req.params.id;
      serverLog(`尝试删除体态传技游戏记录 ID: ${id}`);

      // 获取当前记录
      const db = getDB("movement_partys");
      const currentData = db.getState();
      const records = currentData.records || [];

      // 查找要删除的记录
      const recordIndex = records.findIndex((record) => record.id == id);

      if (recordIndex === -1) {
        serverLog(`未找到ID为${id}的记录`, "warning");
        return res.status(404).json({
          success: false,
          message: `未找到ID为${id}的记录`,
        });
      }

      // 删除记录
      records.splice(recordIndex, 1);

      // 保存更新后的记录集
      db.setState({
        records: records,
        lastUpdate: new Date().toISOString(),
      }).write();

      serverLog(`成功删除体态传技游戏记录 ID: ${id}`);
      res.status(200).json({
        success: true,
        message: "记录已删除",
        deletedId: id,
      });
    } catch (error) {
      serverLog("删除体态传技游戏记录失败: " + error.message, "error");
      res.status(500).json({
        success: false,
        message: `删除失败: ${error.message}`,
      });
    }
  });

  // 清空所有记录
  app.post("/api/clear-movement-partys", (req, res) => {
    try {
      serverLog("尝试清空所有体态传技游戏记录");

      // 重置记录数据
      getDB("movement_partys")
        .setState({
          records: [],
          lastUpdate: new Date().toISOString(),
        })
        .write();

      serverLog("已清空所有体态传技游戏记录");
      res.status(200).json({
        success: true,
        message: "所有记录已清空",
      });
    } catch (error) {
      serverLog("清空体态传技游戏记录失败: " + error.message, "error");
      res.status(500).json({
        success: false,
        message: `清空失败: ${error.message}`,
      });
    }
  });

  serverLog("游戏数据API路由已设置完成");
}

module.exports = setupGameRoutes;
