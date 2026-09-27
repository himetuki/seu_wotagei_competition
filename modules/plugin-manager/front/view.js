/**
 * plugin-manager 管理视图（P11-R1 响应式改造）—— petite-vue 细粒度状态驱动 + ctx.api 操作
 *
 * 数据流：refresh() 拉 GET /api/plugins 快照 → 写入 reactive scope → 模板指令自动
 * 更新受影响的文本节点/列表（其余 DOM 不动）。
 *
 * 为什么从"手动全量渲染"改成响应式：旧实现每次 act() 全量重建 DOM，必须靠
 * "焦点快照 + 恢复光标"机器保住搜索框焦点（旧注释：本页关键体验点）；列表筛选、
 * config 草稿（Map）、展开态（Set）全部手工同步。响应式范式下：
 *   · 搜索框 v-model 绑定 → 输入只触发列表 effect 重算，输入框元素不重建 → 焦点/光标天然保持
 *   · config 草稿 drafts / 展开态 openEditors 变成 reactive 对象 → textarea :value 绑定
 *   · act() 后 refresh() 只替换 snapshot → 行级 DOM 经 :key 复用，焦点不丢
 * 旧 render()/renderList()/keepFocus 光标快照机器整体删除（-300 行）。
 *
 * 与旧实现的一处有意偏离：config 草稿仍在「收起」后保留（防误收起丢稿），但
 * textarea 无草稿时始终显示**当前** config（旧实现相同——草稿只在真实输入后产生）。
 *
 * 契约：createManagerView({ root, api, signal }) 返回同步 stop()（kernel cleanup 用）；
 * petite-vue 视图的卸载在 stop() 内经 mountReactiveSafe 的 dispose 完成；静态监听
 * （刷新按钮 / Ctrl+K）仍走 { signal }。模板指令的事件由 petite-vue unmount 统一解绑。
 *
 * 响应式资产约定见 AGENTS §4.3：vendor 构建产物、按需动态加载、CSP 约束（new Function）。
 */

import { icon, iconEl, ICON_NAMES } from "/web/icons.mjs";
import { createReactiveScope, mountReactiveSafe } from "/web/lib/reactive.mjs";

// 静态头部图标水合：index.html 曾自内联 Heroicons/Tabler path（AGENTS §4.1 禁——
// 多份事实来源必然漂移），挂载时统一替换为 /web/icons.mjs 基座图标。
// 尺寸由 style.css 的后代选择器（.pm-brand-icon svg 等）控制，换节点不失效。
function hydrateHeaderIcons(pageShell) {
  const scope = pageShell || document;
  const swaps = [
    [".pm-brand-icon", "box"],
    [".pm-btn--ghost .pm-ic", "arrow-left"],
    ["#pm-refresh .pm-ic", "refresh"],
  ];
  for (const [selector, name] of swaps) {
    const host = scope.querySelector(selector);
    if (!host) continue;
    host.textContent = "";
    const node = iconEl(name);
    if (node) host.append(node);
  }
}

// 筛选 chips（纯前端）
const FILTERS = [
  { key: "all", label: "全部" },
  { key: "mounted", label: "已挂载" },
  { key: "disabled", label: "已禁用" },
  { key: "unmounted", label: "未挂载" },
];

// 视图模板（petite-vue 指令版）。所有类名/内联样式与旧 DOM 渲染逐字一致，
// style.css 零改动。加载/错误占位复用旧 .plugin-placeholder 类。
const TEMPLATE = `
<div class="plugin-placeholder" v-if="loadError">{{ loadError }}</div>
<div class="plugin-placeholder" v-if="!ready && !loadError">正在加载装配快照…</div>
<div class="pm-view" v-if="ready">
  <div class="pm-tabs" role="tablist" aria-label="插件类型" @keydown="onTablistKeydown($event)">
    <button class="pm-tab" type="button" role="tab" aria-controls="pm-tabpanel" data-tab="front"
      :aria-selected="activeTab === 'front' ? 'true' : 'false'"
      :tabindex="activeTab === 'front' ? 0 : -1"
      @click="switchTab('front')">
      <span>前端插件</span><span class="pm-tab-count">{{ snapshot.front.length }}</span>
    </button>
    <button class="pm-tab" type="button" role="tab" aria-controls="pm-tabpanel" data-tab="backend"
      :aria-selected="activeTab === 'backend' ? 'true' : 'false'"
      :tabindex="activeTab === 'backend' ? 0 : -1"
      @click="switchTab('backend')">
      <span>后端插件</span><span class="pm-tab-count">{{ snapshot.backend.length }}</span>
    </button>
  </div>

  <div class="pm-toolbar">
    <div class="pm-search" role="search">
      <label class="sr-only" for="pm-search-input">搜索插件名称或标识</label>
      <span class="pm-search-icon" aria-hidden="true" v-html="iconSvg('search')"></span>
      <input type="search" id="pm-search-input" class="pm-search-input" placeholder="搜索插件名称或标识..."
        autocomplete="off" v-model="query" @keydown.escape="clearQuery($event)">
    </div>
    <div class="pm-chips" role="group" aria-label="状态筛选">
      <button class="pm-chip" type="button" v-for="f in filters" :key="f.key"
        :data-filter="f.key" :aria-pressed="filter === f.key ? 'true' : 'false'"
        @click="setFilter(f.key)">{{ f.label }}</button>
    </div>
    <div class="pm-stats">
      <span class="pm-stat pm-stat--on" :aria-label="'挂载 ' + stats().mounted + ' 个'"><span class="pm-stat-dot"></span><span>挂载</span><span class="pm-stat-num">{{ stats().mounted }}</span></span>
      <span class="pm-stat pm-stat--warn" :aria-label="'禁用 ' + stats().disabled + ' 个'"><span class="pm-stat-dot"></span><span>禁用</span><span class="pm-stat-num">{{ stats().disabled }}</span></span>
      <span class="pm-stat pm-stat--off" :aria-label="'未挂载 ' + stats().unmounted + ' 个'"><span class="pm-stat-dot"></span><span>未挂载</span><span class="pm-stat-num">{{ stats().unmounted }}</span></span>
    </div>
  </div>

  <div class="pm-status" role="status" aria-live="polite" :class="{ 'pm-status--err': statusError }">{{ statusText }}</div>

  <div class="pm-tabpanel" id="pm-tabpanel" role="tabpanel"
    :aria-label="activeTab === 'backend' ? '后端插件列表' : '前端插件列表（页面插件 / 组件插件）'">
    <div class="pm-list" id="pm-list" role="list">
      <!-- 后端 tab -->
      <div class="pm-item" role="listitem" v-for="b in tabRows('backend')" :key="b.id">
        <div class="pm-row">
          <span class="pm-icon" aria-hidden="true" v-html="metaIconSvg(b.icon)"></span>
          <div class="pm-name">
            <div class="pm-item-head"><span class="pm-title">{{ b.name }}</span></div>
            <code class="pm-id">{{ b.id }}</code>
          </div>
          <div class="pm-side">
            <span class="pm-badge" :class="b.kind === 'legacy' ? 'pm-badge--legacy' : 'pm-badge--plugin'">{{ b.kind === 'legacy' ? '后端·legacy' : '后端·插件' }}</span>
            <span class="pm-dot" :class="stateOf(b).cls">{{ stateOf(b).label }}</span>
            <div class="pm-ops">
              <button class="pm-btn pm-btn--sm" type="button" @click="toggleBackend(b)">{{ b.enabled ? '禁用' : '启用' }}</button>
              <button class="pm-btn pm-btn--sm" type="button" v-if="b.kind !== 'legacy'" @click="reloadPlugin(b)">
                <span class="pm-ic" aria-hidden="true" v-html="iconSvg('refresh')"></span><span>重载</span>
              </button>
              <button class="pm-btn pm-btn--sm" type="button" v-if="b.kind !== 'legacy'"
                :data-cfg="b.id" :aria-expanded="openEditors[b.id] ? 'true' : 'false'"
                @click="toggleEditor(b)">{{ openEditors[b.id] ? '收起配置' : '配置' }}</button>
            </div>
          </div>
        </div>
        <div class="pm-error" v-if="b.error">错误：{{ b.error }}</div>
        <div class="pm-config" v-if="openEditors[b.id]">
          <textarea class="pm-config-text" rows="6" :aria-label="'插件 ' + b.id + ' 的 config JSON'"
            :value="draftText(b)" @input="setDraft(b.id, $event.target.value)"></textarea>
          <button class="pm-btn pm-btn--sm pm-btn--primary" type="button" @click="saveConfig(b)">保存配置</button>
        </div>
      </div>
      <div class="pm-empty" v-if="activeTab === 'backend' && !filtered().length">
        <span class="pm-empty-icon" aria-hidden="true" v-html="iconSvg('search')"></span>
        <p class="pm-empty-title">没有匹配的插件</p>
        <p class="pm-empty-hint">试试清空搜索词，或切换「全部」筛选。</p>
      </div>

      <!-- 前端 tab：页面插件组（P11 用户决策 3：搜索/筛选作用于全量，组内保留空态） -->
      <section class="pm-group" role="group" aria-label="页面插件" v-if="activeTab === 'front'">
        <div class="pm-group-head" style="display:flex;align-items:center;gap:10px;margin:18px 4px 6px;flex-wrap:wrap;">
          <span class="pm-tag">页面插件</span>
          <span style="font-size:12px;color:var(--text-muted);">{{ pageRows().length }} 个 · key = 模块 id，内核按 URL 自动渲染</span>
        </div>
        <p class="pm-empty-hint" style="margin:6px 4px 10px;" v-if="!pageRows().length">没有匹配的页面插件</p>
        <div class="pm-item" role="listitem" v-for="f in pageRows()" :key="f.id">
          <div class="pm-row">
            <span class="pm-icon" aria-hidden="true" v-html="metaIconSvg(f.icon)"></span>
            <div class="pm-name">
              <div class="pm-item-head"><span class="pm-title">{{ f.name }}</span></div>
              <code class="pm-id">{{ f.id }}</code>
            </div>
            <div class="pm-side">
              <span class="pm-badge pm-badge--front">前端·页面</span>
              <span class="pm-dot" :class="stateOf(f).cls">{{ stateOf(f).label }}</span>
              <div class="pm-ops">
                <button class="pm-btn pm-btn--sm" type="button" @click="toggleFront(f)">{{ f.enabled ? '禁用' : '启用' }}</button>
                <span class="pm-hint">刷新页面后生效</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 前端 tab：组件插件组 -->
      <section class="pm-group" role="group" aria-label="组件插件" v-if="activeTab === 'front'">
        <div class="pm-group-head" style="display:flex;align-items:center;gap:10px;margin:18px 4px 6px;flex-wrap:wrap;">
          <span class="pm-tag">组件插件</span>
          <span style="font-size:12px;color:var(--text-muted);">{{ compRows().length }} 个 · 注册进组件表，由页面按名取用（永不自动渲染）</span>
        </div>
        <p class="pm-empty-hint" style="margin:6px 4px 10px;" v-if="!compRows().length">没有匹配的组件插件</p>
        <div class="pm-item" role="listitem" v-for="f in compRows()" :key="f.id">
          <div class="pm-row">
            <span class="pm-icon" aria-hidden="true" v-html="metaIconSvg(f.icon)"></span>
            <div class="pm-name">
              <div class="pm-item-head"><span class="pm-title">{{ f.name }}</span></div>
              <code class="pm-id">{{ f.id }}</code>
            </div>
            <div class="pm-side">
              <span class="pm-badge pm-badge--front">前端·组件</span>
              <span class="pm-dot" :class="stateOf(f).cls">{{ stateOf(f).label }}</span>
              <div class="pm-ops">
                <button class="pm-btn pm-btn--sm" type="button" @click="toggleFront(f)">{{ f.enabled ? '禁用' : '启用' }}</button>
                <span class="pm-hint">刷新页面后生效</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="pm-empty" v-if="activeTab === 'front' && !filtered().length">
        <span class="pm-empty-icon" aria-hidden="true" v-html="iconSvg('search')"></span>
        <p class="pm-empty-title">没有匹配的插件</p>
        <p class="pm-empty-hint">试试清空搜索词，或切换「全部」筛选。</p>
      </div>
    </div>
  </div>

  <div class="pm-bar">
    <span class="pm-bar-left">共 {{ snapshot.backend.length }} 个模块 · 前端 {{ snapshot.front.length }} 个条目（页面 {{ snapshot.front.length - componentCount() }} · 组件 {{ componentCount() }}）· 后端 {{ snapshot.backend.length }} 个插件 · 热替换无需重启进程</span>
    <span class="pm-bar-right"><kbd class="pm-kbd">Ctrl</kbd> + <kbd class="pm-kbd">K</kbd> 聚焦搜索 · 修改即时生效</span>
  </div>
</div>
`;

export function createManagerView({ root, api, signal }) {
  let state = null; // reactive scope（异步就绪；全部 helper 经闭包读写，不依赖 this）
  let disposeView = null;
  let disposed = false;
  let statusTimer = null;

  // 页面级「刷新快照」按钮在 header（面板之外，index.html 静态骨架）
  const pageShell = root.closest(".pm-page") || document;
  const refreshButton = pageShell.querySelector("#pm-refresh");
  hydrateHeaderIcons(pageShell);

  /* ---------------- 数据视图（tab / 搜索 / 筛选 / 统计） ---------------- */

  function currentData() {
    if (!state || !state.snapshot) return [];
    return state.activeTab === "backend" ? state.snapshot.backend : state.snapshot.front;
  }

  // 统一状态口径：前端条目无独立 mount 概念，enabled ⇔ 已装配（挂载）
  function stateOf(item) {
    if (state.activeTab === "front") {
      return item.enabled
        ? { key: "mounted", label: "已启用", cls: "pm-dot--on" }
        : { key: "disabled", label: "已禁用", cls: "pm-dot--warn" };
    }
    if (item.mounted) return { key: "mounted", label: "已挂载", cls: "pm-dot--on" };
    if (!item.enabled) return { key: "disabled", label: "已禁用", cls: "pm-dot--warn" };
    return { key: "unmounted", label: "未挂载", cls: "pm-dot--off" };
  }

  // 前端条目分类：显式 kind:"component" → 组件插件；其余 → 页面插件（后端 tab 不使用）
  function kindOf(item) {
    return item && item.kind === "component" ? "component" : "page";
  }

  function matchesQuery(item) {
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    return (
      String(item.name || "").toLowerCase().includes(q) ||
      String(item.id || "").toLowerCase().includes(q)
    );
  }

  function filtered() {
    return currentData().filter((item) => {
      if (!matchesQuery(item)) return false;
      if (state.filter === "all") return true;
      return stateOf(item).key === state.filter;
    });
  }

  // v-for 数据源：非当前 tab 返回空数组（避免 v-if/v-for 同元素冲突，且无需包装层破坏 ARIA）
  function tabRows(tab) {
    return state && state.activeTab === tab ? filtered() : [];
  }
  function pageRows() {
    return filtered().filter((it) => kindOf(it) === "page");
  }
  function compRows() {
    return filtered().filter((it) => kindOf(it) === "component");
  }

  // 统计口径：当前 tab 的完整数据集（不受搜索/筛选影响，保持总览稳定）
  function stats() {
    const s = { mounted: 0, disabled: 0, unmounted: 0 };
    for (const item of currentData()) {
      const k = stateOf(item).key;
      if (k === "mounted") s.mounted++;
      else if (k === "disabled") s.disabled++;
      else s.unmounted++;
    }
    return s;
  }

  // 页脚口径（与旧实现一致）：恒从**前端数组**统计组件条目，不随当前 tab 切换
  function componentCount() {
    if (!state || !state.snapshot) return 0;
    return state.snapshot.front.filter((it) => kindOf(it) === "component").length;
  }

  /* ---------------- 状态行 / 操作出口 ---------------- */

  function setStatus(text, isError) {
    state.statusText = text || "";
    state.statusError = !!isError;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = null;
    if (text) statusTimer = setTimeout(() => setStatus(""), 6000);
  }

  async function refresh() {
    if (!state) return;
    try {
      state.snapshot = await api.get("/api/plugins");
      state.ready = true;
      state.loadError = "";
    } catch (e) {
      state.loadError = `装配快照读取失败：${e.message}（插件装配服务未就绪，请重启服务）`;
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

  /* ---------------- 模板指令引用的操作 ---------------- */

  function switchTab(key) {
    if (state.activeTab !== key) state.activeTab = key;
  }

  function setFilter(key) {
    if (state.filter !== key) state.filter = key;
  }

  function clearQuery(e) {
    if (!state.query) return;
    e.preventDefault();
    state.query = "";
  }

  // tablist 左右方向键切换（roving tabindex 焦点跟随）
  function onTablistKeydown(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    switchTab(state.activeTab === "backend" ? "front" : "backend");
    const next = root.querySelector(`.pm-tab[data-tab="${state.activeTab}"]`);
    if (next) next.focus();
  }

  function toggleBackend(b) {
    act(
      api.post(`/api/plugins/${encodeURIComponent(b.id)}/toggle`, { enabled: !b.enabled }),
      b.enabled ? "已禁用" : "已启用"
    );
  }

  function reloadPlugin(b) {
    act(api.post(`/api/plugins/${encodeURIComponent(b.id)}/reload`), "已热重载");
  }

  function toggleFront(f) {
    act(
      api.post(`/api/plugins/front/${encodeURIComponent(f.id)}/toggle`, { enabled: !f.enabled }),
      f.enabled ? "前端插件已停用" : "前端插件已启用"
    );
  }

  function toggleEditor(b) {
    if (state.openEditors[b.id]) delete state.openEditors[b.id];
    else state.openEditors[b.id] = true;
  }

  // 草稿优先，无草稿显示当前 config（与旧渲染语义一致：草稿只在真实输入后产生）
  function draftText(b) {
    if (state.drafts[b.id] !== undefined) return state.drafts[b.id];
    return JSON.stringify(b.config ?? null, null, 2);
  }

  function setDraft(id, value) {
    state.drafts[id] = value;
  }

  function saveConfig(b) {
    let parsed;
    try {
      parsed = JSON.parse(draftText(b));
    } catch (err) {
      setStatus(`配置 JSON 解析失败：${err.message}`, true);
      return;
    }
    delete state.drafts[b.id];
    act(
      api.post(`/api/plugins/${encodeURIComponent(b.id)}/config`, { config: parsed }),
      "配置已保存并热重装"
    );
  }

  function iconSvg(name) {
    return icon(name);
  }

  // 插件元数据图标；非内置图标名（含历史 emoji）回退 puzzle
  function metaIconSvg(name) {
    return icon(ICON_NAMES.includes(name) ? name : "puzzle", { size: 22 });
  }

  /* ---------------- 启动 / 清理 ---------------- */

  // 静态监听（不依赖 reactive state，signal 契约不变）
  if (refreshButton) {
    refreshButton.addEventListener("click", () => refresh(), { signal });
  }
  // Ctrl+K / Cmd+K 聚焦搜索（搜索框由模板挂出，未就绪时 querySelector 落空即跳过）
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

  (async () => {
    state = await createReactiveScope({
      ready: false,
      loadError: "",
      snapshot: null,
      activeTab: "backend", // 默认后端（设计稿默认）
      query: "",
      filter: "all",
      statusText: "",
      statusError: false,
      drafts: {}, // 插件 id → config textarea 草稿（reactive，替代旧 Map）
      openEditors: {}, // 展开中的 config 编辑器 id（reactive，替代旧 Set）
      filters: FILTERS,
      // 方法直挂（闭包引用 state，不依赖 this 绑定）
      refresh,
      stateOf,
      kindOf,
      filtered,
      tabRows,
      pageRows,
      compRows,
      stats,
      componentCount,
      draftText,
      setDraft,
      toggleBackend,
      reloadPlugin,
      toggleEditor,
      saveConfig,
      toggleFront,
      switchTab,
      setFilter,
      clearQuery,
      onTablistKeydown,
      iconSvg,
      metaIconSvg,
    });
    if (disposed) return;
    disposeView = mountReactiveSafe(root, { template: TEMPLATE, scope: state });
    await refresh();
  })().catch((e) => console.error("[plugin-manager] 响应式视图初始化失败:", e));

  return function stop() {
    disposed = true;
    if (disposeView) disposeView();
    if (statusTimer) clearTimeout(statusTimer);
  };
}
