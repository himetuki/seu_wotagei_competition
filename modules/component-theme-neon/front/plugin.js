/**
 * component-theme-neon —— NEON STAGE 主题插件（主题插件组 · 核心）
 *
 * 形态：组件类插件（仅 front/，不进导航）；跨页命中清单见 web/front.json 条目 pages。
 *
 * 职责：
 *   1) 注册组件 "theme:neon"（theme-manager 页用它渲染本主题的预览卡）
 *   2) 在 <html> 标注 data-page（theme.css 按 页面 id 给 battle-group 系列分组别主色）
 *   3) 注入主题资产：theme.css <link> + 氛围层 DOM（扫描线 / 网格地板 / 舞台光束 /
 *      首页跑马灯）——全部默认 display:none，仅在 html.theme-neon 时由 CSS 显形；
 *      battle-mode 下整体隐藏（比赛演出时只留背景图，守卫规则见 theme.css 末节）
 *   4) 激活判定：localStorage("ystage:theme") 同步判定（避免首屏闪默认主题），
 *      再异步与 GET /api/theme/active 对账（系统级首选；接口 404/异常 → 静默保持本地）
 *
 * ★ 自建主题插件契约（照此实现即可被 theme-manager 自动发现）：
 *   - 目录 modules/component-theme-<id>/，仅 front/{plugin,view}.js（+主题样式等静态资产），
 *     web/front.json 条目 { kind:"component", pages:[…全部要生效的页面 id…] }
 *   - apply 内 ctx.ui.registerComponent("theme:<id>", factory)；
 *     factory(host, props) 渲染主题预览卡（props.active = 是否当前主题），返回 cleanup 可选
 *   - 自带激活逻辑（本文件的 ensureStylesheet/ensureAmbience/setActive 可作模板）：挂自己的类与样式并持久化
 *   - 主题之间互不 import（组件纪律）；禁用本插件 = 主题从主题页消失、页面回落默认
 */
import { createThemePreview } from "./view.js";
import { applyEnhancements } from "./enhance.js";

const THEME_ID = "neon";
const THEME_STORAGE_KEY = "ystage:theme";

/** 从路径解出页面 id（"/"、"/index.html" 归一为 home，与内核 loader 同规则） */
function currentPageId() {
  const m = location.pathname.match(/^\/m\/([a-z0-9_-]+)/i);
  return m ? m[1].toLowerCase() : "home";
}

function ensureStylesheet() {
  // 两个 link 各自幂等判重（互不依赖）：theme.css 配色/换肤在前，
  // neon-layout.css 动态流式布局层在后——同特异性规则靠源序覆盖。
  if (!document.getElementById("theme-neon-css")) {
    const link = document.createElement("link");
    link.id = "theme-neon-css";
    link.rel = "stylesheet";
    link.href = "/m/component-theme-neon/theme.css";
    document.head.appendChild(link);
  }
  if (!document.getElementById("theme-neon-layout-css")) {
    const layout = document.createElement("link");
    layout.id = "theme-neon-layout-css";
    layout.rel = "stylesheet";
    layout.href = "/m/component-theme-neon/neon-layout.css";
    document.head.appendChild(layout);
  }
}

/** 氛围层 DOM（一次性注入；显隐全权交 theme.css，主题未激活时零视觉残留） */
function ensureAmbience(page) {
  if (!document.getElementById("neon-stage-scan")) {
    const scan = document.createElement("div");
    scan.id = "neon-stage-scan";
    scan.className = "neon-scan";
    scan.setAttribute("aria-hidden", "true");
    document.body.appendChild(scan);
  }
  if (!document.getElementById("neon-stage-floor")) {
    const floor = document.createElement("div");
    floor.id = "neon-stage-floor";
    floor.className = "neon-floor";
    floor.setAttribute("aria-hidden", "true");
    document.body.appendChild(floor);
  }
  if (!document.getElementById("neon-stage-beams")) {
    const beams = document.createElement("div");
    beams.id = "neon-stage-beams";
    beams.className = "neon-beams";
    beams.setAttribute("aria-hidden", "true");
    beams.append(document.createElement("i"), document.createElement("i"));
    document.body.appendChild(beams);
  }
  // 跑马灯仅首页（转播条；其余页面保持肃静）
  if (page === "home" && !document.getElementById("neon-stage-ticker")) {
    const ticker = document.createElement("div");
    ticker.id = "neon-stage-ticker";
    ticker.className = "neon-ticker";
    ticker.setAttribute("aria-hidden", "true");
    const line =
      "WELCOME TO <b>Y.STAGE</b> // \u30F2\u30BF\u82B8\u30D0\u30C8\u30EB\u30D7\u30E9\u30C3\u30C8\u30D5\u30A9\u30FC\u30E0 // \u30B3\u30FC\u30EB & \u30EC\u30B9\u30DD\u30F3\u30B9 // PEN-LIGHT SYNC // \u30BB\u30C8\u30EA\u62BD\u9078 // LET'S \u30F2\u30BF\u82B8!!! //";
    const inner = document.createElement("div");
    inner.className = "neon-ticker-in";
    for (let i = 0; i < 2; i++) {
      const span = document.createElement("span");
      span.className = "tk";
      span.innerHTML = line;
      inner.appendChild(span);
    }
    ticker.appendChild(inner);
    document.body.appendChild(ticker);
  }
  // 荧光棒人浪由主题插件组成员 component-neon-penlights 自行注入；
  // 其显隐同样由 html.theme-neon 类驱动，此处不重复。
}

/** 激活/停用只拨类——样式与氛围层的挂载已在 apply 完成；状态以 DOM 为准（无模块级可变状态） */
function setActive(on) {
  document.documentElement.classList.toggle("theme-neon", on);
}

export default {
  name: "component-theme-neon",
  inject: ["ui"],
  apply(ctx) {
    // 内核组件注册表未就绪时优雅降级：不注册、不抛错（theme-manager 据此跳过本主题卡）
    if (typeof ctx.ui.registerComponent !== "function") {
      console.error("[component-theme-neon] ctx.ui.registerComponent 不可用，主题未注册");
      return;
    }

    const page = currentPageId();
    document.documentElement.dataset.page = page;

    // 资产注入无条件执行（theme.css 全部规则挂在 html.theme-neon 之下，未激活零影响）
    ensureStylesheet();
    ensureAmbience(page);

    ctx.ui.registerComponent("theme:neon", createThemePreview);

    // 同步初判（无 FOUC）：本地记忆为 neon → 立即激活 + 结构增强（复现样例版式）
    if (localStorage.getItem(THEME_STORAGE_KEY) === THEME_ID) {
      setActive(true);
      applyEnhancements(page);
    }

    // 异步对账：服务端系统级主题（theme-manager 的 PUT 写入）；与本机不一致时
    // 整页重载切换（结构增强与样式同批生效，避免中间态）
    fetch("/api/theme/active")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || typeof data.active !== "string") return;
        if (data.active === localStorage.getItem(THEME_STORAGE_KEY)) return;
        localStorage.setItem(THEME_STORAGE_KEY, data.active);
        if (data.active === THEME_ID) {
          applyEnhancements(page);
          setActive(true);
        } else {
          location.reload();
        }
      })
      .catch(() => {});
  },
};
