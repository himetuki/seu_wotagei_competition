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
 * 主题 tab（组视图）：主题 = 插件组——核心条目 component-theme-<gid> + 成员条目
 * component-<gid>-* 归为一张组卡（默认主题为无插件的虚拟组卡，恒排最前）。组卡
 * 头部：设为系统主题（PUT /api/theme/active）/ 启用整组 / 禁用整组（串行逐个
 * toggle，防清单写盘竞态）/ 展开收起；展开体逐行管理核心与成员插件。
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
    <button class="pm-tab" type="button" role="tab" aria-controls="pm-tabpanel" data-tab="theme"
      :aria-selected="activeTab === 'theme' ? 'true' : 'false'"
      :tabindex="activeTab === 'theme' ? 0 : -1"
      @click="switchTab('theme')">
      <span>主题插件</span><span class="pm-tab-count">{{ themeEntryCount() }}</span>
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
    :aria-label="activeTab === 'backend' ? '后端插件列表' : activeTab === 'theme' ? '主题插件组列表（核心 component-theme-* + 成员组件）' : '前端插件列表（页面插件 / 组件插件）'">
    <div class="pm-list" id="pm-list" role="list">
      <!-- 后端 tab -->
      <div class="pm-item" role="listitem" v-for="b in tabRows('backend')" :key="b.id">
        <div class="pm-row">
          <span class="pm-icon" aria-hidden="true" v-html="metaIconSvg(b.icon)"></span>
          <div class="pm-name">
            <div class="pm-item-head"><span class="pm-title">{{ displayName(b) }}</span></div>
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
              <div class="pm-item-head"><span class="pm-title">{{ displayName(f) }}</span></div>
              <code class="pm-id">{{ f.id }}</code>
            </div>
            <div class="pm-side">
              <span class="pm-badge pm-badge--front">前端·页面</span>
              <span class="pm-dot" :class="stateOf(f).cls">{{ stateOf(f).label }}</span>
              <div class="pm-ops">
                <button class="pm-btn pm-btn--sm" type="button" :disabled="groupBusy" @click="toggleFront(f)">{{ f.enabled ? '禁用' : '启用' }}</button>
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
              <div class="pm-item-head"><span class="pm-title">{{ displayName(f) }}</span></div>
              <code class="pm-id">{{ f.id }}</code>
            </div>
            <div class="pm-side">
              <span class="pm-badge pm-badge--front">前端·组件</span>
              <span class="pm-dot" :class="stateOf(f).cls">{{ stateOf(f).label }}</span>
              <div class="pm-ops">
                <button class="pm-btn pm-btn--sm" type="button" :disabled="groupBusy" @click="toggleFront(f)">{{ f.enabled ? '禁用' : '启用' }}</button>
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

      <!-- 主题 tab：主题插件组（核心 component-theme-* + 成员 component-<gid>-*；默认组为虚拟卡） -->
      <section class="pm-group" role="group" aria-label="主题插件组" v-if="activeTab === 'theme'">
        <div class="pm-group-head" style="display:flex;align-items:center;gap:10px;margin:18px 4px 6px;flex-wrap:wrap;">
          <span class="pm-tag">主题插件组</span>
          <span style="font-size:12px;color:var(--text-muted);">当前系统主题：<b>{{ activeThemeLabel() }}</b> · 切换与预览请前往 <a href="/m/theme-manager/">主题管理</a></span>
        </div>
        <section class="pm-tg-card" role="group" :aria-label="'主题组：' + g.name" v-for="g in visibleThemeGroups()" :key="g.gid">
          <div class="pm-tg-head">
            <button class="pm-tg-toggle" type="button"
              :aria-expanded="groupOpen[g.gid] ? 'true' : 'false'"
              :aria-controls="'pm-tg-body-' + g.gid"
              @click="toggleGroupOpen(g.gid)">
              <span class="pm-icon" aria-hidden="true" v-html="metaIconSvg(g.icon)"></span>
              <span class="pm-name">
                <span class="pm-item-head">
                  <span class="pm-title">{{ g.name }}</span>
                  <span class="pm-badge pm-badge--legacy" v-if="g.gid === activeTheme">当前主题</span>
                </span>
                <code class="pm-id" v-if="!g.isDefault && g.core">{{ g.core.id }}</code>
                <span class="pm-tg-count">{{ g.isDefault ? '虚拟组 · 无插件条目' : '已启用 ' + groupEnabledCount(g) + ' / 共 ' + groupTotalCount(g) }}</span>
              </span>
              <span class="pm-tg-chevron" aria-hidden="true" v-html="iconSvg(groupOpen[g.gid] ? 'chevron-down' : 'chevron-right')"></span>
            </button>
            <div class="pm-ops">
              <button class="pm-btn pm-btn--sm" type="button" :disabled="g.gid === activeTheme || groupBusy" @click="setActiveTheme(g.gid)">设为系统主题</button>
              <button class="pm-btn pm-btn--sm" type="button" v-if="!g.isDefault" :disabled="groupBusy" @click="toggleThemeGroup(g, true)">启用整组</button>
              <button class="pm-btn pm-btn--sm" type="button" v-if="!g.isDefault" :disabled="groupBusy" @click="toggleThemeGroup(g, false)">禁用整组</button>
            </div>
          </div>
          <div class="pm-tg-body" v-if="groupOpen[g.gid]" :id="'pm-tg-body-' + g.gid">
            <div v-if="g.isDefault" style="padding:4px 8px;">
              <p class="pm-empty-hint">本组无插件：默认皮肤由各页面自带，停用全部主题插件即回到默认外观。</p>
            </div>
            <div v-if="!g.isDefault">
              <div class="pm-item" role="listitem" v-for="m in groupRows(g)" :key="m.id">
                <div class="pm-row">
                  <span class="pm-icon" aria-hidden="true" v-html="metaIconSvg(m.icon)"></span>
                  <div class="pm-name">
                    <div class="pm-item-head">
                      <span class="pm-tag">{{ g.core && m.id === g.core.id ? '主题核心' : '组件成员' }}</span>
                      <span class="pm-title">{{ displayName(m) }}</span>
                    </div>
                    <code class="pm-id">{{ m.id }}</code>
                  </div>
                  <div class="pm-side">
                    <span class="pm-dot" :class="stateOf(m).cls">{{ stateOf(m).label }}</span>
                    <div class="pm-ops">
                      <button class="pm-btn pm-btn--sm" type="button" :disabled="groupBusy" @click="toggleFront(m)">{{ m.enabled ? '禁用' : '启用' }}</button>
                      <span class="pm-hint">刷新页面后生效</span>
                    </div>
                  </div>
                </div>
              </div>
              <p class="pm-empty-hint" style="padding:4px 8px;" v-if="!groupRows(g).length">当前搜索词或状态筛选下没有可见的组成员行。</p>
            </div>
          </div>
        </section>
        <p class="pm-empty-hint" style="margin:10px 4px;" v-if="!snapshot.front.some(isThemeEntry)">
          自建主题：新建 modules/component-theme-&lt;id&gt;/ 组件插件并登记 web/front.json，本页与主题管理页都会自动出现（见主题管理页内指南）。
        </p>
      </section>

      <div class="pm-empty" v-if="activeTab === 'theme' && !visibleThemeGroups().length">
        <span class="pm-empty-icon" aria-hidden="true" v-html="iconSvg('search')"></span>
        <p class="pm-empty-title">没有匹配的主题插件</p>
        <p class="pm-empty-hint">试试清空搜索词，或切换「全部」筛选。</p>
      </div>
    </div>
  </div>

  <div class="pm-bar">
    <span class="pm-bar-left">共 {{ snapshot.backend.length }} 个模块 · 前端 {{ snapshot.front.length }} 个条目（页面 {{ snapshot.front.length - componentCount() }} · 组件 {{ componentCount() }} · 主题 {{ themeGroups().length }} 组）· 后端 {{ snapshot.backend.length }} 个插件 · 热替换无需重启进程</span>
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
    if (state.activeTab === "backend") return state.snapshot.backend;
    if (state.activeTab === "theme") return themeGroupEntries();
    return state.snapshot.front;
  }

  // 统一状态口径：前端条目无独立 mount 概念，enabled ⇔ 已装配（挂载）
  function stateOf(item) {
    if (state.activeTab !== "backend") {
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
      String(item.label || "").toLowerCase().includes(q) ||
      String(item.id || "").toLowerCase().includes(q)
    );
  }

  // 显示名：清单 label（中文名，见 front.json/plugins.json 条目声明）优先，
  // 缺省回退投影 name（页面模块 = modules.json 中文名；组件类 = 原始 id）
  function displayName(item) {
    return (item && (item.label || item.name)) || "";
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

  /* ---------------- 主题插件 tab 数据（组模型） ---------------- */

  // 主题组识别口径（与主题管理页的发现约定一致：主题以组件插件形态存在，注册名
  // theme:<id>）：核心 = id 匹配 component-theme-<gid>，gid 形态与 theme-manager
  // PUT /api/theme/active 的校验同口径（小写字母开头的 kebab-case，≤40 字符）；
  // 成员 = 同清单中 id 以 component-<gid>- 开头、且不属于任何核心的条目（如
  // component-neon-penlights 属 neon 组）。默认主题 = 虚拟组（无插件条目）。
  const THEME_PREFIX = "component-theme-";
  const THEME_CORE_RE = /^component-theme-([a-z][a-z0-9-]{0,39})$/;

  function isThemeEntry(item) {
    return !!item && String(item.id || "").startsWith(THEME_PREFIX);
  }

  // 组模型（默认组恒排最前，主题组按核心条目出现序）。成员归属**最长前缀优先**：
  // 嵌套 gid（如 neon 与 neon-dark）下 component-neon-dark-x 应归 neon-dark 而非
  // neon；claimed 仅防同一条目被重复归属（核心已被收录，天然不会被当成成员）。
  // 显式声明（可选）：核心条目 group = { name, members }——name 为组显示名
  //（缺省回退 gid）；members 为显式成员 id 数组（适配命名约定覆盖不到的成员，
  // 如跨目录/不合前缀），存在且在清单中的条目并入该组（约定发现的成员照常保留，
  // 两路并集去重）。
  function themeGroups() {
    if (!state || !state.snapshot) return [];
    const front = state.snapshot.front || [];
    const byId = {};
    for (const entry of front) byId[String(entry.id || "")] = entry;
    const claimed = new Set();
    const groups = [
      { gid: "default", name: "默认主题", icon: "box", isDefault: true, core: null, members: [] },
    ];
    for (const entry of front) {
      const m = THEME_CORE_RE.exec(String(entry.id || ""));
      if (!m) continue;
      claimed.add(entry.id);
      const declared = entry.group && typeof entry.group === "object" ? entry.group : {};
      groups.push({
        gid: m[1],
        name: typeof declared.name === "string" && declared.name ? declared.name : m[1],
        icon: "sparkles",
        isDefault: false,
        core: entry,
        members: [],
      });
    }
    const themeCores = groups.filter((g) => !g.isDefault);
    for (const entry of front) {
      const id = String(entry.id || "");
      if (claimed.has(id)) continue;
      let best = null;
      let bestLen = 0;
      for (const g of themeCores) {
        const prefix = `component-${g.gid}-`;
        if (id.startsWith(prefix) && prefix.length > bestLen) {
          best = g;
          bestLen = prefix.length;
        }
      }
      if (best) {
        claimed.add(id);
        best.members.push(entry);
      }
    }
    // 显式 members 并入（约定发现之后的补充；已归属/清单中不存在的 id 跳过）
    for (const g of themeCores) {
      const declared = g.core && g.core.group && Array.isArray(g.core.group.members)
        ? g.core.group.members
        : [];
      for (const id of declared) {
        if (typeof id !== "string" || claimed.has(id)) continue;
        const entry = byId[id];
        if (!entry) continue;
        claimed.add(id);
        g.members.push(entry);
      }
    }
    return groups;
  }

  // 全部主题组条目（核心+成员，虚拟默认组不计入）；tab 徽标与统计 chips 口径
  function themeGroupEntries() {
    const out = [];
    for (const g of themeGroups()) {
      if (g.core) out.push(g.core);
      out.push(...g.members);
    }
    return out;
  }

  function themeEntryCount() {
    return themeGroupEntries().length;
  }

  // —— 搜索/筛选与组卡的合成规则 ——
  // · 搜索：组 id（或默认组名）命中、或核心/任一成员命中 → 组卡保留；未命中的
  //   行隐藏；零命中的组卡隐藏。
  // · 状态筛选 chips 只作用于行可见性，组卡头部不受影响；「全部」下组卡恒显。
  function groupMatchesQuery(g) {
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    if (g.isDefault) return "default".includes(q) || "默认主题".includes(q);
    if (String(g.gid).toLowerCase().includes(q)) return true;
    return [g.core, ...g.members].some((it) => it && matchesQuery(it));
  }

  function groupRowVisible(item) {
    if (state.query.trim() && !matchesQuery(item)) return false;
    if (state.filter === "all") return true;
    return stateOf(item).key === state.filter;
  }

  // 组卡 v-for 数据源：仅主题 tab 激活时给值（只做搜索过滤，状态筛选不摘组卡）
  function visibleThemeGroups() {
    if (!state || state.activeTab !== "theme") return [];
    return themeGroups().filter(groupMatchesQuery);
  }

  // 展开体行数据源：核心行在前、成员行随后，逐行过搜索 + 状态筛选
  function groupRows(g) {
    if (!state || state.activeTab !== "theme") return [];
    const rows = [];
    for (const it of [g.core, ...g.members]) {
      if (it && groupRowVisible(it)) rows.push(it);
    }
    return rows;
  }

  // 成员统计（x 含核心）
  function groupEnabledCount(g) {
    return [g.core, ...g.members].filter(Boolean).filter((it) => it.enabled).length;
  }

  function groupTotalCount(g) {
    return [g.core, ...g.members].filter(Boolean).length;
  }

  function activeThemeLabel() {
    if (!state.activeTheme) return "未知（主题服务不可用）";
    return state.activeTheme === "default" ? "默认（default）" : state.activeTheme;
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
      const msg = `装配快照读取失败：${e.message}（插件装配服务未就绪，请重启服务）`;
      if (state.ready) {
        // 已就绪后失败：错误走状态行，避免与完整视图同屏叠显
        setStatus(msg, true);
      } else {
        state.loadError = msg;
      }
    }
    // 当前系统主题（theme-manager 的系统级偏好；服务不可用时保持"未知"不阻塞本页）
    try {
      const t = await api.get("/api/theme/active");
      state.activeTheme = t && typeof t.active === "string" ? t.active : "";
    } catch (e) {
      state.activeTheme = "";
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

  // tablist 左右方向键切换（roving tabindex 焦点跟随；三 tab 环形循环，顺序 = DOM 视觉序）
  const TAB_ORDER = ["front", "backend", "theme"];

  function onTablistKeydown(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const idx = TAB_ORDER.indexOf(state.activeTab);
    const dir = e.key === "ArrowRight" ? 1 : TAB_ORDER.length - 1;
    switchTab(TAB_ORDER[(idx + dir + TAB_ORDER.length) % TAB_ORDER.length]);
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

  // 组卡展开态（gid → true；reactive 对象，仿 openEditors）
  function toggleGroupOpen(gid) {
    if (state.groupOpen[gid]) delete state.groupOpen[gid];
    else state.groupOpen[gid] = true;
  }

  // 设为系统主题：ctx.api 无 put 方法 → 原生 fetch PUT，结果整形为 { ok } / { error }
  // 走 act() 统一出口（状态行反馈 + refresh 对账当前主题徽标与按钮禁用态）
  function setActiveTheme(gid) {
    act(
      fetch("/api/theme/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: gid }),
      }).then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: (data && data.error) || `HTTP ${res.status}` };
        return { ok: true };
      }),
      `已设为系统主题「${gid === "default" ? "默认主题" : gid}」，各页面刷新后生效`
    );
  }

  // 整组启用/停用：核心+成员中 enabled !== 目标值的条目**串行**逐个 toggle（后端
  // 每次 front toggle 都整包写盘 front.json，并发会竞态），逐次经 act() 出口；
  // groupBusy 锁重入（串行循环期间整组按钮可被再次点击）
  async function toggleThemeGroup(g, enabled) {
    if (state.groupBusy) return;
    state.groupBusy = true;
    try {
      const all = [g.core, ...g.members].filter(Boolean);
      const targets = all.filter((it) => it.enabled !== enabled);
      const label = g.isDefault ? "默认主题" : g.gid;
      if (!targets.length) {
        setStatus(`主题组「${label}」内的插件已是${enabled ? "全部启用" : "全部停用"}状态`);
        return;
      }
      for (let i = 0; i < targets.length; i++) {
        if (disposed) return; // 视图已卸载：中止剩余 toggle，finally 兜底复位
        const it = targets[i];
        await act(
          api.post(`/api/plugins/front/${encodeURIComponent(it.id)}/toggle`, { enabled }),
          `「${it.id}」已${enabled ? "启用" : "停用"}（${i + 1}/${targets.length}）`
        );
      }
      // 以刷新后的快照复核：个别失败时直接点名未生效条目，不虚报整组成功
      const fresh = state.snapshot && Array.isArray(state.snapshot.front) ? state.snapshot.front : [];
      const byId = new Map(fresh.map((it) => [it.id, it]));
      const notApplied = all.filter((it) => {
        const cur = byId.get(it.id);
        return cur && cur.enabled !== enabled;
      });
      if (notApplied.length) {
        setStatus(`主题组「${label}」有 ${notApplied.length} 个插件未能${enabled ? "启用" : "停用"}：${notApplied.map((it) => it.id).join("、")}`, true);
      } else {
        setStatus(`主题组「${label}」整组已${enabled ? "启用" : "停用"}（共 ${targets.length} 个插件，刷新页面后生效）`);
      }
    } finally {
      state.groupBusy = false; // disposed 时 state 对象仍存活，复位安全（视图已卸载无副作用）
    }
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
      activeTheme: "", // 当前系统主题（refresh 时拉 /api/theme/active；空 = 未知）
      drafts: {}, // 插件 id → config textarea 草稿（reactive，替代旧 Map）
      openEditors: {}, // 展开中的 config 编辑器 id（reactive，替代旧 Set）
      groupOpen: {}, // 展开中的主题组卡 gid（reactive，仿 openEditors）
      groupBusy: false, // 整组操作进行中（锁整组按钮，防并发触发 front.json 读-改-写丢更新）
      filters: FILTERS,
      // 方法直挂（闭包引用 state，不依赖 this 绑定）
      refresh,
      stateOf,
      kindOf,
      filtered,
      tabRows,
      pageRows,
      compRows,
      displayName,
      themeGroups,
      themeGroupEntries,
      themeEntryCount,
      visibleThemeGroups,
      groupRows,
      groupEnabledCount,
      groupTotalCount,
      activeThemeLabel,
      isThemeEntry,
      toggleGroupOpen,
      setActiveTheme,
      toggleThemeGroup,
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
