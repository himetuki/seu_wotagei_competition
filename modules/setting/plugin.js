/**
 * modules/setting 后端插件（P3b 迁移 + P13 功能件扩容）
 *
 * 职责 = 页面元数据注册 + 配置数据 API（原 server/routes/config-routes.js 迁入）：
 *   /api/player1|player2|tricks|tricks_for_group2|award 的 GET/POST（10 端点）——
 *   正是本页三列表编辑器（选手/技能/奖项）的读写端点，页面与数据 API 同插件自包含。
 * 元数据原样迁自 modules/modules.json 中 setting 条目（route 由 ctx.modules.list() 投影自动补）。
 * P5a：legacy 双路径已移除，本插件是唯一后端装配入口。
 * 路由注册在 apply 同步窗口内完成（ctx.server.route 约束）。
 */
module.exports = {
  name: "setting",
  inject: ["modules", "server"],
  apply(ctx) {
    ctx.modules.registerPage({
      id: "setting",
      name: "设置",
      description: "选手/技能/奖励/音乐管理",
      icon: "settings",
      nav: ["index", "select"],
      order: 2,
    });

    // ---- 原 server/routes/config-routes.js 的配置数据 API 整体迁入（行为逐字节一致） ----
    ctx.server.route((app, { dbManager }) => {
      /** 通用 GET：读 dbManager 列表原样返回（原 config-routes 五连 GET 的同构实现） */
      function getConfig(name) {
        app.get(`/api/${name}`, (req, res) => {
          try {
            const data = dbManager.get(name).getState();
            res.json(data);
          } catch (error) {
            console.error(`获取${name}数据失败:`, error);
            res.status(500).send(`Error: ${error.message}`);
          }
        });
      }

      /** 通用 POST：校验数组后整包写入（award 为对象形态，单独注册） */
      function postConfigArray(name) {
        app.post(`/api/${name}`, (req, res) => {
          try {
            if (!req.body || !Array.isArray(req.body)) {
              return res.status(400).json({ error: `无效的${name}数据` });
            }
            dbManager.get(name).setState(req.body).write();
            console.log(`${name}数据已更新`);
            res.status(200).json({ message: `${name}数据更新成功` });
          } catch (error) {
            console.error(`更新${name}数据失败:`, error);
            res.status(500).json({ error: error.message });
          }
        });
      }

      // Player1 / Player2 / Tricks / Tricks for Group2（数组形态）
      ["player1", "player2", "tricks", "tricks_for_group2"].forEach((name) => {
        getConfig(name);
        postConfigArray(name);
      });

      // Award（对象形态）
      getConfig("award");
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
    });

    ctx.effect(() => () => ctx.modules.unregister("setting"));
  },
};
