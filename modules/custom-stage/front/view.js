/**
 * custom-stage 页面视图（P14-C：组合舞台运行时页，规格 §5.2）
 *
 * 两种视图（由 location.search 的 layout 参数决定，切布局 = 链接跳转整页重载，不做 SPA 内切换）：
 * - 无参数：布局列表卡片网格（名称 / updatedAt 本地化 / 「打开」→ ?layout=<id>）；
 *   空列表 → 引导文案 + 链接 /m/game-composer/。
 * - 有参数：全量列表按 id 查找（无单条端点）→ 运行台（头部：布局名 + 更换布局 + 编辑此布局）
 *   + 容器按 items 顺序建 .stage-slot 宿主，再 mountFromConfig 挂真组件
 *     （Layout→config 换算与 P15 连线 runtimeProps 注入见 ./layout.mjs）。
 *
 * 降级：fetch 失败 → 错误行 + 重试按钮，不白屏；未找到布局 → 提示 + 返回列表链接。
 * 无任何持久化（各组件自管内存态）。
 * 晚到守卫：fetch 挂在页面级 AbortController 上，cleanup 后丢弃响应不写 DOM。
 */
import { icon } from "/web/icons.mjs";
import { mountFromConfig } from "/web/components/compose.mjs";
import { layoutToConfig, stageItems, buildRuntimeProps } from "./layout.mjs";

const LAYOUTS_API = "/api/game-composer/layouts"; // origin 相对路径
const COMPOSER_URL = "/m/game-composer/";
const STAGE_URL = "/m/custom-stage/";

/** HTML 转义（布局名等用户数据经 innerHTML 渲染前必须转义；亦复用为属性值转义） */
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

/** updatedAt ISO → 本地化时间；非法/缺省值显示占位符 */
function formatTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

/** 页面骨架（标题头 + 工具行容器 + 主体容器） */
function shellPage(titleHtml, toolsHtml) {
  return `
    <section class="custom-stage-page">
      <header class="custom-stage-header">
        <h1 class="custom-stage-title">${titleHtml}</h1>
        ${toolsHtml ? `<div class="stage-tools">${toolsHtml}</div>` : ""}
      </header>
      <div class="custom-stage-body"></div>
    </section>`;
}

/** 列表视图头部标题 */
const LIST_TITLE = `${icon("apps", { size: 22 })}<span>组合舞台</span>`;

function renderLoading(el) {
  el.innerHTML = shellPage(LIST_TITLE);
  el.querySelector(".custom-stage-body").innerHTML =
    `<p class="stage-msg">${icon("info-circle", { size: 18 })}<span>正在加载布局…</span></p>`;
}

/** 列表视图：布局卡片网格 / 空列表引导 */
function renderList(el, list) {
  el.innerHTML = shellPage(LIST_TITLE);
  const body = el.querySelector(".custom-stage-body");
  if (!list.length) {
    body.innerHTML = `
      <div class="stage-empty">
        <p class="stage-msg">${icon("info-circle", { size: 18 })}<span>还没有保存过的布局。先到「可视化编排」拖积木组一个赛制，保存后即可在这里运行。</span></p>
        <a class="stage-link" href="${COMPOSER_URL}">${icon("layout-grid", { size: 16 })}<span>去可视化编排</span></a>
      </div>`;
    return;
  }
  const cards = list
    .filter((layout) => layout && layout.id)
    .map((layout) => `
      <section class="card stage-card">
        <div class="stage-card__name">${escapeHtml(layout.name || "未命名布局")}</div>
        <div class="stage-card__time">更新于 ${escapeHtml(formatTime(layout.updatedAt))}</div>
        <a class="stage-card__open" href="?layout=${encodeURIComponent(layout.id)}">${icon("chevron-right", { size: 16 })}<span>打开</span></a>
      </section>`)
    .join("");
  body.innerHTML = `<div class="grid-cards">${cards}</div>`;
}

/**
 * 运行视图：头部（布局名 + 更换布局 + 编辑此布局）+ 运行容器按 items 顺序建宿主，
 * 再经 mountFromConfig 挂真组件。adoptMount 回填页面 cleanup 组合用的 mounted。
 */
function renderRun(el, list, layoutId, ctx, adoptMount) {
  const layout = list.find((item) => item && item.id === layoutId) || null;
  if (!layout) {
    el.innerHTML = shellPage(LIST_TITLE);
    el.querySelector(".custom-stage-body").innerHTML = `
      <div class="stage-empty">
        <p class="stage-msg">${icon("alert-triangle", { size: 18 })}<span>找不到该布局（可能已被删除）。</span></p>
        <a class="stage-link" href="${STAGE_URL}">${icon("arrow-left", { size: 16 })}<span>返回布局列表</span></a>
      </div>`;
    return;
  }

  const items = stageItems(layout); // 与 layoutToConfig 同一过滤：宿主选择器与 DOM 一一对应
  const slotsHtml = items
    .map((item) => `<div class="stage-slot card" data-slot="${escapeHtml(item.id)}"></div>`)
    .join("");
  el.innerHTML = shellPage(
    `<span>${escapeHtml(layout.name || "未命名布局")}</span>`,
    `
      <a class="stage-link" href="${STAGE_URL}">${icon("arrow-left", { size: 16 })}<span>更换布局</span></a>
      <a class="stage-link" href="${COMPOSER_URL}?layout=${encodeURIComponent(layout.id)}">${icon("layout-grid", { size: 16 })}<span>编辑此布局</span></a>`,
  );
  const body = el.querySelector(".custom-stage-body");
  if (!items.length) {
    // 空布局（API 允许存盘）：不调 mountFromConfig（零装配），给引导提示
    body.innerHTML = `
      <div class="stage-empty">
        <p class="stage-msg">${icon("info-circle", { size: 18 })}<span>此布局暂无组件。</span></p>
        <a class="stage-link" href="${COMPOSER_URL}">${icon("layout-grid", { size: 16 })}<span>去添加组件</span></a>
      </div>`;
    return;
  }
  body.innerHTML = `<div class="grid-flow stage-run">${slotsHtml}</div>`;
  // 连线注入（P15 规格 §3）：apis 以 item.id 为键，由注入的 onReady 在挂载期同步回填
  //（mountFromConfig 构造内即完成 mountAll，返回时已齐）；连线函数在用户交互时才惰性查表。
  // 晚到守卫/disposed 语义不变：连线闭包只捕获本页局部 Map，随 mounted.cleanup 一并废弃。
  adoptMount(
    mountFromConfig({
      el, // 宿主查找限定页面根内（.stage-run 容器内的 .stage-slot）
      meta: layoutToConfig(layout), // 静态 props（title + item.props）；不传 defaultSlots（P14 规格 §3）
      runtimeProps: buildRuntimeProps(layout, new Map(), console.warn), // 连线注入，浅合并覆盖同名静态 prop
      ctx,
      label: "custom-stage",
    }),
  );
}

/** 加载失败：错误行 + 重试按钮（不白屏） */
function renderError(el, error, onRetry, signal) {
  el.innerHTML = shellPage(LIST_TITLE);
  el.querySelector(".custom-stage-body").innerHTML = `
    <div class="stage-empty">
      <p class="stage-msg stage-msg--error">${icon("alert-triangle", { size: 18 })}<span>布局列表加载失败（${escapeHtml(error && error.message ? error.message : String(error))}）</span></p>
      <button type="button" class="stage-btn">${icon("refresh", { size: 16 })}<span>重试</span></button>
    </div>`;
  el.querySelector(".stage-btn").addEventListener("click", onRetry, { signal });
}

/**
 * 页面 component 主体：同步返回 cleanup。
 * cleanup 组合顺序：先 mounted.cleanup()（组件实例逆序卸载，清定时器/监听/body 类），
 * 再 abort 页面级 AbortController（解绑监听 + 使在飞 fetch 失效，晚到响应丢弃）。
 */
export function customStageComponent(el, meta, ctx) {
  const controller = new AbortController();
  const { signal } = controller;
  const layoutId = new URLSearchParams(location.search).get("layout");
  let mounted = null; // mountFromConfig 返回值（renderRun 异步阶段回填）
  let disposed = false; // 晚到守卫：cleanup 后不再写 DOM / 不再挂组件

  function load() {
    renderLoading(el);
    fetch(LAYOUTS_API, { signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (disposed) return; // 晚到响应丢弃
        const list = Array.isArray(data && data.list) ? data.list : [];
        if (layoutId) {
          renderRun(el, list, layoutId, ctx, (m) => { mounted = m; });
        } else {
          renderList(el, list);
        }
      })
      .catch((error) => {
        if (disposed || (error && error.name === "AbortError")) return;
        renderError(el, error, load, signal);
      });
  }

  load();

  return () => {
    disposed = true;
    if (mounted) {
      mounted.cleanup(); // 组件实例逆序卸载（mountFromConfig 内部单错不外抛）
      mounted = null;
    }
    controller.abort(); // 解绑页面监听 + 中止在飞 fetch
  };
}
