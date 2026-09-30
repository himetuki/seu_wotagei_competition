/**
 * modules/plugin-manager 后端插件（P4）—— 装配管理体验的 HTTP 出口（规格 §5）
 *
 * 本插件自身也是"插件化"示范：管理面 = 一对普通插件（本文件 + front/plugin.js），
 * 不含任何特权代码 —— 装配控制全部经内置 assembly 服务（loader 在挂载业务插件前
 * provide），不可绕过清单直接改路由。
 *
 * 清单元数据富化（本文件唯一的 fs 读）：assembly.status() 的条目投影只含
 * {id,name,icon,enabled,kind}；管理页显示所需的中文名 label 与主题组声明 group
 * 存放在装配清单条目上（front.json / plugins.json，可选字段、缺省回退 id），
 * 这里按 target 读清单原文件补进快照。读取失败仅告警并返回原始快照（降级不崩）。
 * 路径解析与 server/paths.cjs 的 dev/portable 双模式口径一致（本地最小实现，
 * 不 import paths.cjs——便携形态下它在 bundle 内，外置插件无法按路径 require）。
 *
 * API（前缀 /api/plugins，全部 JSON 响应）：
 *   GET  /api/plugins                  装配快照（后端全部条目 + front.json 前端条目，含 label/group）
 *   POST /api/plugins/:id/toggle       { enabled } 热启用/禁用（禁用 = 排空 + await dispose → 路由物理 404）
 *   POST /api/plugins/:id/reload       热替换（K11 逐出 + K2 先卸后挂；真实文件，改盘即生效）
 *   GET  /api/plugins/:id/config       读清单条目 config
 *   POST /api/plugins/:id/config       { config } 写回并热重装该插件（null 清除）
 *   POST /api/plugins/front/:id/toggle { enabled } 前端清单开关（刷新页面后生效）
 *
 * 每次变更成功后 ctx.emit("plugins.updated", snapshot)。
 * 自保护：manager 自身的 fiber 承载着请求所在 route scope，禁用/热重载/热改 config
 * 都意味着"先卸后挂"自己在途请求的 scope（K2/K6 竞态），一律 400 拒绝。
 */
const fs = require("fs");
const path = require("path");

// 清单定位：便携（Y_STAGE_PLUGINS_DIR 注入）= 两清单同目录；dev = server/ 与 web/
const PLUGINS_DIR = process.env.Y_STAGE_PLUGINS_DIR
  || path.resolve(__dirname, "..", "..", "server");
const BACKEND_MANIFEST = path.join(PLUGINS_DIR, "plugins.json");
const FRONT_MANIFEST = process.env.Y_STAGE_PLUGINS_DIR
  ? path.join(PLUGINS_DIR, "front.json")
  : path.resolve(__dirname, "..", "..", "web", "front.json");

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return null;
  }
}

/** 清单条目按 target 建 id → {label, group} 映射（无声明条目不产生键） */
function metaByTarget(manifest) {
  const map = {};
  const plugins = manifest && Array.isArray(manifest.plugins) ? manifest.plugins : [];
  for (const p of plugins) {
    if (!p || typeof p.target !== "string") continue;
    const id = p.target.replace(/^modules\//, "");
    const meta = {};
    if (typeof p.label === "string" && p.label) meta.label = p.label;
    if (p.group && typeof p.group === "object" && !Array.isArray(p.group)) meta.group = p.group;
    if (Object.keys(meta).length) map[id] = meta;
  }
  return map;
}

/** 快照富化：给 front/backend 条目补 label/group（幂等；失败返回原快照） */
function enrichSnapshot(snap) {
  try {
    const frontMeta = metaByTarget(readJsonSafe(FRONT_MANIFEST));
    const backendMeta = metaByTarget(readJsonSafe(BACKEND_MANIFEST));
    for (const f of snap.front || []) {
      const m = frontMeta[f.id];
      if (!m) continue;
      if (m.label) f.label = m.label;
      if (m.group) f.group = m.group;
    }
    for (const b of snap.backend || []) {
      const m = backendMeta[b.id];
      if (m && m.label) b.label = m.label;
    }
  } catch (e) {
    console.error("[plugin-manager] 清单元数据富化失败（返回原始快照）:", e.message);
  }
  return snap;
}

module.exports = {
  name: "plugin-manager",
  inject: ["assembly", "server", "modules"],
  apply(ctx) {
    const SELF = "plugin-manager";

    ctx.modules.registerPage({
      id: SELF,
      name: "插件管理",
      description: "插件装配管理与热替换",
      icon: "puzzle",
      nav: ["index"],
      order: 5,
    });

    // 统一响应：成功后广播快照（异步服务错误兜底 500，不让 y-router 落到文本 404/500）
    const respond = (res, promise) => {
      promise
        .then((r) => {
          if (r && r.ok) ctx.emit("plugins.updated", ctx.assembly.status());
          res.json(r);
        })
        .catch((e) => res.status(500).json({ ok: false, error: e.message }));
    };

    ctx.server.route((app) => {
      app.get("/api/plugins", (req, res) => {
        res.json(enrichSnapshot(ctx.assembly.status()));
      });

      // 前端清单开关（路径段数与 :id 路由不同，无匹配冲突）
      app.post("/api/plugins/front/:id/toggle", (req, res) => {
        respond(res, ctx.assembly.toggleFront(req.params.id, !!(req.body && req.body.enabled)));
      });

      app.post("/api/plugins/:id/toggle", (req, res) => {
        const id = req.params.id;
        if (id === SELF && !(req.body && req.body.enabled)) {
          return res.status(400).json({ ok: false, error: "不能禁用插件管理器自身（自保护）" });
        }
        respond(res, ctx.assembly.toggle(id, !!(req.body && req.body.enabled)));
      });

      app.post("/api/plugins/:id/reload", (req, res) => {
        const id = req.params.id;
        if (id === SELF) {
          return res.status(400).json({
            ok: false,
            error: "管理器不支持热重载自身（会拆除请求所在的 scope），请重启服务",
          });
        }
        respond(res, ctx.assembly.reload(id));
      });

      app.get("/api/plugins/:id/config", (req, res) => {
        const item = ctx.assembly.status().backend.find((b) => b.id === req.params.id);
        if (!item) {
          return res.status(404).json({ ok: false, error: `清单中不存在插件 ${req.params.id}` });
        }
        res.json({ ok: true, id: item.id, config: item.config });
      });

      app.post("/api/plugins/:id/config", (req, res) => {
        const id = req.params.id;
        if (id === SELF) {
          return res.status(400).json({
            ok: false,
            error: "管理器自身不接受 config 热更（重挂会拆除自身 scope）",
          });
        }
        if (!req.body || !("config" in req.body)) {
          return res.status(400).json({
            ok: false,
            error: '需要 JSON body { "config": ... }（config 传 null 清除）',
          });
        }
        respond(res, ctx.assembly.setConfig(id, req.body.config));
      });
    });

    ctx.effect(() => () => ctx.modules.unregister(SELF));
  },
};
