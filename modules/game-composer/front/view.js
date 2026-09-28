/**
 * game-composer 编辑器视图（P14 批次 B，P15 批次②增连线编辑）—— petite-vue 细粒度响应式（AGENTS §4.3 三件套）
 *
 * 结构：左 palette（组件面板）/ 中画布（items 卡片列表）/ 右属性面板（title + props JSON + 连线区）。
 * 数据流：ctx.api / fetch 读写 §2 四条端点 → 写入 reactive scope → 模板指令细粒度更新。
 *
 * 连线（P15 §4）：connections 随布局整包 POST/PUT；编辑区在属性面板（选中态下方、未选中亦可见）；
 * 新增表单 from→out→to→in 四下拉，out/in 选项按所选实例组件的 PALETTE_META 词汇表联动；
 * 目标 prop 冲突（事件同 from+out / 数据同 to+in）拦截提示不建；删除实例不级联删连线
 * （悬挂连线在列表显示「实例已删除」，运行时 warn 跳过，用户可手删——避免静默改数据）。
 *
 * 预览（规格 §3 / §5.1；P15 §3/§4）：切进预览态时在 .gcmp-preview-stage 内按 items 顺序 append
 * `<div class="stage-slot" data-slot="<item.id>">`，再 mountFromConfig({ meta: layoutToConfig(...),
 * runtimeProps: buildRuntimeProps(...) })——连线经运行时 props 注入，apis 以 item.id 为键同步回填；
 * 退出前必须先 mounted.cleanup()（mountAll 非幂等，严禁复用旧实例）并清空 apis，再次进入重新挂载。
 * DOM 时序：petite-vue 的 effect 在微任务刷新，故挂载排在 setTimeout(0) 宏任务里，
 * 保证 v-if="previewing" 的容器已进 DOM。
 *
 * toast / confirm-dialog 是「服务类」组件（不排布）：直接 factory(document.body, { onReady })
 * 实例化常驻实例收 API，页面 cleanup 时释放；组件缺失（enabled:false）降级 console / window.confirm。
 *
 * 契约：createComposerView(el, ctx) 同步返回 stop()（kernel cleanup 用）——
 * 响应式 scope 异步就绪，晚到守卫 stopped 保证卸载先于挂载时零副作用。
 */
import { icon } from "/web/icons.mjs";
import { createReactiveScope, mountReactiveSafe } from "/web/lib/reactive.mjs";
import { mountFromConfig } from "/web/components/compose.mjs";
import {
  PALETTE_META,
  componentLabel,
  layoutToConfig,
  stageItems,
  cloneLayout,
  buildRuntimeProps,
  makeItemId,
  propsSummary,
  formatDate,
} from "./layout.mjs";

const API_BASE = "/api/game-composer/layouts";

/** 图标基座字符串表（模板里 v-html 注入；icon() 默认 aria-hidden，语义由相邻文字/aria-label 承担） */
function buildIcons() {
  return {
    layoutGrid: icon("layout-grid"),
    plus: icon("plus", { size: 16 }),
    arrowUp: icon("arrow-up", { size: 16 }),
    arrowDown: icon("arrow-down", { size: 16 }),
    trash: icon("trash", { size: 16 }),
    floppy: icon("device-floppy", { size: 16 }),
    eye: icon("eye", { size: 16 }),
    apps: icon("apps", { size: 16 }),
    arrowLeft: icon("arrow-left", { size: 16 }),
    bolt: icon("bolt", { size: 14 }),
    arrowRight: icon("arrow-right", { size: 12 }),
  };
}

const TEMPLATE = `
<section class="gcmp-page">
  <header class="gcmp-header">
    <div class="gcmp-brand">
      <span class="gcmp-brand-ic" aria-hidden="true" v-html="IC.layoutGrid"></span>
      <h1>可视化编排</h1>
      <span class="gcmp-dirty" v-if="dirty" role="status">未保存</span>
      <a class="gcmp-back" href="/m/select/">
        <span aria-hidden="true" v-html="IC.arrowLeft"></span><span class="sr-only">返回功能选择</span>
      </a>
    </div>
    <p class="gcmp-sub">从左侧组件面板添加积木，编排成新的游戏模式，保存后可在组合舞台运行</p>
  </header>

  <div class="gcmp-toolbar" role="toolbar" aria-label="布局操作">
    <button class="gcmp-btn" type="button" @click="confirmNewLayout()">
      <span aria-hidden="true" v-html="IC.plus"></span><span>新建布局</span>
    </button>
    <label class="gcmp-picker">
      <span class="gcmp-picker-label">已保存布局</span>
      <select id="gcmp-layout-select" class="gcmp-select" aria-label="选择要加载的已保存布局" @change="onPickLayout($event)">
        <option value="">—— 新建（未保存） ——</option>
        <option v-for="l in layouts" :key="l.id" :value="l.id">{{ l.name }} · {{ fmt(l.updatedAt) }}</option>
      </select>
    </label>
    <span class="gcmp-toolbar-sep" aria-hidden="true"></span>
    <button class="gcmp-btn gcmp-btn--primary" type="button" :disabled="saving" @click="save()">
      <span aria-hidden="true" v-html="IC.floppy"></span><span>{{ saving ? '保存中…' : '保存' }}</span>
    </button>
    <button class="gcmp-btn gcmp-btn--danger" type="button" :disabled="!layoutId" :title="layoutId ? '删除当前布局' : '先保存才有可删除的布局'" @click="removeLayout()">
      <span aria-hidden="true" v-html="IC.trash"></span><span>删除</span>
    </button>
    <button class="gcmp-btn" type="button" :aria-pressed="previewing ? 'true' : 'false'" @click="togglePreview()">
      <span aria-hidden="true" v-html="IC.eye"></span><span>{{ previewing ? '退出预览' : '预览' }}</span>
    </button>
    <a class="gcmp-btn gcmp-btn--link" :class="{ 'is-disabled': !layoutId }"
      :href="layoutId ? '/m/custom-stage/?layout=' + layoutId : '#'"
      :aria-disabled="layoutId ? 'false' : 'true'"
      :title="layoutId ? '在组合舞台运行当前布局' : '请先保存布局'"
      @click="openStage($event)">
      <span aria-hidden="true" v-html="IC.apps"></span><span>在组合舞台打开</span>
    </a>
  </div>

  <div class="gcmp-banner gcmp-banner--err" role="alert" v-if="loadError">
    <span>{{ loadError }}</span>
    <button class="gcmp-btn gcmp-btn--sm" type="button" @click="refresh()">重试</button>
  </div>

  <div class="gcmp-main" v-if="!previewing">
    <aside class="gcmp-panel gcmp-palette" aria-label="组件面板">
      <h2 class="gcmp-panel-title">组件面板</h2>
      <p class="gcmp-hint" v-if="!palette().length">暂无已注册组件（可能均被禁用）</p>
      <ul class="gcmp-palette-list">
        <li class="gcmp-palette-item" v-for="p in palette()" :key="p.name" :class="{ 'is-advanced': p.advanced }">
          <div class="gcmp-palette-info">
            <span class="gcmp-palette-name">{{ p.label }}<code v-if="p.advanced" class="gcmp-tag">高级</code></span>
            <code class="gcmp-palette-id">{{ p.name }}</code>
            <span class="gcmp-palette-desc">{{ p.desc }}</span>
          </div>
          <button class="gcmp-icon-btn" type="button" :aria-label="'添加组件 ' + p.label" :title="'添加 ' + p.label" @click="addComponent(p.name)">
            <span aria-hidden="true" v-html="IC.plus"></span>
          </button>
        </li>
      </ul>
    </aside>

    <section class="gcmp-panel gcmp-canvas" aria-label="布局画布">
      <div class="gcmp-canvas-head">
        <h2 class="gcmp-panel-title">布局内容</h2>
        <label class="gcmp-name-field">
          <span class="gcmp-name-label">布局名称</span>
          <input class="gcmp-input" type="text" maxlength="40" placeholder="例如：双人对战练习台"
            :value="name" @input="onNameInput($event)" aria-label="布局名称（1 到 40 字符）" />
        </label>
      </div>
      <ol class="gcmp-items">
        <li class="gcmp-item" v-for="(it, i) in items" :key="it.id"
          :class="{ 'is-selected': it.id === selectedId }"
          tabindex="0" @click="selectItem(it.id)" @keydown.enter="selectItem(it.id)">
          <span class="gcmp-item-no" aria-hidden="true">{{ i + 1 }}</span>
          <div class="gcmp-item-body">
            <div class="gcmp-item-line">
              <strong class="gcmp-item-name">{{ compLabel(it.component) }}</strong>
              <span class="gcmp-item-title" v-if="it.title">{{ it.title }}</span>
              <span class="gcmp-item-title is-empty" v-else>未命名</span>
            </div>
            <code class="gcmp-item-props">{{ summary(it.props) }}</code>
          </div>
          <div class="gcmp-item-ops">
            <button class="gcmp-icon-btn" type="button" :disabled="i === 0"
              :aria-label="'上移 ' + compLabel(it.component)" title="上移"
              @click.stop="moveItem(i, -1)"><span aria-hidden="true" v-html="IC.arrowUp"></span></button>
            <button class="gcmp-icon-btn" type="button" :disabled="i === items.length - 1"
              :aria-label="'下移 ' + compLabel(it.component)" title="下移"
              @click.stop="moveItem(i, 1)"><span aria-hidden="true" v-html="IC.arrowDown"></span></button>
            <button class="gcmp-icon-btn gcmp-icon-btn--danger" type="button"
              :aria-label="'删除 ' + compLabel(it.component)" title="删除"
              @click.stop="removeItem(it.id)"><span aria-hidden="true" v-html="IC.trash"></span></button>
          </div>
        </li>
      </ol>
      <div class="gcmp-empty" v-if="!items.length">
        <p class="gcmp-empty-title">画布为空</p>
        <p class="gcmp-empty-hint">从左侧组件面板点「添加」按钮，把第一个组件排进布局</p>
      </div>
    </section>

    <aside class="gcmp-panel gcmp-props" aria-label="属性面板">
      <h2 class="gcmp-panel-title">属性</h2>
      <div class="gcmp-empty gcmp-empty--slim" v-if="!sel()">
        <p class="gcmp-empty-title">未选中组件</p>
        <p class="gcmp-empty-hint">点击画布中的卡片，在此编辑标题与 props</p>
      </div>
      <div class="gcmp-props-body" v-if="sel()">
        <p class="gcmp-props-target">
          <strong>{{ compLabel(selComponent()) }}</strong>
          <code>{{ selComponent() }}</code>
        </p>
        <label class="gcmp-field">
          <span class="gcmp-field-label">标题（可选）</span>
          <input class="gcmp-input" type="text" placeholder="卡片头标题，如：上半场"
            :value="selTitle()" @input="onTitleInput($event)" aria-label="选中组件的标题" />
        </label>
        <label class="gcmp-field">
          <span class="gcmp-field-label">props（JSON 对象）</span>
          <textarea class="gcmp-textarea" rows="10" spellcheck="false"
            :class="{ 'is-error': propsError }"
            :value="propsDraft" @input="onPropsInput($event)" @change="applyProps()"
            :aria-invalid="propsError ? 'true' : 'false'"
            aria-label="选中组件的 props JSON"></textarea>
        </label>
        <p class="gcmp-props-error" role="alert" v-if="propsError">{{ propsError }}</p>
        <div class="gcmp-props-actions">
          <button class="gcmp-btn gcmp-btn--sm gcmp-btn--primary" type="button" @click="applyProps()">应用 props</button>
        </div>
        <p class="gcmp-hint">失焦或点「应用」时解析 JSON；解析失败会提示错误并保持旧值</p>
      </div>

      <section class="gcmp-wiring" aria-label="组件连线">
        <h3 class="gcmp-wiring-title"><span aria-hidden="true" v-html="IC.bolt"></span>连线</h3>
        <ul class="gcmp-wiring-list" v-if="connections.length">
          <li class="gcmp-wiring-item" v-for="(c, i) in connections" :key="i">
            <span class="gcmp-wiring-badge" :class="isEventConn(c) ? 'is-event' : 'is-data'">{{ isEventConn(c) ? '事件' : '数据' }}</span>
            <span class="gcmp-wiring-text">
              <strong>{{ connItemLabel(c.from) }}</strong><span class="gcmp-wiring-mid"> · {{ connOutLabel(c) }}</span>
              <span class="gcmp-wiring-arrow" aria-hidden="true" v-html="IC.arrowRight"></span>
              <strong>{{ connItemLabel(c.to) }}</strong><span class="gcmp-wiring-mid"> · {{ connInLabel(c) }}</span>
            </span>
            <button class="gcmp-icon-btn gcmp-icon-btn--danger gcmp-icon-btn--sm" type="button"
              :aria-label="'删除连线：' + connItemLabel(c.from) + ' 到 ' + connItemLabel(c.to)" title="删除连线"
              @click.stop="removeConnection(i)"><span aria-hidden="true" v-html="IC.trash"></span></button>
          </li>
        </ul>
        <p class="gcmp-hint" v-else>暂无连线：用下方表单把一个实例的输出口接到另一实例的输入口</p>

        <div class="gcmp-wiring-form" v-if="stagedList().length">
          <div class="gcmp-wiring-grid">
            <label class="gcmp-field">
              <span class="gcmp-field-label">来源实例</span>
              <select id="gcmp-conn-from" class="gcmp-select" :value="connFrom" @change="onConnFrom($event)"
                aria-label="连线来源实例">
                <option value="">—— 实例 ——</option>
                <option v-for="s in stagedList()" :key="s.id" :value="s.id">{{ s.label }}</option>
              </select>
            </label>
            <label class="gcmp-field">
              <span class="gcmp-field-label">输出口（on 开头 = 事件）</span>
              <select id="gcmp-conn-out" class="gcmp-select" :value="connOut" @change="onConnOut($event)"
                :disabled="!connOuts().length" aria-label="连线输出口">
                <option value="">—— 输出口 ——</option>
                <option v-for="o in connOuts()" :key="o.name" :value="o.name">{{ o.label }}</option>
              </select>
            </label>
            <label class="gcmp-field">
              <span class="gcmp-field-label">目标实例</span>
              <select id="gcmp-conn-to" class="gcmp-select" :value="connTo" @change="onConnTo($event)"
                aria-label="连线目标实例">
                <option value="">—— 实例 ——</option>
                <option v-for="s in stagedList()" :key="'t-' + s.id" :value="s.id">{{ s.label }}</option>
              </select>
            </label>
            <label class="gcmp-field">
              <span class="gcmp-field-label">输入口</span>
              <select id="gcmp-conn-in" class="gcmp-select" :value="connIn" @change="onConnIn($event)"
                :disabled="!connIns().length" aria-label="连线输入口">
                <option value="">—— 输入口 ——</option>
                <option v-for="o in connIns()" :key="o.name" :value="o.name">{{ o.label }}</option>
              </select>
            </label>
          </div>
          <p class="gcmp-wiring-error" role="alert" v-if="connError">{{ connError }}</p>
          <div class="gcmp-wiring-actions">
            <button class="gcmp-btn gcmp-btn--sm gcmp-btn--primary" type="button"
              :disabled="!connReady()" :title="connReady() ? '添加连线' : '四项都选择后才能添加'"
              @click="addConnection()">
              <span aria-hidden="true" v-html="IC.plus"></span><span>添加连线</span>
            </button>
          </div>
          <p class="gcmp-hint">输出口 on 开头 = 事件连线（触发目标动作）；否则 = 数据连线（目标惰性取来源数据）</p>
        </div>
        <p class="gcmp-hint" v-else>画布暂无可连线的实例（缺 id 的实例不参与装配与连线）</p>
      </section>
    </aside>
  </div>

  <section class="gcmp-preview" v-if="previewing" aria-label="布局预览">
    <div class="gcmp-preview-bar">
      <span class="gcmp-preview-note">预览模式：组件真实挂载，状态仅内存、不落盘</span>
      <span class="gcmp-preview-conn" v-if="connections.length">{{ previewConnText() }}</span>
      <button class="gcmp-btn" type="button" @click="togglePreview()">退出预览</button>
    </div>
    <div class="gcmp-preview-stage"><p class="gcmp-hint">正在挂载组件…</p></div>
  </section>

  <footer class="gcmp-foot">
    <span>布局存于本站数据库；「在组合舞台打开」以当前布局 id 运行（/m/custom-stage/）</span>
  </footer>
</section>
`;

export function createComposerView(el, ctx) {
  const controller = new AbortController();
  const { signal } = controller;

  let state = null; // reactive scope（异步就绪；全部方法经闭包读写，不依赖 this）
  let disposeView = null;
  let stopped = false;
  let previewMounted = null; // mountFromConfig 返回句柄（退出预览必须先 cleanup）
  let previewApis = null; // 预览连线注入的实例 api 表（buildRuntimeProps 的 onReady 回填；退出清空）
  let uidSeq = 0; // item uid 序号（页面实例局部，无模块级共享）

  /* ---------- 服务类组件实例化（toast / confirm-dialog，非排布项） ---------- */
  let toastApi = null;
  let toastDispose = null;
  let confirmApi = null;
  let confirmDispose = null;

  const toastFactory = ctx && ctx.ui && ctx.ui.component ? ctx.ui.component("toast") : null;
  if (toastFactory) {
    try {
      const d = toastFactory(document.body, { onReady: (api) => { toastApi = api; } }, ctx);
      if (typeof d === "function") toastDispose = d;
    } catch (e) {
      console.warn("[game-composer] toast 实例化失败，降级 console:", e);
    }
  } else {
    console.warn("[game-composer] toast 组件未注册，反馈降级 console");
  }

  const confirmFactory = ctx && ctx.ui && ctx.ui.component ? ctx.ui.component("confirm-dialog") : null;
  if (confirmFactory) {
    try {
      const d = confirmFactory(document.body, { onReady: (api) => { confirmApi = api; } }, ctx);
      if (typeof d === "function") confirmDispose = d;
    } catch (e) {
      console.warn("[game-composer] confirm-dialog 实例化失败，降级 window.confirm:", e);
    }
  }

  /** toast 反馈：组件缺失时 console 兜底（规格 §5.1） */
  function toast(message, type) {
    if (toastApi) toastApi.show(message, type);
    else console.warn(`[game-composer] ${type || "info"}: ${message}`);
  }

  /** 确认弹窗：confirm-dialog 缺失时 window.confirm 兜底 */
  function askConfirm(message, onOk) {
    if (confirmApi) confirmApi(message, onOk);
    else if (window.confirm(message)) onOk();
  }

  /* ---------- 工具 ---------- */

  /** items 的纯值深拷贝（剥离 reactive proxy；props 深层一并拷） */
  function plainItems() {
    return cloneLayout({ items: state.items }).items;
  }

  /** connections 的纯值清洗（剥离 reactive proxy；五键剥离，随保存整包走） */
  function plainConnections() {
    return cloneLayout({ items: [], connections: state.connections }).connections;
  }

  function prettyProps(props) {
    try {
      return JSON.stringify(props === undefined || props === null ? {} : props, null, 2);
    } catch (e) {
      return "{}";
    }
  }

  /** 程序化变更 layoutId 后同步下拉显示值（select 的 option 由 v-for 渲染，时序在微任务） */
  function syncPicker() {
    setTimeout(() => {
      if (stopped) return;
      const select = el.querySelector("#gcmp-layout-select");
      if (select) select.value = state ? state.layoutId : "";
    }, 0);
  }

  /** 连线表单程序化重置后同步四个下拉显示值（同 syncPicker 的微任务时序问题） */
  function syncConnSelects() {
    setTimeout(() => {
      if (stopped || !state) return;
      const map = [
        ["#gcmp-conn-from", "connFrom"],
        ["#gcmp-conn-out", "connOut"],
        ["#gcmp-conn-to", "connTo"],
        ["#gcmp-conn-in", "connIn"],
      ];
      for (const [sel, key] of map) {
        const node = el.querySelector(sel);
        if (node) node.value = state[key];
      }
    }, 0);
  }

  /* ---------- 数据 ---------- */

  async function refresh() {
    try {
      const data = await ctx.api.get(API_BASE);
      if (stopped || !state) return;
      state.layouts = data && Array.isArray(data.list) ? data.list : [];
      state.loadError = "";
      state.ready = true;
    } catch (e) {
      if (stopped || !state) return;
      state.loadError = `布局列表加载失败：${e && e.message ? e.message : "网络错误"}`;
      state.ready = true;
    }
    syncPicker();
  }

  /* ---------- 布局级操作 ---------- */

  /** 连线表单重置（新建/切换/保存回写共用） */
  function resetConnForm() {
    state.connFrom = "";
    state.connOut = "";
    state.connTo = "";
    state.connIn = "";
    state.connError = "";
    syncConnSelects();
  }

  function newLayout() {
    state.layoutId = "";
    state.name = "";
    state.items = [];
    state.connections = [];
    state.dirty = false;
    state.selectedId = "";
    state.propsDraft = "{}";
    state.propsError = "";
    resetConnForm();
    syncPicker();
  }

  /** 按 id 从已加载列表载入编辑态（深拷贝，不与列表对象共享引用）；命中返回 true */
  function loadLayoutById(id) {
    const found = state.layouts.find((l) => l && l.id === id);
    if (!found) return false;
    const copy = cloneLayout(found);
    state.layoutId = copy.id;
    state.name = copy.name;
    state.items = copy.items;
    state.connections = copy.connections;
    state.dirty = false;
    state.selectedId = "";
    state.propsDraft = "{}";
    state.propsError = "";
    resetConnForm();
    return true;
  }

  /** 用户触发的新建/切换守卫：dirty 时先确认（复用删除的 askConfirm 路径），取消则不动编辑态 */
  function guardSwitch(proceed) {
    if (!state.dirty) {
      proceed();
      return;
    }
    askConfirm("当前布局有未保存的修改，继续将丢弃这些修改，是否继续？", proceed);
  }

  /** 工具条「新建布局」入口（dirty 确认后才清空；删除成功后的 newLayout 重置仍走直调） */
  function confirmNewLayout() {
    guardSwitch(newLayout);
  }

  function onPickLayout(event) {
    const id = event.target.value;
    syncPicker(); // 先回显当前值：用户取消确认时下拉不留在他选项上；确认切换后再刷为新值
    if (!id) {
      confirmNewLayout();
      return;
    }
    if (id === state.layoutId) return;
    guardSwitch(() => {
      if (!loadLayoutById(id)) {
        toast("未找到该布局（列表可能已变化）", "warning");
      }
      syncPicker();
    });
  }

  /** 服务端返回的布局写回编辑态（保存成功后） */
  function applyServerLayout(layout) {
    const copy = cloneLayout(layout);
    state.layoutId = copy.id;
    state.name = copy.name;
    state.items = copy.items;
    state.connections = copy.connections;
    state.dirty = false;
    if (!state.items.some((it) => it.id === state.selectedId)) {
      state.selectedId = "";
      state.propsDraft = "{}";
      state.propsError = "";
    } else {
      state.propsDraft = prettyProps(sel() && sel().props);
      state.propsError = "";
    }
    resetConnForm();
    syncPicker();
  }

  async function save() {
    if (state.saving) return;
    if (!state.name.trim()) {
      toast("布局名称不能为空", "warning");
      return;
    }
    const body = { name: state.name, items: plainItems(), connections: plainConnections() };
    state.saving = true;
    try {
      const res = state.layoutId
        ? await fetch(`${API_BASE}/${encodeURIComponent(state.layoutId)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(API_BASE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const data = await res.json().catch(() => ({}));
      if (stopped || !state) return;
      if (!res.ok) {
        toast((data && data.error) || `保存失败（HTTP ${res.status}）`, "error");
        return;
      }
      applyServerLayout(data.layout || data);
      toast("已保存", "success");
      await refresh();
    } catch (e) {
      if (!stopped && state) toast(`网络错误，保存失败：${e && e.message ? e.message : e}`, "error");
    } finally {
      if (!stopped && state) state.saving = false;
    }
  }

  function removeLayout() {
    if (!state.layoutId) return;
    const targetId = state.layoutId;
    const targetName = state.name;
    const doDelete = async () => {
      try {
        const res = await fetch(`${API_BASE}/${encodeURIComponent(targetId)}`, { method: "DELETE" });
        if (stopped || !state) return;
        if (res.status === 404) {
          toast("布局不存在（可能已被删除）", "warning");
          await refresh();
          if (state.layoutId === targetId) newLayout();
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast((data && data.error) || `删除失败（HTTP ${res.status}）`, "error");
          return;
        }
        toast("已删除", "success");
        await refresh();
        if (state.layoutId === targetId) newLayout();
      } catch (e) {
        if (!stopped && state) toast(`网络错误，删除失败：${e && e.message ? e.message : e}`, "error");
      }
    };
    askConfirm(`删除布局「${targetName}」？此操作不可恢复。`, doDelete);
  }

  function openStage(event) {
    if (!state.layoutId) {
      event.preventDefault();
      toast("请先保存布局，才能在组合舞台打开", "warning");
    }
  }

  /* ---------- items 级操作 ---------- */

  function addComponent(name) {
    uidSeq += 1;
    const id = makeItemId(
      uidSeq,
      state.items.map((it) => it.id),
    );
    state.items.push({ id, component: name, title: "", props: {} });
    state.dirty = true;
    selectItem(id);
  }

  function sel() {
    if (!state) return null;
    return state.items.find((it) => it.id === state.selectedId) || null;
  }

  /** 模板安全读取（删除选中项的同一 flush 内 v-if 与 :value 效果重排，避免对 null 取属性） */
  function selTitle() {
    const it = sel();
    return it && typeof it.title === "string" ? it.title : "";
  }

  function selComponent() {
    const it = sel();
    return it ? String(it.component) : "";
  }

  function selectItem(id) {
    const it = state.items.find((x) => x.id === id);
    if (!it) {
      state.selectedId = "";
      state.propsDraft = "{}";
      state.propsError = "";
      return;
    }
    state.selectedId = it.id;
    state.propsDraft = prettyProps(it.props);
    state.propsError = "";
  }

  function moveItem(index, dir) {
    const j = index + dir;
    if (j < 0 || j >= state.items.length) return;
    const moved = state.items.splice(index, 1)[0];
    state.items.splice(j, 0, moved);
    state.dirty = true;
  }

  function removeItem(id) {
    const idx = state.items.findIndex((it) => it.id === id);
    if (idx < 0) return;
    state.items.splice(idx, 1);
    state.dirty = true;
    // 连线表单指向被删实例时清掉该侧（连同词汇联动的 out/in），避免静默建出悬挂连线
    // （既有 connections 不级联删：悬挂连线列表透明展示、运行时 warn 跳过，用户可手删）
    if (state.connFrom === id) {
      state.connFrom = "";
      state.connOut = "";
    }
    if (state.connTo === id) {
      state.connTo = "";
      state.connIn = "";
    }
    state.connError = "";
    syncConnSelects();
    if (state.selectedId === id) selectItem("");
  }

  function onNameInput(event) {
    state.name = event.target.value;
    state.dirty = true;
  }

  function onTitleInput(event) {
    const it = sel();
    if (!it) return;
    it.title = event.target.value;
    state.dirty = true;
  }

  function onPropsInput(event) {
    state.propsDraft = event.target.value;
  }

  /** 解析 propsDraft：失败 → 就地报错并保持旧值；成功 → 写回 item.props */
  function applyProps() {
    const it = sel();
    if (!it) return;
    let parsed;
    try {
      parsed = JSON.parse(state.propsDraft);
    } catch (e) {
      state.propsError = `JSON 解析失败：${e.message}`;
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      state.propsError = "props 必须为 JSON 对象（{}），不能是数组或原始值";
      return;
    }
    state.propsError = "";
    it.props = parsed;
    state.dirty = true;
  }

  /* ---------- connections 级操作（P15 §4） ---------- */

  /** 参与装配（与连线）的实例表：stageItems 同一过滤谓词 + 显示标签 */
  function stagedList() {
    if (!state) return [];
    return stageItems({ items: state.items }).map((it) => ({
      id: it.id,
      label: it.title ? `${it.title}（${componentLabel(it.component)}）` : componentLabel(it.component),
    }));
  }

  /** 实例显示标签：标题（组件中文名）；实例已删除时透明展示 id（连线不级联删，运行时 warn 跳过） */
  function connItemLabel(id) {
    const it = state.items.find((x) => x.id === id);
    if (!it) return `${id}（实例已删除）`;
    return it.title ? `${it.title}（${componentLabel(it.component)}）` : componentLabel(it.component);
  }

  /** 组件的连线词汇表（outs/ins）：未知组件兜底空数组（无法经表单连线，但既有连线照常显示/运行） */
  function vocabOf(component, kind) {
    const meta = Object.prototype.hasOwnProperty.call(PALETTE_META, component)
      ? PALETTE_META[component]
      : null;
    const list = meta && Array.isArray(meta[kind]) ? meta[kind] : [];
    return list.filter((e) => e && typeof e.name === "string");
  }

  function itemComponent(id) {
    const it = state.items.find((x) => x.id === id);
    return it ? String(it.component) : "";
  }

  /** 连线类型判定（规格 P15 §1：out 以 "on" 开头 = 事件，否则 = 数据——运行时唯一依据） */
  function isEventConn(c) {
    return !!(c && typeof c.out === "string" && c.out.startsWith("on"));
  }

  /** out 显示标签：命中词汇表用引导标签；实例已删除时标「原始输出口」（词汇表无从解析）；
   *  未命中（未知组件/手改 JSON）兜底原名 */
  function connOutLabel(c) {
    const comp = itemComponent(c.from);
    if (!comp) return `${String(c.out)}（原始输出口）`;
    const entry = vocabOf(comp, "outs").find((e) => e.name === c.out);
    return entry ? entry.label : String(c.out);
  }

  /** in 显示标签（同 connOutLabel，悬挂标「原始输入口」） */
  function connInLabel(c) {
    const comp = itemComponent(c.to);
    if (!comp) return `${String(c.in)}（原始输入口）`;
    const entry = vocabOf(comp, "ins").find((e) => e.name === c.in);
    return entry ? entry.label : String(c.in);
  }

  /** 表单联动：当前来源实例的组件 outs 词汇 */
  function connOuts() {
    if (!state) return [];
    return vocabOf(itemComponent(state.connFrom), "outs");
  }

  /** 表单联动：当前目标实例的组件 ins 词汇 */
  function connIns() {
    if (!state) return [];
    return vocabOf(itemComponent(state.connTo), "ins");
  }

  function onConnFrom(event) {
    state.connFrom = event.target.value;
    if (!connOuts().some((e) => e.name === state.connOut)) state.connOut = ""; // 词汇不兼容则清空
    state.connError = "";
    syncConnSelects();
  }

  function onConnTo(event) {
    state.connTo = event.target.value;
    if (!connIns().some((e) => e.name === state.connIn)) state.connIn = "";
    state.connError = "";
    syncConnSelects();
  }

  function onConnOut(event) {
    state.connOut = event.target.value;
    state.connError = "";
  }

  function onConnIn(event) {
    state.connIn = event.target.value;
    state.connError = "";
  }

  function connReady() {
    return !!(state && state.connFrom && state.connOut && state.connTo && state.connIn);
  }

  /**
   * 连线注入的目标 prop 定位（规格 P15 §3/§4）：事件 → from.props[out]，数据 → to.props[in]。
   * 同一 (实例, prop 键) 只允许一条连线注入（后建覆盖前者只发生在手改 JSON 的运行时，编辑器直接拦截）。
   */
  function connTargetKey(c) {
    return isEventConn(c) ? `${c.from}::${c.out}` : `${c.to}::${c.in}`;
  }

  function addConnection() {
    if (!connReady()) return;
    const draft = { from: state.connFrom, out: state.connOut, to: state.connTo, in: state.connIn };
    const dup = state.connections.find((c) => connTargetKey(c) === connTargetKey(draft));
    if (dup) {
      state.connError = isEventConn(draft)
        ? "该事件源已被另一条连线占用（同 来源实例 + 输出口），请先删除原连线"
        : "该数据目标已被另一条连线占用（同 目标实例 + 输入口），请先删除原连线";
      return;
    }
    state.connections.push(draft); // id 缺省，保存时由后端补 "cn-xxxxxx"
    state.dirty = true;
    state.connError = "";
  }

  function removeConnection(index) {
    if (index < 0 || index >= state.connections.length) return;
    state.connections.splice(index, 1);
    state.dirty = true;
  }

  /* ---------- 预览（规格 §3 / §5.1） ---------- */

  function togglePreview() {
    if (state.previewing) {
      exitPreview();
      state.previewing = false;
      return;
    }
    state.previewing = true;
    setTimeout(enterPreview, 0); // 等 petite-vue 微任务刷完 v-if 容器
  }

  function enterPreview() {
    if (stopped || !state || !state.previewing) return;
    const stage = el.querySelector(".gcmp-preview-stage");
    if (!stage) return;
    exitPreview(); // 清场（幂等）

    // 与 layoutToConfig 同一过滤谓词：缺 id 实例不建宿主也不进 config，也不参与连线注入
    const plainLayout = { items: plainItems(), connections: plainConnections() };
    const plain = stageItems(plainLayout);
    if (!plain.length) {
      const hint = document.createElement("p");
      hint.className = "gcmp-hint";
      hint.textContent = "画布为空：退出预览后从左侧组件面板添加组件";
      stage.append(hint);
      return;
    }
    for (const item of plain) {
      const slot = document.createElement("div");
      slot.className = "stage-slot";
      slot.dataset.slot = item.id;
      slot.setAttribute("aria-label", `组件插槽：${componentLabel(item.component)}`);
      stage.append(slot);
    }
    // 连线注入（P15 §3）：apis 以 item.id 为键，onReady 在挂载过程同步回填；
    // 数据函数在用户交互时才惰性调用，届时全部实例已挂好（分组挂载顺序不影响取值）
    previewApis = new Map();
    try {
      previewMounted = mountFromConfig({
        el: stage,
        meta: layoutToConfig(plainLayout),
        ctx,
        label: "game-composer",
        runtimeProps: buildRuntimeProps(plainLayout, previewApis, console.warn),
      });
    } catch (e) {
      // 组件工厂抛错按契约向上传播——预览就地降级为错误行，页面不死
      console.error("[game-composer] 预览挂载失败:", e);
      previewApis = null;
      const err = document.createElement("p");
      err.className = "gcmp-props-error";
      err.setAttribute("role", "alert");
      err.textContent = `组件挂载失败：${e && e.message ? e.message : e}`;
      stage.append(err);
    }
  }

  function exitPreview() {
    if (previewMounted) {
      try {
        previewMounted.cleanup(); // mountAll 非幂等：退出必须先 cleanup，重进重新挂载
      } catch (e) {
        console.error("[game-composer] 预览 cleanup 失败:", e);
      }
      previewMounted = null;
    }
    previewApis = null; // 连线 api 表随预览销毁清空（重进重建）
    const stage = el.querySelector(".gcmp-preview-stage");
    if (stage) stage.textContent = "";
  }

  /**
   * 预览条连线文案（walkthrough P3）：只统计两端实例均可解析的连线（悬挂线运行时 warn 跳过，
   * 不计入注入数），有悬挂时透明标注「N 条悬挂已跳过」。
   */
  function previewConnText() {
    if (!state) return "";
    const staged = new Set(stageItems({ items: state.items }).map((it) => it.id));
    let ok = 0;
    for (const c of state.connections) {
      if (c && staged.has(c.from) && staged.has(c.to)) ok += 1;
    }
    const dangling = state.connections.length - ok;
    return dangling > 0
      ? `布局连线 ${ok} 条（${dangling} 条悬挂已跳过）`
      : `布局连线 ${ok} 条`;
  }

  /* ---------- palette 视图（ctx.ui.listComponents() + 内置中文名表） ---------- */

  function palette() {
    const names =
      ctx && ctx.ui && typeof ctx.ui.listComponents === "function" ? ctx.ui.listComponents() : [];
    return names.map((name) => {
      const meta = Object.prototype.hasOwnProperty.call(PALETTE_META, name)
        ? PALETTE_META[name]
        : null;
      return {
        name,
        label: meta ? meta.label : name, // 未知名兜底显示原名
        desc: meta ? meta.desc : "未收录进中文名表，显示原始组件名",
        advanced: !!(meta && meta.advanced),
      };
    });
  }

  /**
   * 初始化时按 URL ?layout=<id> 预载布局（custom-stage「编辑此布局」入口）。
   * 必须在 refresh() 完成后查（id 要在已加载列表里命中）；无参/未命中则静默忽略，
   * 留默认空编辑态（列表可能尚未包含或已被删除）。
   */
  function applyInitialLayoutParam() {
    if (stopped || !state) return;
    let want = "";
    try {
      want = new URLSearchParams(window.location.search).get("layout") || "";
    } catch (e) {
      return;
    }
    if (want && loadLayoutById(want)) syncPicker();
  }

  /* ---------- 装配（响应式三件套，AGENTS §4.3） ---------- */

  const init = {
    // 状态
    ready: false,
    loadError: "",
    layouts: [],
    layoutId: "",
    name: "",
    items: [],
    connections: [],
    selectedId: "",
    propsDraft: "{}",
    propsError: "",
    connFrom: "",
    connOut: "",
    connTo: "",
    connIn: "",
    connError: "",
    previewing: false,
    saving: false,
    dirty: false,
    IC: buildIcons(),
    // 方法（经闭包读写 state）
    fmt: formatDate,
    compLabel: componentLabel,
    summary: propsSummary,
    sel,
    selTitle,
    selComponent,
    palette,
    refresh,
    newLayout,
    confirmNewLayout,
    onPickLayout,
    save,
    removeLayout,
    openStage,
    togglePreview,
    previewConnText,
    addComponent,
    selectItem,
    moveItem,
    removeItem,
    onNameInput,
    onTitleInput,
    onPropsInput,
    applyProps,
    // 连线（P15 §4）
    stagedList,
    isEventConn,
    connItemLabel,
    connOutLabel,
    connInLabel,
    connOuts,
    connIns,
    connReady,
    onConnFrom,
    onConnTo,
    onConnOut,
    onConnIn,
    addConnection,
    removeConnection,
  };

  createReactiveScope(init)
    .then((scope) => {
      if (stopped) return; // 晚到守卫：卸载先于 scope 就绪
      state = scope;
      disposeView = mountReactiveSafe(el, { template: TEMPLATE, scope: state });
      refresh().then(applyInitialLayoutParam);
    })
    .catch((e) => {
      console.error("[game-composer] 响应式视图初始化失败:", e);
      el.innerHTML =
        '<section class="gcmp-page"><p class="gcmp-props-error" role="alert">编辑器初始化失败，请刷新重试</p></section>';
    });

  // 未保存离开提示（可选加分项：仅 dirty 时）
  window.addEventListener(
    "beforeunload",
    (e) => {
      if (state && state.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    },
    { signal },
  );

  /** 页面 cleanup：预览组件 → 响应式视图 → 服务组件 → 全局监听 */
  return function stop() {
    stopped = true;
    exitPreview();
    if (disposeView) {
      disposeView();
      disposeView = null;
    }
    if (toastDispose) {
      try {
        toastDispose();
      } catch (e) {
        console.error("[game-composer] toast cleanup 失败:", e);
      }
      toastDispose = null;
    }
    if (confirmDispose) {
      try {
        confirmDispose();
      } catch (e) {
        console.error("[game-composer] confirm-dialog cleanup 失败:", e);
      }
      confirmDispose = null;
    }
    controller.abort();
  };
}
