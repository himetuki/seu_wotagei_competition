/**
 * 内置服务 ctx.modules —— /api/modules 与 /m/:id 的元数据源（C4 七字段投影）
 *
 * ctx.modules = {
 *   registerPage({ id, name, description, icon, nav, order, route }),
 *   unregister(id),
 *   list(),     // 按注册序输出，投影与 server/routes/module-routes.js 逐字段一致
 *   get(id),    // 规格扩展：/m/:id 页面服务需要按 id 查询单条
 * }
 *
 * 去重：按 id 覆盖（后注册者优先）。迁移期双源桥接（D3）中 loader 先投影 legacy
 * 条目、后挂载插件，因此已迁移插件的注册天然覆盖同名桥接条目。
 * list() 的 key 顺序与缺省值照抄 module-routes.js:20-29，保证两模式响应字节级一致。
 */
function installModules(ctx, deps) {
  const pages = new Map(); // id -> 原始元数据（插入序 = Map 序）

  const service = {
    registerPage(meta) {
      if (!meta || !meta.id) {
        throw new Error("ctx.modules.registerPage(meta) 需要 meta.id");
      }
      pages.set(meta.id, { ...meta });
    },

    unregister(id) {
      pages.delete(id);
    },

    get(id) {
      return pages.get(id) || null;
    },

    list() {
      return [...pages.values()].map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description || "",
        icon: m.icon || "",
        nav: m.nav || [],
        order: m.order || 0,
        route: `/m/${m.id}/`,
      }));
    },
  };

  ctx.provide("modules", service);
  return service;
}

module.exports = { installModules };
