/**
 * 内置服务 ctx.ui —— 页面注册表 + 组件注册表（P3a / P11-B1）
 *
 * ctx.ui = {
 *   // ---- 页面表（kernel 按 URL 自动渲染，key 必须 = 模块 id）----
 *   register({ key, component }),  // component: (el, meta, ctx) => cleanup|void；同 key 后载覆盖先载
 *   unregister(key),
 *   render(key, meta, container),  // 未注册 → 占位提示；重复 render 先调旧 cleanup
 *
 *   // ---- 组件表（P11 新增：页面显式取用，永不被 kernel 自动渲染）----
 *   registerComponent(name, factory), // name: string（建议 kebab-case）；同 name 后注册覆盖先注册
 *                                     // factory: (hostEl, props, ctx) => cleanup|void
 *   component(name),                  // -> factory | null（供页面在 render 阶段取用）
 *   listComponents(),                 // -> string[]（插入序快照，调试/管理页/单测断言用）
 * }
 *
 * register 不绑定插件 fiber（服务装在根上，register 时拿不到调用方 scope）：
 * 前端插件生命周期 = 页面生命周期（front.json enabled 决定是否 import，热替换 = 刷新页面），
 * 故无需 fiber 级自动回收。render 契约：同一 container 只保留一份活动组件，
 * 新 render 前先调用上一个 component 返回的 cleanup（异常吞掉并上报，不阻断新渲染）。
 * 占位节点 class="plugin-placeholder"，样式由模块 CSS 负责（P3d）。
 *
 * ★ 两张表分离（P11 §3 问 2）：页面表 key = 模块 id，组件表 name 自由命名，**互不覆盖**。
 *   组件类插件（front.json 条目 kind:"component" + pages）在 apply 阶段只做 registerComponent，
 *   实例化一律由页面 component 显式完成：const f = ctx.ui.component("music-player") → f(host, props, ctx)。
 *   未被任何页面取用的组件零开销（enabled:false 的插件连代码都不下载）。
 *   本期不提供 unregisterComponent：组件生命周期 = 页面生命周期，刷新即重建整个 ctx；
 *   layout hint 等第三参也不在本期 API 内（布局归 CSS 类，见 /web/components/grid.css）。
 *   组件工厂抛错时的降级由调用方负责（页面按 `if (!factory) return` 优雅跳过缺失组件）。
 */
export function installUi(ctx) {
  const pages = new Map(); // 页面表：key(模块 id) -> component(el, meta, ctx)
  const components = new Map(); // 组件表：name -> factory(hostEl, props, ctx)
  let current = null; // { key, cleanup } 当前活动渲染

  function cleanupCurrent() {
    if (!current) return;
    const { cleanup } = current;
    current = null;
    if (typeof cleanup === "function") {
      try {
        cleanup();
      } catch (e) {
        console.error("[web/ui] 组件 cleanup 失败:", e);
      }
    }
  }

  const service = {
    // ---------- 页面表（既有语义不变） ----------
    register({ key, component } = {}) {
      if (!key || typeof component !== "function") {
        throw new Error("ctx.ui.register({ key, component }) 需要 key 与 component 函数");
      }
      pages.set(key, component);
    },

    unregister(key) {
      pages.delete(key);
      if (current && current.key === key) {
        const { container } = current;
        cleanupCurrent();
        if (container) container.innerHTML = ""; // 组件已注销，不同步清空会残留失效 DOM
      }
    },

    render(key, meta, container) {
      if (!container) return;
      cleanupCurrent();
      const component = key != null ? pages.get(key) : null;
      if (!component) {
        container.innerHTML = '<div class="plugin-placeholder">插件未启用或未提供界面</div>';
        return;
      }
      const cleanup = component(container, meta, ctx);
      current = { key, cleanup: typeof cleanup === "function" ? cleanup : null, container };
    },

    // ---------- 组件表（P11 增量：读写分离，读接口返回快照/工厂本体） ----------
    registerComponent(name, factory) {
      if (typeof name !== "string" || !name || typeof factory !== "function") {
        throw new Error("ctx.ui.registerComponent(name, factory) 需要 name 字符串与 factory 函数");
      }
      components.set(name, factory);
    },

    /** 取组件工厂：未注册/非字符串名 → null（调用方据此优雅降级，不抛错） */
    component(name) {
      const factory = typeof name === "string" ? components.get(name) : undefined;
      return typeof factory === "function" ? factory : null;
    },

    /** 已注册组件名快照（插入序，防御性拷贝：调用方改动不回污染注册表） */
    listComponents() {
      return [...components.keys()];
    },
  };

  ctx.provide("ui", service);
  return service;
}
