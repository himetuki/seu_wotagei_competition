/**
 * neon-penlights 人浪实现
 *
 * buildPenlightRow(host, props)  组件工厂：往任意宿主渲染一排人浪（编排页可排布）
 * mountPersistentRow()           页面常驻条：body 末尾 fixed 底缘观众席（幂等，DOM 判重）
 *
 * 样式自足：本组件自注入 /m/component-neon-penlights/penlights.css（组件不依赖宿主页 CSS），
 * 全部显隐守卫（html.theme-neon / body.battle-mode / prefers-reduced-motion）写在 CSS 侧。
 */

const PENLIGHT_PALETTE = [
  ["#ff5fa2", "rgba(255,95,162,.55)"],
  ["#00e5ff", "rgba(0,229,255,.55)"],
  ["#ffe14d", "rgba(255,225,77,.5)"],
  ["#4dff9e", "rgba(77,255,158,.5)"],
  ["#38b6ff", "rgba(56,182,255,.55)"],
  ["#ff3b4e", "rgba(255,59,78,.5)"],
];

function ensurePenlightsStylesheet() {
  if (document.getElementById("neon-penlights-css")) return;
  const link = document.createElement("link");
  link.id = "neon-penlights-css";
  link.rel = "stylesheet";
  link.href = "/m/component-neon-penlights/penlights.css";
  document.head.appendChild(link);
}

/** 生成 count 根荧光棒到 host（高度/相位随机，肃而不乱） */
function fillRow(host, count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const [color, glow] = PENLIGHT_PALETTE[i % PENLIGHT_PALETTE.length];
    const stick = document.createElement("i");
    stick.className = "npl";
    stick.style.setProperty("--c", color);
    stick.style.setProperty("--c-s", glow);
    stick.style.setProperty("--h", 30 + Math.round(Math.random() * 26) + "px");
    stick.style.setProperty("--d", (-Math.random() * 2.4).toFixed(2) + "s");
    frag.appendChild(stick);
  }
  host.appendChild(frag);
}

/** 组件工厂：任意宿主内渲染一排人浪（编排页/组合舞台可当普通组件排布） */
export function buildPenlightRow(host, props = {}) {
  ensurePenlightsStylesheet();
  host.innerHTML = "";
  const row = document.createElement("div");
  row.className = "npl-row npl-row--inline";
  host.appendChild(row);
  fillRow(row, Math.max(4, Math.min(40, parseInt(props.count, 10) || 18)));
  return () => {
    host.innerHTML = "";
  };
}

/** 页面常驻条：fixed 底缘观众席（幂等；显隐由 penlights.css 按 html.theme-neon 驱动） */
export function mountPersistentRow() {
  ensurePenlightsStylesheet();
  if (document.getElementById("neon-penlights-row")) return;
  const row = document.createElement("div");
  row.id = "neon-penlights-row";
  row.className = "npl-row npl-row--fixed";
  row.setAttribute("aria-hidden", "true");
  fillRow(row, 30);
  document.body.appendChild(row);
}
