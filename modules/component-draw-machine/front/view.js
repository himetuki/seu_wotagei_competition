/**
 * component-draw-machine —— 抽签 / 随机匹配「闪现滚动 → 定格」动画组件（L2 组件类插件）
 *
 * 职责边界：只做**展示层动画**（滚动 N 个 tick → 定格 → 回调），业务语义（抽到后写状态 /
 * 存档 / 提示 / 划线 / 进入下一轮）一律由调用方在 onResult 里完成，组件不碰持久化与网络。
 *
 * 用法（页面 component 内命令式取用，P11 问 2）：
 *   const factory = ctx.ui.component("draw-machine");
 *   const cleanup = factory?.(el.querySelector("[data-slot=draw]"), {
 *     items: () => getMusicList(),        // Array | () => Array
 *     display: "[data-draw-display]",     // 不传则用 hostEl 自身
 *     trigger: "#draw-btn",               // 不传则通过 onReady 拿 api.draw
 *     ticks: 15, tickMs: 80,
 *     onResult: (item) => { state.music = item; saveState(); },
 *   });
 *
 * 契约：factory(hostEl, props, ctx) => cleanup；组件只在 hostEl 内部渲染（display/trigger 由调用方
 *       以选择器显式授权，选择器先在 hostEl 内解析，未命中再落到 document）。
 *
 * 随机性（P11 §3 问 1 裁决）：本组件只负责动画节奏，不做洗牌。默认随机源直接 import
 *       L1 共享库 /web/lib/random.mjs 的 pickOne（等概率单抽，替换 11 处 Math.floor(Math.random()*n)
 *       的散落写法）；有特殊需要时调用方传 pick: (list) => ... 覆盖。
 *
 * 定时器：全部经 setInterval/setTimeout 句柄登记，cleanup / cancel 时必然清除（原 bg1/bg2/
 *         movement-teaching 等处的闪现 interval 是局部 const，组件卸载时无法回收——此处修复）。
 *
 * 无 trigger 时自建默认抽取按钮（编排兜底）：props 完全不提 trigger（undefined，如 game-composer /
 * custom-stage 零 props 排布）才自建；显式传 null 或选择器 = 调用方刻意接管，一律不自建。
 */

import { pickOne } from "/web/lib/random.mjs";

/** 默认参数（props 覆盖） */
const DEFAULTS = {
  ticks: 15, // 闪现次数（9 处为 15，drag 为 40）
  tickMs: 80, // 闪现间隔（9 处为 80，drag 为 50）
  cycle: false, // false = 每 tick 随机跳（10 处现状）；true = 顺序循环（drag 现状）
  rollingClass: "rolling", // 滚动中挂到 display 的类
  resultClass: "selected", // 定格后挂到 display 的类
  colors: null, // { rolling, result } —— 兼容既有内联色（#fbbf24 / #10b981），默认不改色
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** prefers-reduced-motion 回退：命中时跳过闪现，直接定格（无障碍） */
function prefersReducedMotion() {
  return (
    typeof matchMedia === "function" &&
    matchMedia(REDUCED_MOTION_QUERY).matches === true
  );
}

/** 安全调用调用方回调：回调抛错不破坏组件状态机 */
function call(fn, ...args) {
  if (typeof fn !== "function") return;
  try {
    fn(...args);
  } catch (e) {
    console.error("[draw-machine] 回调抛错:", e);
  }
}

function resolveValue(v) {
  return typeof v === "function" ? v() : v;
}

/** Element | 选择器 → 节点；":host" = hostEl 自身；选择器先 hostEl 后 document */
function resolveNode(host, ref) {
  if (!ref) return null;
  if (typeof ref !== "string") return ref;
  if (ref === ":host") return host || null;
  const inner = host && typeof host.querySelector === "function" ? host.querySelector(ref) : null;
  if (inner) return inner;
  return typeof document !== "undefined" ? document.querySelector(ref) : null;
}

/** 池元素 → 展示文本：字符串原样，对象取 name / label */
function itemText(item, format) {
  if (typeof format === "function") return String(format(item));
  if (item == null) return "";
  if (typeof item === "object") {
    return String(item.name != null ? item.name : item.label != null ? item.label : "");
  }
  return String(item);
}


/**
 * 创建抽签动画组件实例。
 * @param {Element} hostEl 组件宿主（只操作其内部）
 * @param {object} props
 *   items        Array | () => Array   候选池（必填；空 → onEmpty，不动画）
 *   ticks        number = 15          闪现次数（含定格那一次）
 *   tickMs       number = 80          闪现间隔（ms）
 *   cycle        boolean = false      true = 顺序循环闪现，false = 每 tick 随机跳
 *   pick         (list) => item       随机源（默认均匀单点；可注入 random.mjs 的 pickOne）
 *   display      Element | selector   展示节点（默认 hostEl 自身）
 *   format       (item) => string     展示文本格式化（如去掉 .mp3 后缀）
 *   colors       { rolling, result }  可选内联色（兼容既有 #fbbf24 / #10b981），默认不改色
 *   trigger      Element | selector   触发按钮（点击 → draw()，滚动期间 disabled）；完全不传时
 *                                     自建默认「抽取」按钮（编排兜底），显式 null = 刻意不绑
 *   onStart      ({ items, total })   滚动真正开始的**同步**钩子：在 draw() 内、首个 tick 之前调用
 *                                     （total = 本次闪现次数，语义同 onTick 的 total）。调用方可在此
 *                                     禁用「开始」按钮，消除只能借 onTick 而留出的 ~tickMs 抢点窗口。
 *                                     prefers-reduced-motion 直接定格（不滚动）时不触发；不传即无行为。
 *   onTick       (item, i, total)     每个闪现 tick 回调
 *   onResult     (item, api)          定格回调（业务入口）
 *   onEmpty      ()                   候选池为空（调用方自行 toast）
 *   onReady      (api)                实例就绪，交出 { draw, cancel, isRolling, getResult }
 * @param {object} ctx 内核上下文（保留契约形参，本组件不依赖内核服务）
 * @returns {Function|undefined} cleanup
 */
export function createDrawMachine(hostEl, props = {}, ctx) {
  if (!hostEl) return undefined;
  const p = { ...DEFAULTS, ...props };
  const pick = typeof p.pick === "function" ? p.pick : pickOne;
  const ctrl = new AbortController();
  const { signal } = ctrl;

  // 无 trigger 时自建默认抽取按钮（编排兜底）：仅 props 完全不提 trigger（undefined）才建，
  // 显式传 null / 选择器 = 调用方刻意接管，不自建（既有 9 个消费页全部显式传 trigger，零影响）。
  // 此时 display 缺省本指向宿主自身，而 paint 以 textContent 覆写宿主会抹掉按钮，故一并自建
  // 专用展示子节点（既有消费页全部传显式 display，不进此分支）。
  const ownNodes = []; // 组件自建节点（默认展示节点 / 默认按钮），cleanup 时移除
  let ownDisplay = null;
  let trigger = resolveNode(hostEl, p.trigger);
  if (p.trigger === undefined && !trigger) {
    ownDisplay = document.createElement("span");
    ownDisplay.className = "draw-machine__default-display";
    trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "draw-machine__default-trigger";
    trigger.textContent = "抽取";
    hostEl.append(ownDisplay, trigger);
    ownNodes.push(ownDisplay, trigger);
  }
  const explicitDisplay = resolveNode(hostEl, p.display);
  const display =
    explicitDisplay && explicitDisplay !== hostEl
      ? explicitDisplay
      : ownDisplay || hostEl;

  let timer = null;
  let result = null;
  let prevColor = null; // 内联色回滚用

  function applyColor(color) {
    if (!display || !color) return;
    if (prevColor === null) prevColor = display.style.color || "";
    display.style.color = color;
  }

  function paint(item, isResult) {
    if (!display) return;
    display.textContent = itemText(item, p.format);
    if (display.classList) {
      display.classList.toggle(p.rollingClass, !isResult);
      display.classList.toggle(p.resultClass, isResult);
    }
    if (p.colors) applyColor(isResult ? p.colors.result : p.colors.rolling);
  }

  function clearTimer() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function restore() {
    clearTimer();
    if (display && display.classList) {
      display.classList.remove(p.rollingClass, p.resultClass);
    }
    if (display && prevColor !== null) {
      display.style.color = prevColor;
      prevColor = null;
    }
    if (trigger) trigger.disabled = false;
  }

  /** 定格：选定最终结果 → 上屏 → 回调 */
  function finish(list) {
    clearTimer();
    result = pick(list);
    paint(result, true);
    if (trigger) trigger.disabled = false;
    call(p.onResult, result, api);
  }

  /** 开始滚动（重复点击在滚动期间被忽略） */
  function draw() {
    if (timer !== null) return false;
    const list = resolveValue(p.items);
    if (!Array.isArray(list) || list.length === 0) {
      call(p.onEmpty);
      return false;
    }
    if (trigger) trigger.disabled = true;

    const total = Math.max(1, Number(p.ticks) || DEFAULTS.ticks);

    // 无障碍：减少动效偏好者直接看结果，不做 15 次闪烁（不滚动 → onStart 不触发，onResult 直接回调）
    if (prefersReducedMotion()) {
      finish(list);
      return true;
    }

    // ★ B4 缺陷 3：滚动开始的同步钩子（先于首个 tick，抢点窗口 0ms）。不传即无行为。
    call(p.onStart, { items: list, total });

    let i = 0;
    timer = setInterval(() => {
      i += 1;
      if (i < total) {
        const item = p.cycle ? list[(i - 1) % list.length] : pick(list);
        paint(item, false);
        call(p.onTick, item, i, total);
      } else {
        finish(list);
      }
    }, Math.max(1, Number(p.tickMs) || DEFAULTS.tickMs));
    return true;
  }

  /**
   * 中止滚动（不产生 onResult）。
   * ★ 缺陷修复：与 cleanup() 走同一条回滚路径 —— 内联色（colors.rolling）与
   *   rolling/selected 类一并复位。旧实现只摘 rolling 类，滚动中取消后 display
   *   会停在 colors.rolling（如 #fbbf24），直到组件卸载才恢复。
   */
  function cancel() {
    restore();
    return true;
  }

  const api = {
    draw,
    cancel,
    isRolling: () => timer !== null,
    getResult: () => result,
    getDisplay: () => display,
  };

  if (trigger) {
    trigger.addEventListener(
      "click",
      (e) => {
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        draw();
      },
      { signal }
    );
  }

  call(p.onReady, api);

  /** cleanup：清定时器 + 摘监听 + 回滚 display 状态 + 移除自建节点（幂等） */
  return function cleanup() {
    restore();
    ctrl.abort();
    for (const n of ownNodes) {
      if (n && n.parentNode) n.parentNode.removeChild(n);
    }
  };
}
