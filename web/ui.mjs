/**
 * 内置服务 ctx.ui —— 组件注册表 + 页面渲染（P3a）
 *
 * ctx.ui = {
 *   register({ key, component }),  // component: (el, meta, ctx) => cleanup|void；同 key 后载覆盖先载
 *   unregister(key),
 *   render(key, meta, container),  // 未注册 → 占位提示；重复 render 先调旧 cleanup
 * }
 *
 * register 不绑定插件 fiber（服务装在根上，register 时拿不到调用方 scope）：
 * 前端插件生命周期 = 页面生命周期（front.json enabled 决定是否 import，热替换 = 刷新页面），
 * 故无需 fiber 级自动回收。render 契约：同一 container 只保留一份活动组件，
 * 新 render 前先调用上一个 component 返回的 cleanup（异常吞掉并上报，不阻断新渲染）。
 * 占位节点 class="plugin-placeholder"，样式由模块 CSS 负责（P3d）。
 */
export function installUi(ctx) {
  const components = new Map(); // key -> component(el, meta, ctx)
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
    register({ key, component } = {}) {
      if (!key || typeof component !== "function") {
        throw new Error("ctx.ui.register({ key, component }) 需要 key 与 component 函数");
      }
      components.set(key, component);
    },

    unregister(key) {
      components.delete(key);
      if (current && current.key === key) {
        const { container } = current;
        cleanupCurrent();
        if (container) container.innerHTML = ""; // 组件已注销，不同步清空会残留失效 DOM
      }
    },

    render(key, meta, container) {
      if (!container) return;
      cleanupCurrent();
      const component = key != null ? components.get(key) : null;
      if (!component) {
        container.innerHTML = '<div class="plugin-placeholder">插件未启用或未提供界面</div>';
        return;
      }
      const cleanup = component(container, meta, ctx);
      current = { key, cleanup: typeof cleanup === "function" ? cleanup : null, container };
    },
  };

  ctx.provide("ui", service);
  return service;
}
