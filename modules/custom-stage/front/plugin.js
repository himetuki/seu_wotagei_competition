/**
 * custom-stage 前端插件（P14-C：组合舞台运行时页）
 *
 * 契约：原生 ESM，不 import 内核或 Node 模块；apply 阶段只 register，
 * DOM 操作统一在 component 内（./view.js）。key 必须 = 模块 id "custom-stage"。
 *
 * 本文件是薄壳：页面视图（列表/运行台、fetch、晚到守卫）全在 ./view.js，
 * 组件装配循环/降级/多实例对齐/cleanup 收集由 L1 共享装配器
 * web/components/compose.mjs（mountFromConfig）承担，Layout→config 换算在 ./layout.mjs。
 * 页面组件同步返回 cleanup（先卸载 mounted 再 abort 监听），满足内核 render 契约。
 */
import { customStageComponent } from "./view.js";

export default {
  name: "custom-stage-front",
  inject: ["ui"], // 页面仅用 ctx.ui；fetch 用原生（需 AbortController signal）
  apply(ctx) {
    ctx.ui.register({
      key: "custom-stage",
      component(el, meta, componentCtx) {
        return customStageComponent(el, meta, componentCtx);
      },
    });
  },
};
