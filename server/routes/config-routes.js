/**
 * 配置数据API路由模块
 */
const { dbManager } = require("../database");

// 设置配置数据API路由
function setupConfigRoutes(app) {
  // Player1 数据API
  app.get("/api/player1", (req, res) => {
    try {
      const data = dbManager.get("player1").getState();
      res.json(data);
    } catch (error) {
      console.error("获取player1数据失败:", error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.post("/api/player1", (req, res) => {
    try {
      if (!req.body || !Array.isArray(req.body)) {
        return res.status(400).json({ error: "无效的player1数据" });
      }
      dbManager.get("player1").setState(req.body).write();
      console.log("player1数据已更新");
      res.status(200).json({ message: "player1数据更新成功" });
    } catch (error) {
      console.error("更新player1数据失败:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Player2 数据API
  app.get("/api/player2", (req, res) => {
    try {
      const data = dbManager.get("player2").getState();
      res.json(data);
    } catch (error) {
      console.error("获取player2数据失败:", error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.post("/api/player2", (req, res) => {
    try {
      if (!req.body || !Array.isArray(req.body)) {
        return res.status(400).json({ error: "无效的player2数据" });
      }
      dbManager.get("player2").setState(req.body).write();
      console.log("player2数据已更新");
      res.status(200).json({ message: "player2数据更新成功" });
    } catch (error) {
      console.error("更新player2数据失败:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Tricks 数据API
  app.get("/api/tricks", (req, res) => {
    try {
      const data = dbManager.get("tricks").getState();
      res.json(data);
    } catch (error) {
      console.error("获取tricks数据失败:", error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.post("/api/tricks", (req, res) => {
    try {
      if (!req.body || !Array.isArray(req.body)) {
        return res.status(400).json({ error: "无效的tricks数据" });
      }
      dbManager.get("tricks").setState(req.body).write();
      console.log("tricks数据已更新");
      res.status(200).json({ message: "tricks数据更新成功" });
    } catch (error) {
      console.error("更新tricks数据失败:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Tricks for Group2 数据API
  app.get("/api/tricks_for_group2", (req, res) => {
    try {
      const data = dbManager.get("tricks_for_group2").getState();
      res.json(data);
    } catch (error) {
      console.error("获取tricks_for_group2数据失败:", error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.post("/api/tricks_for_group2", (req, res) => {
    try {
      if (!req.body || !Array.isArray(req.body)) {
        return res.status(400).json({ error: "无效的tricks_for_group2数据" });
      }
      dbManager.get("tricks_for_group2").setState(req.body).write();
      console.log("tricks_for_group2数据已更新");
      res.status(200).json({ message: "tricks_for_group2数据更新成功" });
    } catch (error) {
      console.error("更新tricks_for_group2数据失败:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Award 数据API
  app.get("/api/award", (req, res) => {
    try {
      const data = dbManager.get("award").getState();
      res.json(data);
    } catch (error) {
      console.error("获取award数据失败:", error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  app.post("/api/award", (req, res) => {
    try {
      if (!req.body || typeof req.body !== "object") {
        return res.status(400).json({ error: "无效的award数据" });
      }
      dbManager.get("award").setState(req.body).write();
      console.log("award数据已更新");
      res.status(200).json({ message: "award数据更新成功" });
    } catch (error) {
      console.error("更新award数据失败:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Battle Process相关API
  app.post("/api/reset-battle-process", (req, res) => {
    try {
      const { chapter, confirm } = req.body;

      if (!confirm) {
        return res.status(400).send("操作未确认");
      }

      let db;
      if (chapter === 1) {
        db = dbManager.get("battle-group1-process");
      } else if (chapter === 2) {
        db = dbManager.get("battle-group1-2-process");
      } else {
        return res.status(400).send("无效的章节");
      }

      const defaultState = {
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
        chapter: chapter,
        lastUpdate: new Date().toISOString(),
      };

      db.setState(defaultState).write();
      console.log(`已重置章节${chapter}的battle-process数据`);
      res.status(200).send("重置成功");
    } catch (error) {
      console.error("重置battle-process失败:", error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 更新选手数据
  app.post("/api/update-battle-group1-2-players", (req, res) => {
    try {
      const { players } = req.body;

      if (!players || !Array.isArray(players)) {
        return res.status(400).send("无效的选手数据");
      }

      const currentState = dbManager.get("battle-group1-2-process").getState();
      currentState.players = players;

      // ★ 缺陷修复（战绩刷新归零）：原实现无条件用全 0 的 playerStats 覆盖存档，
      //   而页面每次加载都会经 loadPlayers() 调本端点（winners 缺省补位/默认选手两条路径），
      //   导致"刷新页面 = 胜/负统计清零"。改为**合并保留**：
      //   · 名单里已存在的选手 → 沿用其既有 wins/losses（仅做数值归一）
      //   · 名单里新增的选手   → 补 { wins: 0, losses: 0 }
      //   · 存档里其他选手的条目 → 原样保留（历史战绩不因名单变化丢失）
      const prevStats =
        currentState.playerStats && typeof currentState.playerStats === "object"
          ? currentState.playerStats
          : {};
      const playerStats = { ...prevStats };
      players.forEach((player) => {
        const name = player && player.name;
        if (name === undefined || name === null) return;
        const prev = playerStats[name];
        playerStats[name] =
          prev && typeof prev === "object"
            ? { wins: Number(prev.wins) || 0, losses: Number(prev.losses) || 0 }
            : { wins: 0, losses: 0 };
      });
      currentState.playerStats = playerStats;
      currentState.lastUpdate = new Date().toISOString();

      dbManager.get("battle-group1-2-process").setState(currentState).write();
      console.log("成功更新battle-group1-2-process.json中的选手数据");
      res.status(200).send("更新成功");
    } catch (error) {
      console.error("更新battle-group1-2-players失败:", error);
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  console.log("配置数据API路由已设置完成");
}

module.exports = setupConfigRoutes;
