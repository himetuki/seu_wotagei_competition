/**
 * player-list 组件工厂（L2 组件实现，P14 规格 §4.1）
 *
 * 职责：只做**选手名单展示与勾选**——从 resource/json 读名单（与 drag 页同口径：
 * 取 name 字段 trim 过滤空值），点击格子切换选中态，经 onReady 交付 getSelected()。
 * 数据仅内存，不写 localStorage、不调持久化 API。
 *
 * 契约：factory(hostEl, props, ctx) => cleanup
 *   props.title       string            卡片头标题（缺省「选手名单」）
 *   props.source      "player1"|"player2" 数据来源（缺省 "player1"；非法值回落 player1）
 *   props.selectable  boolean           是否可点选（缺省 true；false 时格子纯展示）
 *   props.onReady     ({ getSelected }) 实例就绪即交付（fetch 未完成时 getSelected 返回 []）
 *
 * 降级：fetch 失败 / 数据非数组 → 组件内显示错误提示行，不抛错。
 *
 * 纪律（AGENTS §4.2）：无模块级可变状态；监听全传 { signal }；不碰 body class、
 * 不 import 其他组件、不写 style.css（外观由宿主页 CSS 提供，类名 .player-list__*）。
 */
export function createPlayerList(host, props = {}, ctx) {
  if (!host) return undefined;
  const ctrl = new AbortController();
  const { signal } = ctrl;

  const source = props.source === "player2" ? "player2" : "player1";
  const selectable = props.selectable !== false; // 缺省 true

  // 全部状态在工厂局部（多实例互不串台）：名单 + 选中下标集合
  const names = [];
  const selected = new Set(); // 选中项下标

  // ---- 静态骨架（模板串只含可信静态结构；用户数据一律 createElement/textContent） ----
  host.innerHTML = `
    <div class="player-list" data-component="player-list">
      <div class="player-list__header">
        <span class="player-list__title"></span>
        <span class="player-list__stats"></span>
      </div>
      <div class="player-list__body">
        <div class="player-list__hint">选手名单加载中…</div>
      </div>
    </div>
  `;
  const root = host.querySelector(".player-list");
  const titleEl = root.querySelector(".player-list__title");
  const statsEl = root.querySelector(".player-list__stats");
  const bodyEl = root.querySelector(".player-list__body");

  titleEl.textContent = typeof props.title === "string" && props.title.trim()
    ? props.title
    : "选手名单";

  function renderStats() {
    statsEl.textContent = `共 ${names.length} 人 · 已选 ${selected.size} 人`;
  }

  /** 单行提示（加载中 / 错误 / 空名单）替换 body 内容 */
  function renderRow(text, isError) {
    bodyEl.textContent = "";
    const row = document.createElement("div");
    row.className = isError ? "player-list__error" : "player-list__hint";
    row.textContent = text;
    bodyEl.append(row);
  }

  /** 名单网格：每人格子（textContent 写名字，防注入） */
  function renderGrid() {
    bodyEl.textContent = "";
    const grid = document.createElement("div");
    grid.className = "player-list__grid";
    names.forEach((name, i) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "player-list__item";
      if (selected.has(i)) cell.classList.add("player-list__item--selected");
      cell.dataset.index = String(i);
      cell.textContent = name; // 用户数据走 textContent，绝不拼 innerHTML
      grid.append(cell);
    });
    bodyEl.append(grid);
    renderStats();
  }

  // ---- 点选（事件委托；selectable=false 时无行为） ----
  if (selectable) {
    bodyEl.addEventListener(
      "click",
      (e) => {
        const cell = e.target.closest(".player-list__item");
        if (!cell || !bodyEl.contains(cell)) return;
        const i = Number(cell.dataset.index);
        if (!Number.isInteger(i) || i < 0 || i >= names.length) return;
        if (selected.has(i)) {
          selected.delete(i);
          cell.classList.remove("player-list__item--selected");
        } else {
          selected.add(i);
          cell.classList.add("player-list__item--selected");
        }
        renderStats();
      },
      { signal }
    );
  }

  // ---- 加载名单（origin 相对路径；失败/畸形数据 → 错误行，不抛错） ----
  fetch(`/resource/json/${source}.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      if (signal.aborted) return; // 卸载后迟到响应不再写 DOM
      if (!Array.isArray(data)) throw new Error("数据不是数组");
      // 与 drag 页同口径：取 name 字段 trim 过滤空值
      names.length = 0;
      for (const item of data) {
        const name = item && item.name ? String(item.name).trim() : "";
        if (name) names.push(name);
      }
      selected.clear();
      if (names.length === 0) {
        renderRow("暂无选手数据", false);
      } else {
        renderGrid();
      }
    })
    .catch(() => {
      if (signal.aborted) return;
      renderRow("选手数据加载失败", true);
    });

  renderStats();

  // ---- API 交付：getSelected 返回选中名单（按下标升序，卸载后仍可安全调用） ----
  if (typeof props.onReady === "function") {
    try {
      props.onReady({
        getSelected: () => [...selected].sort((a, b) => a - b).map((i) => names[i]),
      });
    } catch (e) {
      console.error("[player-list] onReady 回调抛错:", e);
    }
  }

  // ---- cleanup：解绑监听（fetch 迟到响应经 signal.aborted 守卫不再写 DOM） ----
  return function cleanup() {
    ctrl.abort();
  };
}
