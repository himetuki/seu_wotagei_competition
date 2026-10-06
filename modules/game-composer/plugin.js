/**
 * game-composer 后端插件（P14 批次 B，P15 批次②增连线）—— 可视化编排编辑器的数据 API
 *
 * 职责：
 *   1) db.define game-composer-layouts（布局清单文档存储，落盘 resource/sqlite/y-stage.sqlite）
 *   2) §2 四条 REST 路由（/api/game-composer/layouts 的 GET/POST + /:id 的 PUT/DELETE）
 *   3) registerPage 页面元数据（与 modules/modules.json 条目逐字段一致）
 *
 * 校验规则（规格 .tmp/p14-layout-spec.md §1 + .tmp/p15-wiring-spec.md §1，违反 → 400 {"error":"..."}）：
 *   - name    非空字符串，trim 后 1..40 字符（存储 trim 后的值）
 *   - items   数组 0..40 项；每项普通对象
 *   - item.component 非空字符串且 /^[a-z][a-z0-9-]*$/，且不得为 Object.prototype
 *     自有属性名（如 "constructor"——全小写能过正则，但会击穿前端按名分组表）
 *   - item.id / item.title / item.props 可缺省；id 给出时须 /^[a-zA-Z][a-zA-Z0-9_-]*$/
 *     且 ≤64 字符、布局内唯一（"[data-slot=<id>]" 不加引号拼接，畸形/重复 id 会
 *     抛选择器 SyntaxError 或多实例挤同一宿主）；props 若给出必须是普通对象（非数组）
 *   - 存储时每项只保留 id/component/title/props 四键（多余键丢弃）
 *   - connections（P15）缺省视为 []（v1 布局完全兼容）；数组 ≤20 项，每项普通对象，
 *     只保留 id/from/out/to/in 五键（多余丢弃）；from/to 非空字符串 ≤64 字符（宽松存储，
 *     不校验实例存在性）；out/in 须 /^[a-zA-Z][a-zA-Z0-9]*$/、≤40 字符且不得为保留名
 *     onReady（连线注入的 api 注册钩子，占用会使该实例数据连线静默失效）；id 可缺省
 *     （后端补 "cn-" + 6 位 hex），给出时不做形态校验（宽松）
 * 请求体解析：POST/PUT 的 body 已由 shim JSON 中间件就位（参照 modules/setting/plugin.js）。
 */
const crypto = require("crypto");

/** 生成布局 id："ly-" + 8 位 hex（规格 §2） */
function newLayoutId() {
  return "ly-" + crypto.randomBytes(4).toString("hex");
}

/** 生成连线 id："cn-" + 6 位 hex（规格 P15 §1） */
function newConnectionId() {
  return "cn-" + crypto.randomBytes(3).toString("hex");
}

/**
 * 校验并清洗 connections（规格 P15 §1）→ { connections } 或 { error }
 * 缺省视为 []（v1 布局兼容）；通过后每项仅保留五键，id 缺省时后端补齐。
 * from/out/to/in 是否与 items 的组件能力匹配不做校验（编辑器引导、运行时降级）。
 */
function validateConnections(raw) {
  const list = raw === undefined ? [] : raw;
  if (!Array.isArray(list)) return { error: "connections 必须为数组" };
  if (list.length > 20) return { error: "connections 不能超过 20 条" };
  const cleaned = [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c || typeof c !== "object" || Array.isArray(c)) {
      return { error: `connections[${i}] 必须为普通对象` };
    }
    for (const key of ["from", "to"]) {
      const v = c[key];
      if (typeof v !== "string" || !v) {
        return { error: `connections[${i}].${key} 必须为非空字符串` };
      }
      if (v.length > 64) {
        return { error: `connections[${i}].${key} 长度不能超过 64 字符` };
      }
    }
    for (const key of ["out", "in"]) {
      const v = c[key];
      if (typeof v !== "string" || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(v)) {
        return { error: `connections[${i}].${key} 必须为字母开头的字母数字标识符` };
      }
      if (v.length > 40) {
        return { error: `connections[${i}].${key} 长度不能超过 40 字符` };
      }
      // 保留名：buildRuntimeProps 用注入的 onReady 回填实例 api 表，
      // 连线占用该口名会让本实例的全部数据连线静默失效
      if (v === "onReady") {
        return { error: `connections[${i}].${key} 不能使用保留名 onReady` };
      }
    }
    cleaned.push({
      // id 给出时宽松保留（非空字符串即可），缺省/空串由后端补齐
      id: typeof c.id === "string" && c.id ? c.id : newConnectionId(),
      from: c.from,
      out: c.out,
      to: c.to,
      in: c.in,
    });
  }
  return { connections: cleaned };
}

/**
 * 校验并清洗 POST/PUT 请求体 → { name, items, connections } 或 { error }
 * items 缺省视为 []（允许空布局存盘）；connections 缺省视为 []（v1 兼容）。
 */
function validateBody(raw) {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  if (typeof body.name !== "string") {
    return { error: "name 必须为字符串" };
  }
  const name = body.name.trim();
  if (name.length < 1) return { error: "name 不能为空" };
  if (name.length > 40) return { error: "name 长度不能超过 40 字符" };

  const items = body.items === undefined ? [] : body.items;
  if (!Array.isArray(items)) return { error: "items 必须为数组" };
  if (items.length > 40) return { error: "items 不能超过 40 项" };

  const cleaned = [];
  const seenIds = new Set(); // 同一布局内 item.id 唯一性校验（重复 id 会挤同一宿主选择器）
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== "object" || Array.isArray(it)) {
      return { error: `items[${i}] 必须为普通对象` };
    }
    if (
      typeof it.component !== "string" ||
      !/^[a-z][a-z0-9-]*$/.test(it.component)
    ) {
      return { error: `items[${i}].component 必须为小写 kebab-case 组件名` };
    }
    // 原型链属性名防线：正则放行全小写原型名（如 "constructor"），会击穿前端两镜像的
    // 按名分组表（Object.prototype 成员 truthy → 初始化被跳过 → 对函数 .push 抛 TypeError）。
    // 镜像侧已改 null 原型表兜底存量，此处按 Object.prototype 自有属性名直接拒绝新建。
    if (Object.hasOwn(Object.prototype, it.component)) {
      return { error: `items[${i}].component 不能使用 Object.prototype 属性名：${it.component}` };
    }
    if (
      it.props !== undefined &&
      (!it.props || typeof it.props !== "object" || Array.isArray(it.props))
    ) {
      return { error: `items[${i}].props 必须为普通对象` };
    }
    // item.id 缺省合法（渲染时跳过该实例）；给出时须为 CSS 标识符形态
    //（选择器 "[data-slot=<id>]" 不加引号拼接，畸形 id 会抛 SyntaxError 或互相串台）
    if (it.id !== undefined) {
      if (
        typeof it.id !== "string" ||
        !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(it.id)
      ) {
        return { error: `items[${i}].id 必须为字母开头的字母数字/连字符/下划线标识符` };
      }
      if (it.id.length > 64) {
        return { error: `items[${i}].id 长度不能超过 64 字符` };
      }
      if (seenIds.has(it.id)) {
        return { error: `items[${i}].id 重复：${it.id}（布局内实例 id 必须唯一）` };
      }
      seenIds.add(it.id);
    }
    cleaned.push({
      ...(typeof it.id === "string" && it.id ? { id: it.id } : {}),
      component: it.component,
      ...(typeof it.title === "string" && it.title ? { title: it.title } : {}),
      ...(it.props !== undefined ? { props: it.props } : {}),
    });
  }
  const vc = validateConnections(body.connections);
  if (vc.error) return { error: vc.error };
  return { name, items: cleaned, connections: vc.connections };
}

module.exports = {
  name: "game-composer",
  inject: ["db", "server", "modules"],
  apply(ctx) {
    // ---- 数据库定义（SQLite 文档存储，落盘 resource/sqlite/y-stage.sqlite） ----
    ctx.db.define([
      { name: "game-composer-layouts", defaultValue: { list: [] } },
    ]);

    // ---- 路由注册（apply 同步窗口内；scope 生命周期 = 本插件 fiber，
    //      管理页停用/卸载时路由被物理移除，立即 404） ----
    ctx.server.route((app, { dbManager }) => {
      /** 读取布局数组（历史数据畸形时回退 []，不抛错） */
      function readList() {
        const state = dbManager.get("game-composer-layouts").getState();
        return state && Array.isArray(state.list) ? state.list : [];
      }

      /** 整包写回布局数组 */
      function writeList(list) {
        dbManager.get("game-composer-layouts").setState({ list }).write();
      }

      // 列表（按 name 无序，原样返回）
      app.get("/api/game-composer/layouts", (req, res) => {
        try {
          res.json({ list: readList() });
        } catch (error) {
          console.error("[game-composer] 获取布局列表失败:", error);
          res.status(500).json({ error: error.message });
        }
      });

      // 新建（生成 id + updatedAt）
      app.post("/api/game-composer/layouts", (req, res) => {
        try {
          const v = validateBody(req.body);
          if (v.error) return res.status(400).json({ error: v.error });
          const layout = {
            id: newLayoutId(),
            name: v.name,
            updatedAt: new Date().toISOString(),
            items: v.items,
            connections: v.connections,
          };
          writeList([...readList(), layout]);
          console.log(`[game-composer] 布局已创建: ${layout.id} (${layout.name})`);
          res.status(201).json({ layout });
        } catch (error) {
          console.error("[game-composer] 创建布局失败:", error);
          res.status(500).json({ error: error.message });
        }
      });

      // 更新（未知 id → 404；刷新 updatedAt）
      app.put("/api/game-composer/layouts/:id", (req, res) => {
        try {
          const v = validateBody(req.body);
          if (v.error) return res.status(400).json({ error: v.error });
          const list = readList();
          const idx = list.findIndex((l) => l && l.id === req.params.id);
          if (idx < 0) {
            return res.status(404).json({ error: `布局 ${req.params.id} 不存在` });
          }
          const layout = {
            id: list[idx].id,
            name: v.name,
            updatedAt: new Date().toISOString(),
            items: v.items,
            connections: v.connections,
          };
          list[idx] = layout;
          writeList(list);
          console.log(`[game-composer] 布局已更新: ${layout.id} (${layout.name})`);
          res.status(200).json({ layout });
        } catch (error) {
          console.error("[game-composer] 更新布局失败:", error);
          res.status(500).json({ error: error.message });
        }
      });

      // 删除（未知 id → 404）
      app.delete("/api/game-composer/layouts/:id", (req, res) => {
        try {
          const list = readList();
          const next = list.filter((l) => !l || l.id !== req.params.id);
          if (next.length === list.length) {
            return res.status(404).json({ error: `布局 ${req.params.id} 不存在` });
          }
          writeList(next);
          console.log(`[game-composer] 布局已删除: ${req.params.id}`);
          res.status(200).json({ ok: true });
        } catch (error) {
          console.error("[game-composer] 删除布局失败:", error);
          res.status(500).json({ error: error.message });
        }
      });
    });

    // ---- 页面元数据（与 modules/modules.json 中 game-composer 条目逐字段一致） ----
    ctx.modules.registerPage({
      id: "game-composer",
      name: "可视化编排",
      description: "拖积木组赛制：组件编排生成新游戏模式",
      icon: "layout-grid",
      nav: ["select"],
      order: 17,
    });

    // 插件卸载时同步注销页面元数据（管理页停用后 /api/modules 与 /m/game-composer 同步消失）
    ctx.effect(() => () => ctx.modules.unregister("game-composer"));
  },
};
