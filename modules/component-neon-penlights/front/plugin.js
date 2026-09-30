/**
 * component-neon-penlights —— NEON STAGE 主题插件组 · 荧光棒人浪组件
 *
 * 形态：组件类插件（仅 front/，不进导航）；跨页命中见 web/front.json 条目 pages。
 *
 * 职责：在命中的页面底部常驻一条"观众席荧光棒"人浪（fixed 底缘、pointer-events none，
 * 不占布局、不挡交互）。人浪显隐由 html.theme-neon 类驱动（penlights.css 守卫）：
 *   - 主题未激活 / body.battle-mode（比赛演出只留背景图）→ 整条隐藏
 *   - prefers-reduced-motion: reduce → 摆动与明暗动画停用（保留静态点灯）
 * 同时注册组件 "neon-penlights"（可被编排页/组合舞台当普通组件排布进布局，
 * 传入宿主即渲染一排人浪——与页面常驻条互不影响）。
 */
import { buildPenlightRow, mountPersistentRow } from "./view.js";

export default {
  name: "component-neon-penlights",
  inject: ["ui"],
  apply(ctx) {
    // 内核组件注册表未就绪时优雅降级：不注册、不抛错
    if (typeof ctx.ui.registerComponent !== "function") {
      console.error("[component-neon-penlights] ctx.ui.registerComponent 不可用，组件未注册");
      return;
    }
    ctx.ui.registerComponent("neon-penlights", buildPenlightRow);

    // 常驻观众席人浪（显隐交给 CSS，与主题激活解耦）
    mountPersistentRow();
  },
};
