/**
 * battle-group1 模块后端路由
 * 从原 server/routes/game-routes.js 的 battle-group1 段落迁移而来
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

  // ========== Battle Group 1 进度 API ==========
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

  // ========== Battle Group 1 Pre-process API ==========
  app.post("/api/battle-group1-pre-process", (req, res) => {
    try {
      serverLog(
        "收到 battle-group1-pre 进度数据: " +
          JSON.stringify(req.body).substring(0, 100) +
          "..."
      );
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
      const data = getDB("battle-group1-pre-process").getState();
      res.json(data);
    } catch (error) {
      serverLog("获取 battle-group1-pre 进度失败: " + error.message, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.post("/api/clear-battle-group1-pre-process", (req, res) => {
    try {
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

  serverLog("battle-group1 模块路由已设置完成");
};