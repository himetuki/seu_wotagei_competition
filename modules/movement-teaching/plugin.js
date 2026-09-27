/**
 * movement-teaching 后端插件（P4 迁移）—— 原 server/routes.js + server/db.js 纯搬运包壳
 *
 * 挂载语义：由 server/cordis/loader.js 按装配清单挂载（P5a 起 cordis 为唯一装配路径）。
 * 路由注册在 apply 同步窗口内完成（ctx.server.route 约束）。
 */
const path = require("path");

module.exports = {
  name: "movement-teaching",
  inject: ["db", "server", "modules"],
  apply(ctx) {
    // ---- 原 modules/movement-teaching/server/db.js 原样迁入 ----
    ctx.db.define([
      {
        name: "game_2_process",
        defaultValue: {
          currentTrick: null,
          isPlaying: false,
          startTime: null,
          endTime: null,
          elapsedTime: 0,
          lastUpdate: null,
        },
      },
      {
        name: "game_2_settings",
        defaultValue: {
          beatsPerMinute: 120,
        },
      },
      {
        name: "movement_partys",
        defaultValue: {
          records: [],
          lastUpdate: null,
        },
      },
    ]);

    // ---- 原 modules/movement-teaching/server/routes.js 回调整体迁入 ----
    ctx.server.route((app, { dbManager, serverLog, dataDir }) => {
      function getDB(name) {
        try {
          return dbManager.get(name);
        } catch (error) {
          serverLog(`获取数据库[${name}]失败: ${error.message}`, "error");
          throw error;
        }
      }

      // 体态传技游戏技能文件路径（resource/json/tricks_for_game.json，与数据目录一致）
      const tricksFilePath = path.join(dataDir, "tricks_for_game.json");

      // ========== 体态传技游戏进度 ==========
      app.get("/api/game_2_process", (req, res) => {
        try {
          const data = getDB("game_2_process").getState();
          res.json(data);
        } catch (error) {
          serverLog("获取体态传技游戏进度失败: " + error.message, "error");
          res.status(500).send(`Error: ${error.message}`);
        }
      });

      app.post("/api/game_2_process", (req, res) => {
        try {
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

      app.post("/api/clear-game_2_process", (req, res) => {
        try {
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

      // ========== 体态传技游戏技能数据 ==========
      app.get("/api/tricks_for_game", (req, res) => {
        try {
          if (require("fs").existsSync(tricksFilePath)) {
            const data = JSON.parse(require("fs").readFileSync(tricksFilePath, "utf8"));
            res.json(data);
          } else {
            res.status(404).send("tricks_for_game.json 文件不存在");
          }
        } catch (error) {
          serverLog("获取体态传技游戏技能数据失败: " + error.message, "error");
          res.status(500).send(`Error: ${error.message}`);
        }
      });

      app.post("/api/tricks_for_game", (req, res) => {
        try {
          if (!req.body || !Array.isArray(req.body)) {
            return res.status(400).send("无效的技能数据格式");
          }
          // 名称为字符串并钳长（防超长串经设置页回流渲染）；条目数封顶防文件膨胀
          const validData = req.body
            .filter((item) => item && typeof item.name === "string" && item.name)
            .slice(0, 500)
            .map((item) => ({ name: item.name.slice(0, 100) }));
          // 写 LF + 末尾换行：仓库 blob 即 LF（工作区 CRLF 只是 autocrlf 检出转换），
          // 写 LF 在任何 autocrlf 配置下都不会制造整文件 EOL diff
          const tricksJson = JSON.stringify(validData, null, 2) + "\n";
          require("fs").writeFileSync(tricksFilePath, tricksJson);
          serverLog("已更新体态传技游戏技能数据");
          res.status(200).send("更新成功");
        } catch (error) {
          serverLog("更新体态传技游戏技能数据失败: " + error.message, "error");
          res.status(500).send(`Error: ${error.message}`);
        }
      });

      // ========== 体态传技游戏设置 ==========
      app.get("/api/game_2_settings", (req, res) => {
        try {
          const data = getDB("game_2_settings").getState();
          serverLog("获取体态传技游戏设置成功");
          res.json(data);
        } catch (error) {
          serverLog("获取体态传技游戏设置失败: " + error.message, "error");
          res.status(500).send(`Error: ${error.message}`);
        }
      });

      app.post("/api/game_2_settings", (req, res) => {
        try {
          serverLog("收到体态传技游戏设置: " + JSON.stringify(req.body));
          getDB("game_2_settings").setState(req.body).write();
          serverLog("已保存体态传技游戏设置");
          res.status(200).send("保存成功");
        } catch (error) {
          serverLog("保存体态传技游戏设置失败: " + error.message, "error");
          res.status(500).send(`Error: ${error.message}`);
        }
      });

      // ========== 体态传技游戏记录 ==========
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

      app.post("/api/movement-partys", (req, res) => {
        try {
          serverLog("收到新的体态传技游戏记录: " + JSON.stringify(req.body));

          const db = getDB("movement_partys");
          const currentData = db.getState();
          const records = currentData.records || [];

          // ★ 入库前白名单整形（审计修复）：此处曾把 req.body 原样 push——局域网任意
          //   客户端可把任意 JSON（超长串 / HTML 载荷）写进存档，记录页渲染即成存储型
          //   XSS。字段与游戏页 recordData 逐一对应，长度钳制防存档膨胀。
          const src = req.body && typeof req.body === "object" ? req.body : {};
          const clampStr = (v, cap) =>
            typeof v === "string" ? v.slice(0, cap) : "";
          const record = {
            id: Number(src.id) || Date.now(),
            teamName: clampStr(src.teamName, 100),
            trickName: clampStr(src.trickName, 200),
            duration: Number(src.duration) || 0,
            isGuessCorrect: !!src.isGuessCorrect,
            date:
              typeof src.date === "string"
                ? src.date.slice(0, 40)
                : new Date().toISOString(),
          };

          const existingIndex = records.findIndex(
            (item) => item.id === record.id
          );

          if (existingIndex !== -1) {
            records[existingIndex] = record;
            serverLog(`更新已有记录 ID: ${record.id}`);
          } else {
            records.push(record);
            serverLog(`添加新记录 ID: ${record.id}`);
          }

          db.setState({
            records: records,
            lastUpdate: new Date().toISOString(),
          }).write();

          serverLog("体态传技游戏记录已保存");
          res.status(200).json({
            success: true,
            message: "记录已保存",
            data: record,
          });
        } catch (error) {
          serverLog("保存体态传技游戏记录失败: " + error.message, "error");
          res.status(500).json({
            success: false,
            message: `保存失败: ${error.message}`,
          });
        }
      });

      app.delete("/api/movement-partys/:id", (req, res) => {
        try {
          const id = parseInt(req.params.id, 10) || req.params.id;
          serverLog(`尝试删除体态传技游戏记录 ID: ${id}`);

          const db = getDB("movement_partys");
          const currentData = db.getState();
          const records = currentData.records || [];

          const recordIndex = records.findIndex((record) => record.id == id);

          if (recordIndex === -1) {
            serverLog(`未找到ID为${id}的记录`, "warning");
            return res.status(404).json({
              success: false,
              message: `未找到ID为${id}的记录`,
            });
          }

          records.splice(recordIndex, 1);

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

      app.post("/api/clear-movement-partys", (req, res) => {
        try {
          serverLog("尝试清空所有体态传技游戏记录");

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

      serverLog("movement-teaching 模块路由已设置完成");
    });

    // ---- 元数据（原 modules/modules.json 条目，随迁移移至插件注册） ----
    ctx.modules.registerPage({
      id: "movement-teaching",
      name: "体态传技",
      description: "不用手来传达技的信息",
      icon: "hand-stop",
      nav: ["games"],
      order: 2,
    });
    ctx.effect(() => () => ctx.modules.unregister("movement-teaching"));
  },
};
