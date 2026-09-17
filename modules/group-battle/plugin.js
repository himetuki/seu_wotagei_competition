/**
 * group-battle 后端插件（P3c）—— 原 server/routes.js + server/db.js 纯搬运包壳
 *
 * 挂载语义：由 server/cordis/loader.js 按装配清单挂载（P5a 起 cordis 为唯一装配路径）。
 * 路由注册在 apply 同步窗口内完成（ctx.server.route 约束）。
 */
module.exports = {
  name: "group-battle",
  inject: ["db", "server", "modules"],
  apply(ctx) {
    // ---- 原 modules/group-battle/server/db.js 原样迁入 ----
    ctx.db.define([
      {
        name: "group-battle-process",
        defaultValue: {
          currentState: null,
          lastUpdate: new Date().toISOString(),
        },
      },
    ]);

    // ---- 原 modules/group-battle/server/routes.js 回调整体迁入 ----
    ctx.server.route((app, { dbManager, serverLog }) => {
      function getDB(name) {
        try {
          return dbManager.get(name);
        } catch (error) {
          serverLog(`获取数据库[${name}]失败: ${error.message}`, "error");
          throw error;
        }
      }

      app.post("/api/group-battle-process", (req, res) => {
        try {
          serverLog(
            "收到 group-battle 进度数据: " +
              JSON.stringify(req.body).substring(0, 100) +
              "..."
          );
          getDB("group-battle-process")
            .set("currentState", req.body)
            .set("lastUpdate", new Date().toISOString())
            .write();
          serverLog("成功保存 group-battle 进度数据");
          res.status(200).send("保存成功");
        } catch (error) {
          serverLog("保存 group-battle 进度失败: " + error.message, "error");
          res.status(500).send("Error: " + error.message);
        }
      });

      app.get("/api/group-battle-process", (req, res) => {
        try {
          const data = getDB("group-battle-process").getState();
          res.json(data);
        } catch (error) {
          serverLog("获取 group-battle 进度失败: " + error.message, "error");
          res.status(500).send("Error: " + error.message);
        }
      });

      app.post("/api/clear-group-battle-process", (req, res) => {
        try {
          getDB("group-battle-process")
            .setState({
              currentState: null,
              lastUpdate: new Date().toISOString(),
            })
            .write();
          serverLog("已清除 group-battle 进度数据");
          res.status(200).send("清除成功");
        } catch (error) {
          serverLog("清除 group-battle 进度失败: " + error.message, "error");
          res.status(500).send("Error: " + error.message);
        }
      });

      serverLog("group-battle 模块路由已设置完成");
    });

    // ---- 元数据（原 modules/modules.json 条目，随迁移移至插件注册） ----
    ctx.modules.registerPage({
      id: "group-battle",
      name: "Team（团体赛）",
      description: "3人团体赛",
      icon: "handshake",
      nav: ["select"],
      order: 14,
    });
    ctx.effect(() => () => ctx.modules.unregister("group-battle"));
  },
};
