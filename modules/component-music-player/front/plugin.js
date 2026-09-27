/**
 * component-music-player 前端插件（组件类，P11 §3 问 2）
 *
 * 形态：标准前端插件（enabled 由 web/front.json 条目控制，带 pages 跨页命中），但注册进的是
 *      **组件表**而非页面表：ctx.ui.registerComponent(name, factory)。
 *      kernel 只会自动 render「页面条目（key = 模块 id）」，组件名永不被自动渲染——
 *      只在页面 component 里显式 ctx.ui.component("music-player") 取用时实例化。
 *
 * 组件名 "music-player" 是跨页公开标识；页面侧取用写法见 front/view.js 头注释。
 * 与 component-draw-machine 相互独立：两者不互相 import，任一条目 enabled:false 都不影响对方
 * （跨插件 import 会让"单独禁用"变成"级联崩溃"，违背 L2 组件准入条款）。
 */
import { createMusicPlayer } from "./view.js";

export default {
  name: "component-music-player",
  inject: ["ui"],
  apply(ctx) {
    // 内核组件注册表（B1 批次）未就绪时优雅降级：不注册、不抛错，页面侧 ctx.ui.component() 返回空
    if (typeof ctx.ui.registerComponent !== "function") {
      console.error(
        "[component-music-player] ctx.ui.registerComponent 不可用（内核未升级），组件未注册"
      );
      return;
    }
    ctx.ui.registerComponent("music-player", createMusicPlayer);
  },
};
