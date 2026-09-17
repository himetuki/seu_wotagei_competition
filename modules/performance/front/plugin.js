/**
 * modules/performance 前端插件（P4 插件化迁移）
 *
 * 演出页 = select 页中键快捷入口（window.location.href = "/m/performance"）。
 * 迁移前 index.html 为 0 字节空占位、无任何 JS/行为，本插件保持空白页语义：
 * 只注册 key = 模块 id "performance" 的空组件，让 kernel render 命中注册表、
 * 不渲染"插件未启用"占位；页面骨架（演出内容）待功能落地时在 index.html
 * 扩充并在本组件内绑定（静态骨架监听须 { signal } + cleanup abort）。
 */
export default {
  name: "performance-front",
  inject: ["ui"],
  apply(ctx) {
    ctx.ui.register({
      key: "performance",
      component() {
        // 空占位页：无骨架、无监听、无 cleanup 资源
      },
    });
  },
};
