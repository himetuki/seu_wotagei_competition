/**
 * battle-group1 后端插件（P4）—— 原 server/routes.js + server/db.js 纯搬运包壳
 *
 * 挂载语义：由 server/cordis/loader.js 按装配清单挂载（P5a 起 cordis 为唯一装配路径）。
 * 路由注册在 apply 同步窗口内完成（ctx.server.route 约束）。
 */
module.exports = {
  name: "battle-group1",
  inject: ["db", "server", "modules"],
  apply(ctx) {
    // ---- 原 modules/battle-group1/server/db.js 原样迁入 ----
    ctx.db.define([
      {
        name: "battle-group1-process",
        defaultValue: {
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
        },
      },
      {
        name: "battle-group1-pre-process",
        defaultValue: {
          players: [],
          currentIndex: 0,
          currentTrick: "",
          currentMusic: "",
          crossedTricks: [],
        },
      },
    ]);

    // ---- 原 modules/battle-group1/server/routes.js 回调整体迁入 ----
    ctx.server.route((app, { dbManager, serverLog }) => {
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
    });

    // ---- 元数据（原 modules/modules.json 条目，随迁移移至插件注册） ----
    ctx.modules.registerPage({
      id: "battle-group1",
      name: "Prof（一年加组）",
      description: "一年加组章节赛",
      icon: "medal",
      nav: ["select"],
      order: 10,
    });
    ctx.effect(() => () => ctx.modules.unregister("battle-group1"));
  },
};
