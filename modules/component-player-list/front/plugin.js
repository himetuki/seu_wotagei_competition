/**
 * component-player-list 前端插件（组件类，P11 §3 问 2）
 *
 * 形态：标准前端插件（enabled 由 web/front.json 条目控制，带 pages 跨页命中），
 *      但注册进的是**组件表**而非页面表：ctx.ui.registerComponent(name, factory)。
 *      kernel 只自动 render 页面条目（key = 模块 id），组件名永不被自动渲染——
 *      只在页面 component 里显式 ctx.ui.component("player-list") 取用时实例化。
 *
 * 组件名 "player-list" 是跨页公开标识；页面侧取用（P11 约定）：
 *   const factory = ctx.ui.component("player-list");
 *   if (factory) cleanups.push(factory(host, props, ctx));   // host = 页面插槽元素
 * 降级：组件被 enabled:false 禁用或未注册时 component() 返回 null，页面据此跳过（插槽留空）。
 *
 * 跨页命中（web/front.json 条目 pages）：["game-composer","custom-stage"]
 * 依赖纪律：组件不得 import 其他组件——跨插件 import 会让「单独禁用」变成「级联崩溃」
 * （P11 §3 问 6 的 L2 准入条款）。
 */
import { createPlayerList } from "./view.js";

export default {
  name: "component-player-list",
  inject: ["ui"],
  apply(ctx) {
    // 内核组件注册表未就绪时优雅降级：不注册、不抛错（页面侧 component() 返回 null）
    if (typeof ctx.ui.registerComponent !== "function") {
      console.error("[component-player-list] ctx.ui.registerComponent 不可用（内核未升级），组件未注册");
      return;
    }
    ctx.ui.registerComponent("player-list", createPlayerList);
  },
};
