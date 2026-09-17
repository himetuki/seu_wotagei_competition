/**
 * battle-group2 前端插件（P4 插件化迁移）
 *
 * 契约：原生 ESM，不 import 内核；apply 阶段只 register，DOM 操作统一发生在
 * component 被调用时（见 ./view.js battleGroup2Component）。key 必须 = 模块 id。
 *
 * 注：组件内部持久化仍用原生 fetch 直连 /api/battle-group2-process 端点（与迁移前
 * 逐字一致，保证行为零回归），ctx 保留备用。
 */
import { battleGroup2Component } from "./view.js";

export default {
  name: "battle-group2-front",
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({ key: "battle-group2", component: battleGroup2Component });
  },
};
