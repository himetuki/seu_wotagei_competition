/**
 * custom-stage —— Layout → mountFromConfig config 换算（P14 规格内置 §3）
 *   + P15 连线 runtimeProps 注入（.tmp/p15-wiring-spec.md §3，见文末 buildRuntimeProps）
 *
 * 规格 .tmp/p14-layout-spec.md §3：编辑器预览与运行时页**各自内置**此换算，勿建共享文件，
 * 也禁止 import game-composer 模块的文件（跨插件 import 禁止）。
 *
 * 关键语义：compose.mjs 对 compose 数组里的同名组件会整组挂载其全部 slots，
 * 故 compose 必须按组件名去重（首现顺序），slots/components 按组件名分组、
 * 组内保持 items 出现顺序（= 多实例下标一一对应）。
 *
 * 边界（规格未定义处，本模块的处理决定）：
 * - item.component 缺失 → 跳过该实例（规格 §3 continue，静默）。
 * - item.id 缺失 → 规格参考实现会生成 "[data-slot=undefined]"（未定义行为）；
 *   本模块选择跳过该实例并 console.warn（与容器 DOM 侧 stageItems 共用同一过滤，保证选择器与宿主一一对应）。
 * - item 非 plain object（null/原始值）→ 跳过（防御；后端已校验普通对象）。
 */

/** 过滤出可挂载的布局项（component 与 id 均存在），供换算与运行容器建 DOM 共用 */
export function stageItems(layout) {
  const items = layout && Array.isArray(layout.items) ? layout.items : [];
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (!item.component) continue; // 规格 §3：component 缺失 → continue
    if (!item.id) {
      console.warn('[custom-stage] 布局项缺少 id，已跳过该实例：', item);
      continue;
    }
    out.push(item);
  }
  return out;
}

/**
 * Layout JSON → mountFromConfig 的 meta（compose / slots / components）。
 * @param {object} layout 规格 §1 的 Layout 对象
 * @returns {{ compose: string[], slots: Object<string, string[]>, components: Object<string, object[]> }}
 */
export function layoutToConfig(layout) {
  const compose = [];
  const slots = {};
  const components = {};
  for (const item of stageItems(layout)) {
    const name = item.component;
    if (!slots[name]) {
      compose.push(name);
      slots[name] = [];
      components[name] = [];
    }
    slots[name].push(`[data-slot=${item.id}]`);
    components[name].push({
      ...(item.title ? { title: item.title } : {}),
      ...(item.props && typeof item.props === "object" ? item.props : {}),
    });
  }
  return { compose, slots, components };
}

/**
 * 构造 mountFromConfig 的 runtimeProps：每实例静态 props + onReady 回填 + 连线注入（P15 规格 §3）。
 *
 * 连线类型判定（运行时唯一依据，无 type 字段）：out 以 "on" 开头 → 事件连线
 * （注入 from 的回调 prop，触发时调 to 的 api 动作）；否则 → 数据连线
 * （注入 to 的 prop 为惰性取值函数，调用时取 from 的 api 取数器返回值，缺省回退 []）。
 *
 * - apis：item.id → 组件 api 表，由注入的 onReady 在挂载期同步回填（mountFromConfig
 *   构造内即完成一轮 mountAll，返回时已齐）；连线函数在用户交互时才惰性查表，
 *   compose 分组挂载顺序不影响取值。
 * - 连线注入覆盖布局 JSON 同名静态 prop（预期行为）；同一目标 prop 被多条连线注入时
 *   后者覆盖前者并 warn 一条（编辑器拦截建重复，此处兜底直写 API 的存量数据）。
 * - 坏引用（from/to 不在 items、out/in 非字符串、连线项非对象）→ warn 跳过，
 *   不影响其余连线。运行时不认词汇表，只认连线 JSON 的原始字符串，宽松降级。
 *
 * @param {object} layout 规格 §1 Layout（items + 可选 connections；无 connections = v1 布局，全兼容）
 * @param {Map} apis item.id → 组件 api（调用方传 new Map()，挂载期由 onReady 回填）
 * @param {(msg: string) => void} [warn] 构建期告警通道，缺省 console.warn
 * @returns {Object<string, object[]>} 组件名 → props 数组（下标 = 组内实例序，与 layoutToConfig 的 slots 对齐）
 */
export function buildRuntimeProps(layout, apis, warn = console.warn) {
  const staged = stageItems(layout);
  const groups = {}; // 组件名 → 该组 staged items（顺序 = 组内实例序）
  for (const item of staged) (groups[item.component] ??= []).push(item);
  const byId = new Map(staged.map((item) => [item.id, item]));
  /** item id → staged item（连线引用解析；非字符串 id 一律视为不存在） */
  const stagedById = (id) => (typeof id === "string" ? byId.get(id) || null : null);

  const rp = {}; // 组件名 → props 数组（下标 = 组内实例序，与 slots 对齐）
  const propOf = (item) => rp[item.component][groups[item.component].indexOf(item)];
  for (const [name, items] of Object.entries(groups)) {
    rp[name] = items.map((item) => ({
      ...(item.props && typeof item.props === "object" ? item.props : {}),
      onReady: (api) => apis.set(item.id, api),
    }));
  }

  const connections = layout && Array.isArray(layout.connections) ? layout.connections : [];
  const injected = new Map(); // item.id → Set(已被连线注入的 prop 名)，重复注入检测用
  const markInjected = (item, prop) => {
    let props = injected.get(item.id);
    if (!props) injected.set(item.id, (props = new Set()));
    const dup = props.has(prop);
    props.add(prop);
    return dup;
  };
  for (const c of connections) {
    if (!c || typeof c !== "object") { warn("[custom-stage] 连线项不是普通对象，已跳过"); continue; }
    const from = stagedById(c.from);
    const to = stagedById(c.to);
    if (!from || !to) { warn(`[custom-stage] 连线 ${c.id || "?"} 引用了不存在的实例，已跳过`); continue; }
    if (typeof c.out !== "string" || typeof c.in !== "string") { warn(`[custom-stage] 连线 ${c.id || "?"} 的 out/in 不是字符串，已跳过`); continue; }
    if (c.out.startsWith("on")) {
      // 事件连线：注入 from 的 props[c.out]（回调 → 调 to 的 api[c.in]）
      if (markInjected(from, c.out)) {
        warn(`[custom-stage] 连线 ${c.id || "?"} 重复注入实例 ${from.id} 的 "${c.out}"，后者覆盖前者`);
      }
      propOf(from)[c.out] = (...args) => {
        const api = apis.get(to.id);
        if (api && typeof api[c.in] === "function") {
          try { api[c.in](...args); } catch (e) { console.error("[连线] 动作执行失败:", e); }
        } else {
          console.warn(`[连线] 目标实例无 "${c.in}" 动作，已忽略`);
        }
      };
    } else {
      // 数据连线：注入 to 的 props[c.in]（惰性函数 → 调 from 的 api[c.out]）
      if (markInjected(to, c.in)) {
        warn(`[custom-stage] 连线 ${c.id || "?"} 重复注入实例 ${to.id} 的 "${c.in}"，后者覆盖前者`);
      }
      propOf(to)[c.in] = () => {
        const api = apis.get(from.id);
        const v = api && typeof api[c.out] === "function" ? api[c.out]() : undefined;
        return v !== undefined ? v : [];
      };
    }
  }
  return rp;
}
