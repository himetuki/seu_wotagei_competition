/**
 * plugin-manager 管理视图（UI 重设计）—— 纯 DOM 渲染 + ctx.api 操作，零 cordis 直接依赖
 *
 * 数据流：refresh() 拉 GET /api/plugins 快照 → render()；
 * 操作（toggle/reload/config/front toggle）→ act() 提交 → 状态行反馈 → refresh()。
 *
 * 重渲染保焦：config 编辑草稿（drafts）、展开态（openEditors）存组件闭包，不依赖 DOM 存活；
 * 列表筛选状态（activeTab / query / filter）同样存闭包。搜索框、tab、筛选 chip 在重渲染后
 * 按需恢复焦点与光标位置（否则每次 act() 全量重渲染会丢焦点，是本页关键体验点）。
 *
 * 全部 addEventListener 一律传 { signal }（P3 cleanup 契约）。
 */

import { icon, ICON_NAMES } from "/web/icons.mjs";

// 本页功能性线性图标（Heroicons 风格，内联 SVG）；插件元数据图标统一走 /web/icons.mjs
const ICONS = {
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>',
  refresh:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.023 9.348h4.992M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>',
  empty:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>',
};

// 筛选 chips（纯前端）
const FILTERS = [
  { key: "all", label: "全部" },
  { key: "mounted", label: "已挂载" },
  { key: "disabled", label: "已禁用" },
  { key: "unmounted", label: "未挂载" },
];

export function createManagerView({ root, api, signal }) {
  let snapshot = null; // 最近一次装配快照（GET /api/plugins）
  let statusTimer = null;
  let statusText = ""; // 状态行文案（跨重渲染保留，否则 act() 的反馈会被紧随的 refresh 渲染清掉）
  let statusError = false;
  let activeTab = "backend"; // "backend" | "front"，默认后端（设计稿默认）
  let query = ""; // 搜索词（name / id 子串，大小写不敏感）
  let filter = "all"; // all | mounted | disabled | unmounted
  const drafts = new Map(); // 插件 id → config textarea 草稿
  const openEditors = new Set(); // 展开中的 config 编辑器 id

  // 页面级「刷新快照」按钮在 header（面板之外，index.html 静态骨架）
  const pageShell = root.closest(".pm-page") || document;
  const refreshButton = pageShell.querySelector("#pm-refresh");

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function iconSpan(html, className) {
    const span = el("span", className || "pm-ic");
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = html;
    return span;
  }

  // 插件元数据图标方块（.pm-icon 44px 容器）；非内置图标名（含历史 emoji）回退 puzzle
  function metaIcon(name) {
    const box = el("span", "pm-icon");
    box.innerHTML = icon(ICON_NAMES.includes(name) ? name : "puzzle", { size: 22 });
    return box;
  }

  function paintStatus() {
    const bar = root.querySelector(".pm-status");
    if (!bar) return;
    bar.textContent = statusText;
    bar.classList.toggle("pm-status--err", statusError);
  }

  function setStatus(text, isError) {
    statusText = text || "";
    statusError = !!isError;
    paintStatus();
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = null;
    if (text) statusTimer = setTimeout(() => setStatus(""), 6000);
  }

  async function refresh() {
    try {
      snapshot = await api.get("/api/plugins");
      render();
    } catch (e) {
      root.innerHTML = "";
      root.append(
        el("div", "plugin-placeholder", `装配快照读取失败：${e.message}（插件装配服务未就绪，请重启服务）`)
      );
    }
  }

  // 操作统一出口：r.ok → 状态行成功反馈（含 hint/persisted 提示）；否则红色错误
  async function act(promise, okText) {
    try {
      const r = await promise;
      if (r && r.ok) {
        let msg = okText || "操作成功";
        if (r.hint) msg += `（${r.hint}）`;
        if (r.persisted === false) msg += "；注意：清单写入磁盘失败（本次进程内已生效，请检查目录写权限）";
        setStatus(msg);
      } else {
        setStatus((r && (r.error || r.hint)) || "操作失败", true);
      }
      await refresh();
    } catch (e) {
      setStatus(e.message, true);
    }
  }

  /* ---------------- 数据视图（tab / 搜索 / 筛选 / 统计） ---------------- */

  function currentData() {
    if (!snapshot) return [];
    return activeTab === "backend" ? snapshot.backend : snapshot.front;
  }

  // 统一状态口径：前端条目无独立 mount 概念，enabled ⇔ 已装配（挂载）
  function stateOf(item) {
    if (activeTab === "front") {
      return item.enabled
        ? { key: "mounted", label: "已启用", cls: "pm-dot--on" }
        : { key: "disabled", label: "已禁用", cls: "pm-dot--warn" };
    }
    if (item.mounted) return { key: "mounted", label: "已挂载", cls: "pm-dot--on" };
    if (!item.enabled) return { key: "disabled", label: "已禁用", cls: "pm-dot--warn" };
    return { key: "unmounted", label: "未挂载", cls: "pm-dot--off" };
  }

  function matchesQuery(item) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      String(item.name || "").toLowerCase().includes(q) ||
      String(item.id || "").toLowerCase().includes(q)
    );
  }

  function computeFiltered() {
    return currentData().filter((item) => {
      if (!matchesQuery(item)) return false;
      if (filter === "all") return true;
      return stateOf(item).key === filter;
    });
  }

  // 统计口径：当前 tab 的完整数据集（不受搜索/筛选影响，保持总览稳定）
  function computeStats() {
    let mounted = 0;
    let disabled = 0;
    let unmounted = 0;
    for (const item of currentData()) {
      const k = stateOf(item).key;
      if (k === "mounted") mounted++;
      else if (k === "disabled") disabled++;
      else unmounted++;
    }
    return { mounted, disabled, unmounted };
  }

  /* ---------------- 渲染 ---------------- */

  function statEl(kind, label, num) {
    const wrap = el("span", `pm-stat pm-stat--${kind}`);
    wrap.setAttribute("aria-label", `${label} ${num} 个`);
    wrap.append(el("span", "pm-stat-dot"), el("span", null, label), el("span", "pm-stat-num", String(num)));
    return wrap;
  }

  function tabsBar() {
    const wrap = el("div", "pm-tabs");
    wrap.setAttribute("role", "tablist");
    wrap.setAttribute("aria-label", "插件类型");
    const defs = [
      { key: "front", label: "前端插件", count: snapshot.front.length },
      { key: "backend", label: "后端插件", count: snapshot.backend.length },
    ];
    for (const d of defs) {
      const btn = el("button", "pm-tab");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.dataset.tab = d.key;
      btn.setAttribute("aria-controls", "pm-tabpanel");
      btn.setAttribute("aria-selected", String(activeTab === d.key));
      btn.tabIndex = activeTab === d.key ? 0 : -1;
      btn.append(el("span", null, d.label), el("span", "pm-tab-count", String(d.count)));
      btn.addEventListener(
        "click",
        () => {
          if (activeTab === d.key) return;
          activeTab = d.key;
          render();
          const next = root.querySelector(`.pm-tab[data-tab="${d.key}"]`);
          if (next) next.focus();
        },
        { signal }
      );
      wrap.append(btn);
    }
    // tablist 左右方向键切换
    wrap.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        activeTab = activeTab === "backend" ? "front" : "backend";
        render();
        const next = root.querySelector(`.pm-tab[data-tab="${activeTab}"]`);
        if (next) next.focus();
      },
      { signal }
    );
    return wrap;
  }

  function toolbar() {
    const bar = el("div", "pm-toolbar");

    // 搜索框
    const search = el("div", "pm-search");
    search.setAttribute("role", "search");
    const label = el("label", "sr-only", "搜索插件名称或标识");
    label.setAttribute("for", "pm-search-input");
    const input = document.createElement("input");
    input.type = "search";
    input.id = "pm-search-input";
    input.className = "pm-search-input";
    input.placeholder = "搜索插件名称或标识...";
    input.autocomplete = "off";
    input.value = query;
    input.addEventListener(
      "input",
      () => {
        query = input.value;
        renderList(); // 局部重渲染：保住输入焦点与光标
      },
      { signal }
    );
    input.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && input.value) {
          e.preventDefault();
          query = "";
          input.value = "";
          renderList();
        }
      },
      { signal }
    );
    search.append(label, iconSpan(ICONS.search, "pm-search-icon"), input);

    // 筛选 chips
    const chips = el("div", "pm-chips");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "状态筛选");
    for (const f of FILTERS) {
      const chip = el("button", "pm-chip", f.label);
      chip.type = "button";
      chip.dataset.filter = f.key;
      chip.setAttribute("aria-pressed", String(filter === f.key));
      chip.addEventListener(
        "click",
        () => {
          if (filter === f.key) return;
          filter = f.key;
          render();
          const next = root.querySelector(`.pm-chip[data-filter="${f.key}"]`);
          if (next) next.focus();
        },
        { signal }
      );
      chips.append(chip);
    }

    // 统计
    const stats = el("div", "pm-stats");
    const s = computeStats();
    stats.append(
      statEl("on", "挂载", s.mounted),
      statEl("warn", "禁用", s.disabled),
      statEl("off", "未挂载", s.unmounted)
    );

    bar.append(search, chips, stats);
    return bar;
  }

  function updateStats() {
    const s = computeStats();
    const map = [
      [".pm-stat--on .pm-stat-num", s.mounted],
      [".pm-stat--warn .pm-stat-num", s.disabled],
      [".pm-stat--off .pm-stat-num", s.unmounted],
    ];
    for (const [sel, num] of map) {
      const node = root.querySelector(sel);
      if (node) node.textContent = String(num);
    }
  }

  function nameBox(name, id) {
    const box = el("div", "pm-name");
    const head = el("div", "pm-item-head");
    head.append(el("span", "pm-title", name));
    box.append(head, el("code", "pm-id", id));
    return box;
  }

  function backendOps(b) {
    const ops = el("div", "pm-ops");

    const toggleBtn = el("button", "pm-btn pm-btn--sm", b.enabled ? "禁用" : "启用");
    toggleBtn.type = "button";
    toggleBtn.addEventListener(
      "click",
      () =>
        act(
          api.post(`/api/plugins/${encodeURIComponent(b.id)}/toggle`, { enabled: !b.enabled }),
          b.enabled ? "已禁用" : "已启用"
        ),
      { signal }
    );
    ops.append(toggleBtn);

    if (b.kind !== "legacy") {
      const reloadBtn = el("button", "pm-btn pm-btn--sm");
      reloadBtn.type = "button";
      reloadBtn.append(iconSpan(ICONS.refresh), el("span", null, "重载"));
      reloadBtn.addEventListener(
        "click",
        () => act(api.post(`/api/plugins/${encodeURIComponent(b.id)}/reload`), "已热重载"),
        { signal }
      );

      const open = openEditors.has(b.id);
      const cfgBtn = el("button", "pm-btn pm-btn--sm", open ? "收起配置" : "配置");
      cfgBtn.type = "button";
      cfgBtn.dataset.cfg = b.id;
      cfgBtn.setAttribute("aria-expanded", String(open));
      cfgBtn.addEventListener(
        "click",
        () => {
          if (openEditors.has(b.id)) openEditors.delete(b.id);
          else openEditors.add(b.id);
          render();
          const next = root.querySelector(`.pm-btn[data-cfg="${CSS.escape(b.id)}"]`);
          if (next) next.focus();
        },
        { signal }
      );

      ops.append(reloadBtn, cfgBtn);
    }
    return ops;
  }

  function configEditor(b) {
    const editor = el("div", "pm-config");
    const ta = el("textarea", "pm-config-text");
    ta.rows = 6;
    ta.setAttribute("aria-label", `插件 ${b.id} 的 config JSON`);
    ta.value = drafts.has(b.id) ? drafts.get(b.id) : JSON.stringify(b.config ?? null, null, 2);
    ta.addEventListener("input", () => drafts.set(b.id, ta.value), { signal });

    const save = el("button", "pm-btn pm-btn--sm pm-btn--primary", "保存配置");
    save.type = "button";
    save.addEventListener(
      "click",
      () => {
        let parsed;
        try {
          parsed = JSON.parse(ta.value);
        } catch (err) {
          setStatus(`配置 JSON 解析失败：${err.message}`, true);
          return;
        }
        drafts.delete(b.id);
        act(
          api.post(`/api/plugins/${encodeURIComponent(b.id)}/config`, { config: parsed }),
          "配置已保存并热重装"
        );
      },
      { signal }
    );
    editor.append(ta, save);
    return editor;
  }

  function backendItem(b) {
    const item = el("div", "pm-item");
    item.setAttribute("role", "listitem");
    const row = el("div", "pm-row");
    const st = stateOf(b);
    const side = el("div", "pm-side");
    side.append(
      el(
        "span",
        `pm-badge pm-badge--${b.kind === "legacy" ? "legacy" : "plugin"}`,
        b.kind === "legacy" ? "后端·legacy" : "后端·插件"
      ),
      el("span", `pm-dot ${st.cls}`, st.label),
      backendOps(b)
    );
    row.append(metaIcon(b.icon), nameBox(b.name, b.id), side);
    item.append(row);

    if (b.error) item.append(el("div", "pm-error", `错误：${b.error}`));
    if (openEditors.has(b.id)) item.append(configEditor(b));
    return item;
  }

  function frontItem(f) {
    const item = el("div", "pm-item");
    item.setAttribute("role", "listitem");
    const row = el("div", "pm-row");
    const st = stateOf(f);

    const ops = el("div", "pm-ops");
    const btn = el("button", "pm-btn pm-btn--sm", f.enabled ? "禁用" : "启用");
    btn.type = "button";
    btn.addEventListener(
      "click",
      () =>
        act(
          api.post(`/api/plugins/front/${encodeURIComponent(f.id)}/toggle`, {
            enabled: !f.enabled,
          }),
          f.enabled ? "前端插件已停用" : "前端插件已启用"
        ),
      { signal }
    );
    ops.append(btn, el("span", "pm-hint", "刷新页面后生效"));

    const side = el("div", "pm-side");
    side.append(el("span", "pm-badge pm-badge--front", "前端·界面"), el("span", `pm-dot ${st.cls}`, st.label), ops);
    row.append(metaIcon(f.icon), nameBox(f.name, f.id), side);
    item.append(row);
    return item;
  }

  function emptyState() {
    const box = el("div", "pm-empty");
    box.append(
      iconSpan(ICONS.empty, "pm-empty-icon"),
      el("p", "pm-empty-title", "没有匹配的插件"),
      el("p", "pm-empty-hint", "试试清空搜索词，或切换「全部」筛选。")
    );
    return box;
  }

  function renderList() {
    const list = root.querySelector(".pm-list");
    if (!list) return;
    const data = computeFiltered();
    list.innerHTML = "";
    if (!data.length) {
      list.append(emptyState());
    } else {
      for (const item of data) {
        list.append(activeTab === "backend" ? backendItem(item) : frontItem(item));
      }
    }
    updateStats();
  }

  function footerBar() {
    const bar = el("div", "pm-bar");
    // 计数口径：模块数 = 后端条目数（每个模块一对插件），前端为同批模块的界面侧条目，
    // 故不相加（相加会得到 2× 模块数的误导性总数）。
    const b = snapshot.backend.length;
    const f = snapshot.front.length;
    bar.append(
      el("span", "pm-bar-left", `共 ${b} 个模块 · 前后端各 ${f} 个插件 · 热替换无需重启进程`)
    );

    const right = el("span", "pm-bar-right");
    right.append(
      el("kbd", "pm-kbd", "Ctrl"),
      document.createTextNode(" + "),
      el("kbd", "pm-kbd", "K"),
      document.createTextNode(" 聚焦搜索 · 修改即时生效")
    );
    bar.append(right);
    return bar;
  }

  function render() {
    if (!snapshot) return;

    // 全量重建前记录搜索框焦点（重渲染后恢复，避免丢焦点/丢光标）
    const focused = document.activeElement;
    const keepFocus = !!(focused && focused.classList && focused.classList.contains("pm-search-input"));
    const selStart = keepFocus ? focused.selectionStart : 0;
    const selEnd = keepFocus ? focused.selectionEnd : 0;

    root.innerHTML = "";

    const view = el("div", "pm-view");
    const status = el("div", "pm-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const panel = el("div", "pm-tabpanel");
    panel.id = "pm-tabpanel";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-label", activeTab === "backend" ? "后端插件列表" : "前端插件列表");

    const list = el("div", "pm-list");
    list.id = "pm-list";
    list.setAttribute("role", "list");
    panel.append(list);

    view.append(tabsBar(), toolbar(), status, panel, footerBar());
    root.append(view);

    paintStatus();
    renderList();

    if (keepFocus) {
      const input = root.querySelector(".pm-search-input");
      if (input) {
        input.focus();
        try {
          input.setSelectionRange(selStart, selEnd);
        } catch {
          /* type=search 在部分浏览器不支持 setSelectionRange，忽略 */
        }
      }
    }
  }

  /* ---------------- 启动 / 清理 ---------------- */

  if (refreshButton) {
    refreshButton.addEventListener("click", () => refresh(), { signal });
  }

  // Ctrl+K / Cmd+K 聚焦搜索
  document.addEventListener(
    "keydown",
    (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        const input = root.querySelector(".pm-search-input");
        if (input) {
          input.focus();
          input.select();
        }
      }
    },
    { signal }
  );

  refresh();
  return function stop() {
    if (statusTimer) clearTimeout(statusTimer);
  };
}
