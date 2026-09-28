/**
 * game-composer 前端插件 —— 可视化编排编辑器（P14 批次 B）
 *
 * key = 模块 id，kernel 装配完按它 render。视图实现整体在 ./view.js
 * （本文件只负责注册组件与 cleanup 契约装配）；纯函数 helper 在 ./layout.mjs。
 *
 * 契约：component(el, meta, ctx) 同步返回 cleanup——视图内部的响应式挂载
 * （mountReactiveSafe）本身同步返回 dispose，异步 scope 就绪由 view.js 内的
 * 晚到守卫兜底，勿在组件体内 await 挂载后再返回。
 */
import { createComposerView } from "./view.js";

export default {
  name: "game-composer-front",
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({
      key: "game-composer",
      component(el, meta, ctx) {
        return createComposerView(el, ctx);
      },
    });
  },
};
