/**
 * component-draw-machine 前端插件（组件类，P11 §3 问 2）
 *
 * 形态：标准前端插件（enabled 由 web/front.json 条目控制，带 pages 跨页命中），但注册进的是
 *      **组件表**而非页面表：ctx.ui.registerComponent(name, factory)。
 *      kernel 只会自动 render「页面条目（key = 模块 id）」，组件名永不被自动渲染——
 *      只在页面 component 里显式 ctx.ui.component("draw-machine") 取用时实例化。
 *
 * 组件名 "draw-machine" 是跨页公开标识；页面侧取用写法见 front/view.js 头注释。
 */
import { createDrawMachine } from "./view.js";

export default {
  name: "component-draw-machine",
  inject: ["ui"],
  apply(ctx) {
    // 内核组件注册表（B1 批次）未就绪时优雅降级：不注册、不抛错，页面侧 ctx.ui.component() 返回空
    if (typeof ctx.ui.registerComponent !== "function") {
      console.error(
        "[component-draw-machine] ctx.ui.registerComponent 不可用（内核未升级），组件未注册"
      );
      return;
    }
    ctx.ui.registerComponent("draw-machine", createDrawMachine);
  },
};
