/**
 * battle-group1-2 后端插件（P4）—— 原 server/routes.js + server/db.js 纯搬运包壳
 *
 * 挂载语义：由 server/cordis/loader.js 按装配清单挂载（P5a 起 cordis 为唯一装配路径）。
 * 路由注册在 apply 同步窗口内完成（ctx.server.route 约束）。
 */
module.exports = {
  name: "battle-group1-2",
  inject: ["db", "server", "modules"],
  apply(ctx) {
    // ---- 原 modules/battle-group1-2/server/db.js 原样迁入 ----
    ctx.db.define([
      {
        name: "battle-group1-2-process",
        defaultValue: {
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
        },
      },
    ]);

    // ---- 原 modules/battle-group1-2/server/routes.js 回调整体迁入 ----
    ctx.server.route((app, { dbManager, serverLog }) => {
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

      // ---- P13 自 server/routes/config-routes.js 迁入（原共享路由 → 本插件功能件） ----

      // 重置章节 battle-process（chapter=1 → battle-group1-process；chapter=2 → 本插件库）
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

      // 更新选手数据（P12 审计修复的"合并保留"语义随迁移原样保留）
      app.post("/api/update-battle-group1-2-players", (req, res) => {
        try {
          const { players } = req.body;

          if (!players || !Array.isArray(players)) {
            return res.status(400).send("无效的选手数据");
          }

          const currentState = dbManager
            .get("battle-group1-2-process")
            .getState();
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

      serverLog("battle-group1-2 模块路由已设置完成");
    });

    // ---- 元数据（原 modules/modules.json 条目，随迁移移至插件注册） ----
    ctx.modules.registerPage({
      id: "battle-group1-2",
      name: "一年加组第二章",
      description: "一年加组第二章节",
      icon: "target-arrow",
      nav: ["select"],
      order: 11,
    });
    ctx.effect(() => () => ctx.modules.unregister("battle-group1-2"));
  },
};
