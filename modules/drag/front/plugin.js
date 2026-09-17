/**
 * drag 前端插件（P3d 插件化迁移）
 *
 * 契约：原生 ESM，不 import 内核；apply 阶段只 register，DOM 操作统一发生在
 * component 被调用时（见 ./view.js dragComponent）。key 必须 = 模块 id "drag"。
 *
 * 注：inject 按内核契约声明 ui/api；组件内部持久化仍用原生 fetch 直连
 * /api/drag-* 端点（与迁移前逐字一致，保证行为零回归），ctx 保留备用。
 */
import { dragComponent } from "./view.js";

export default {
  name: "drag-front",
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({ key: "drag", component: dragComponent });
  },
};
