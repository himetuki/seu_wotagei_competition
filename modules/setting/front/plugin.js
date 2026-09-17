/**
 * modules/setting 前端插件（P3d 迁移）
 *
 * 原生 ESM，不 import 内核；由 web/kernel.js 装配器按 /web/front.json 的
 * modules/setting 条目 dynamic import 本文件 default 导出。
 * apply 阶段只 register（key = 模块 id "setting"）；
 * DOM 操作统一发生在 component 被调用时（见 ./view.js）。
 */
import { component } from "./view.js";

export default {
  name: "setting-front",
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({ key: "setting", component });
  },
};
