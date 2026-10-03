/**
 * game-composer 纯函数集（node 可单测，无 DOM / 无监听 / 无模块级可变状态）
 *
 * 依据规格 .tmp/p14-layout-spec.md §1（Layout Schema）与 §3（layoutToConfig 换算）、
 * .tmp/p15-wiring-spec.md §3（buildRuntimeProps 连线注入）：
 * 编辑器预览与运行时页（custom-stage）各自内置同等换算，勿提为共享文件——本文件
 * 属 game-composer 模块私有，不是共享资产。
 */

/**
 * 内置组件中文名/描述/连线词汇表（palette 与连线编辑用）。
 * 未知组件名兜底显示原名；advanced = 需要运行时数据、一般不宜直接排布的组件。
 * outs/ins（P15 §4）：编辑器连线表单的引导词汇（{name,label} 数组），只是 UI 引导
 * 而非运行时依赖——运行时只认字符串、宽松降级；服务类组件（toast/confirm-dialog）为空数组。
 */
export const PALETTE_META = Object.freeze({
  "music-source": {
    label: "曲库数据源",
    desc: "经 music-library API 拉取曲库；把「曲库列表（数据）」连到 抽签机/音乐播放 的「候选池」即可免手写 items",
    advanced: false,
    outs: [{ name: "getList", label: "曲库列表（数据）" }],
    ins: [],
  },
  "player-list": {
    label: "选手名单",
    desc: "读取选手 JSON 并渲染可选名单网格",
    advanced: false,
    outs: [{ name: "getSelected", label: "已选名单（数据）" }],
    ins: [],
  },
  "score-board": {
    label: "计分板",
    desc: "多队加减分与清零，状态仅内存",
    advanced: false,
    outs: [{ name: "getScores", label: "各队比分（数据）" }],
    ins: [],
  },
  countdown: {
    label: "倒计时",
    desc: "mm:ss 倒计时，可调分/开始暂停/重置",
    advanced: false,
    outs: [],
    ins: [],
  },
  "music-player": {
    label: "音乐播放",
    desc: "无 props 可用：无 trigger/startTrigger 时自建「抽取音乐/播放」按钮；候选池可经数据连线（选手名单→候选池）或 props.items 提供；抽取定格走 onDrawn 事件",
    advanced: true,
    outs: [{ name: "onDrawn", label: "抽取定格（事件）" }],
    ins: [
      { name: "items", label: "候选池（数据）" },
      { name: "play", label: "播放曲目（动作）" },
    ],
  },
  "draw-machine": {
    label: "抽签机",
    desc: "无 props 可用：无 trigger 时自建抽取按钮；候选池可经数据连线（选手名单→候选池）或 props.items 提供",
    advanced: true,
    outs: [
      { name: "onResult", label: "抽签定格（事件）" },
      { name: "getResult", label: "当前结果（数据）" },
    ],
    ins: [{ name: "items", label: "候选池（数据）" }],
  },
  toast: { label: "轻提示", desc: "页面服务类组件，一般不排布", advanced: true, outs: [], ins: [] },
  "confirm-dialog": {
    label: "确认对话框",
    desc: "页面服务类组件，一般不排布",
    advanced: true,
    outs: [],
    ins: [],
  },
});

/** 组件名 → 中文名（未知名兜底显示原名） */
export function componentLabel(name) {
  const meta = Object.prototype.hasOwnProperty.call(PALETTE_META, name)
    ? PALETTE_META[name]
    : null;
  return meta ? meta.label : String(name);
}

/**
 * 参与 slot 装配的 items（唯一过滤谓词，预览宿主 DOM 与 layoutToConfig 共用）：
 * 过滤掉缺 component 或缺 id 的实例——缺 id 若不跳过会生成 "[data-slot=undefined]"
 * 选择器，在预览/运行台残留永远挂不上组件的空插槽（与 custom-stage 语义对齐）。
 * 缺 id 时 console.warn 上报（缺 component 维持规格 §3 的静默跳过）。
 * @returns {Array<{ id: string, component: string, title?: string, props?: object }>}
 */
export function stageItems(layout) {
  const out = [];
  // 非数组 items（畸形 layout 直接喂入时）回退空表，与 custom-stage 镜像实现同口径
  const items = layout && Array.isArray(layout.items) ? layout.items : [];
  for (const item of items) {
    const name = item && item.component;
    if (!name) continue; // 规格 §3 原语义：无组件名的项静默跳过
    if (typeof item.id !== "string" || !item.id) {
      console.warn(
        "[game-composer] item 缺少 id，已跳过该实例（不生成插槽）：",
        safeItemText(item),
      );
      continue;
    }
    out.push(item);
  }
  return out;
}

/** warn 输出用的 item 概要（序列化失败降级 String，不让上报路径再抛错） */
function safeItemText(item) {
  try {
    return JSON.stringify(item);
  } catch (e) {
    return String(item);
  }
}

/**
 * Layout → mountFromConfig 的 config 换算（规格 §3 语义 + 缺 id 实例跳过）。
 *
 * 关键语义：compose.mjs 对 compose 数组里的同名组件会整组挂载其全部 slots，
 * 故 compose 必须按组件名去重（首现顺序），slots/components 按组件名分组、
 * 组内保持 items 出现顺序（= 多实例下标一一对应）。
 * @param {{ items?: Array<{ id?: string, component?: string, title?: string, props?: object }> }} layout
 * @returns {{ compose: string[], slots: Record<string, string[]>, components: Record<string, object[]> }}
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
 * 连线注入的运行时 props 构造（规格 P15 §3 伪代码的忠实实现）。
 *
 * @param {{ items?: Array<object>, connections?: Array<object> }} layout 布局（items 走 stageItems 过滤）
 * @param {Map<string, object>} apis 实例 api 表（键 = item.id；由注入的 onReady 同步回填）
 * @param {(msg: string) => void} [warn] 跳过连线时的告警出口（缺省 console.warn）
 * @returns {Record<string, object[]>} 组件名 → props 数组（下标 = 组内实例序，与 slots 对齐）
 *   - 数据连线（out 不以 "on" 开头）：注入 to 的 props[in] = 惰性函数 → 调 from 的 api[out]()，
 *     返回 undefined 时兜底 []（draw-machine / music-player 的 items prop 接受 Array | () => Array）
 *   - 事件连线（out 以 "on" 开头）：注入 from 的 props[out] = 回调 → 调 to 的 api[in](...args)
 *   - 引用不存在实例 / out/in 非字符串的连线：warn 后跳过；同一 prop 被多条连线注入时
 *     后者覆盖前者并 warn 一条（事件与数据线都算；编辑器拦截建重复，此处兜底直写 API 的存量数据）
 */
export function buildRuntimeProps(layout, apis, warn) {
  const report = typeof warn === "function" ? warn : () => {};
  const staged = stageItems(layout);
  const stagedById = new Map(staged.map((item) => [item.id, item]));

  const groups = {}; // 组件名 → 该组 staged items（顺序 = 组内实例序，与 slots 一一对齐）
  for (const item of staged) (groups[item.component] ??= []).push(item);

  const rp = {}; // 组件名 → props 数组（下标 = 组内实例序）
  const propOf = (item) => rp[item.component][groups[item.component].indexOf(item)];

  for (const [name, items] of Object.entries(groups)) {
    rp[name] = items.map((item) => ({
      ...(item.props && typeof item.props === "object" ? item.props : {}),
      onReady: (api) => apis.set(item.id, api),
    }));
  }

  const connections = layout && Array.isArray(layout.connections) ? layout.connections : [];
  const injected = new Map(); // item.id → Set(已被连线注入的 prop 名)，重复注入检测用（与 custom-stage 镜像）
  const markInjected = (item, prop) => {
    let props = injected.get(item.id);
    if (!props) injected.set(item.id, (props = new Set()));
    const dup = props.has(prop);
    props.add(prop);
    return dup;
  };
  for (const c of connections) {
    const from = stagedById.get(c && c.from);
    const to = stagedById.get(c && c.to);
    if (!from || !to) {
      report(`[连线] ${c && c.id ? c.id : "?"} 引用了不存在的实例，已跳过`);
      continue;
    }
    if (typeof c.out !== "string" || typeof c.in !== "string") {
      report(`[连线] ${c.id || "?"} 的 out/in 必须为字符串，已跳过`);
      continue;
    }
    if (c.out === "onReady" || c.in === "onReady") {
      // 保留口名：onReady 是注入的 api 注册钩子，被连线占用会让该实例的
      // 全部数据连线取值回落 []（后端已拒绝新建，此处兜底直写 API 的存量数据）
      report(`[连线] ${c.id || "?"} 使用了保留口名 "onReady"，已跳过`);
      continue;
    }
    if (c.out.startsWith("on")) {
      // 事件连线：注入 from 的 props[c.out]（回调 → 调 to 的 api[c.in]）
      if (markInjected(from, c.out)) {
        report(`[连线] ${c.id || "?"} 重复注入实例 ${from.id} 的 "${c.out}"，后者覆盖前者`);
      }
      propOf(from)[c.out] = (...args) => {
        const api = apis.get(to.id);
        if (api && typeof api[c.in] === "function") {
          try {
            api[c.in](...args);
          } catch (e) {
            console.error("[连线] 动作执行失败:", e);
          }
        } else {
          console.warn(`[连线] 目标实例无 "${c.in}" 动作，已忽略`);
        }
      };
    } else {
      // 数据连线：注入 to 的 props[c.in]（惰性函数 → 调 from 的 api[c.out]）
      if (markInjected(to, c.in)) {
        report(`[连线] ${c.id || "?"} 重复注入实例 ${to.id} 的 "${c.in}"，后者覆盖前者`);
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

/** 纯 JSON 值深拷贝（props 契约为纯 JSON：无函数/DOM/循环引用，JSON 往返安全） */
function deepClone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (e) {
      /* 非可克隆值回退 JSON 往返 */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

/** 连线纯 JSON 清洗（五键剥离；畸形项降级为仅含合法字符串键的对象，不抛错） */
function cloneConnection(c) {
  if (!c || typeof c !== "object") return {};
  return {
    ...(typeof c.id === "string" ? { id: c.id } : {}),
    ...(typeof c.from === "string" ? { from: c.from } : {}),
    ...(typeof c.out === "string" ? { out: c.out } : {}),
    ...(typeof c.to === "string" ? { to: c.to } : {}),
    ...(typeof c.in === "string" ? { in: c.in } : {}),
  };
}

/** 深拷贝布局（加载进编辑态时用，绝不与列表对象共享引用——含 props 嵌套层与 connections） */
export function cloneLayout(layout) {
  if (!layout || typeof layout !== "object") {
    return { id: "", name: "", items: [], connections: [], updatedAt: "" };
  }
  const items = Array.isArray(layout.items)
    ? layout.items.map((it) =>
        it && typeof it === "object"
          ? {
              ...(typeof it.id === "string" ? { id: it.id } : {}),
              component: it.component,
              ...(typeof it.title === "string" ? { title: it.title } : {}),
              ...(it.props && typeof it.props === "object" ? { props: deepClone(it.props) } : {}),
            }
          : { component: "" },
      )
    : [];
  const connections = Array.isArray(layout.connections)
    ? layout.connections.map(cloneConnection)
    : [];
  return {
    id: typeof layout.id === "string" ? layout.id : "",
    name: typeof layout.name === "string" ? layout.name : "",
    updatedAt: typeof layout.updatedAt === "string" ? layout.updatedAt : "",
    items,
    connections,
  };
}

/**
 * 生成实例 uid："it-<序号>-<3位hex>"，保证在 existing（Set/数组）中唯一。
 * @param {number} seq 序号（调用方自增）
 * @param {Set<string>|string[]|null} existing 已占用 id 集合
 * @param {() => number} [rand] 随机源（可注入，测试确定性）
 */
export function makeItemId(seq, existing = null, rand = Math.random) {
  const taken = existing instanceof Set ? existing : new Set(existing || []);
  for (let guard = 0; guard < 64; guard++) {
    const hex = Math.floor(rand() * 0x1000)
      .toString(16)
      .padStart(3, "0");
    const id = `it-${seq}-${hex}`;
    if (!taken.has(id)) return id;
  }
  // 兜底：随机 64 次仍碰撞（实际不可能），用序号保底唯一
  return `it-${seq}-${String(seq).padStart(3, "0")}`;
}

/** props 摘要：JSON.stringify 后截断 max 字符（超长加省略号），空对象显示 "{}" */
export function propsSummary(props, max = 40) {
  let text;
  try {
    text = JSON.stringify(props === undefined ? {} : props);
  } catch (e) {
    text = String(props);
  }
  if (typeof text !== "string") text = String(text);
  if (text.length > max) return text.slice(0, max) + "…";
  return text;
}

/** ISO 时间 → "YYYY-MM-DD HH:mm"（本地时区）；非法输入返回空串 */
export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
