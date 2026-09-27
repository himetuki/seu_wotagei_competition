/**
 * component-music-player —— 抽音乐滚动动画 + 播放 + 比赛模式（L2 组件类插件）
 *
 * 收敛原 9 处分叉实现（battle-group1 / -1-2 / 2 / 2-2、drag、group-battle ×3、music-draw）：
 *   抽取滚动（N tick）→ 定格 → 播放 <audio> → 进 battle 全屏模式 → 双击（或单击 / 播放结束）退出
 *
 * 与 P11 §5.3 陷阱清单逐条对应：
 *   1. <audio id="music-player"> 跨页契约：hostEl 内自带 audio 优先，其次复用宿主页既有元素
 *      （#music-player，再兼容 bg2/bg2-2 的 #musicPlayer），全缺失时才在 hostEl 内自建；cleanup
 *      只回滚自己的改动，宿主原有 audio 只做 pause/归零/摘 onended，绝不删除。
 *      ★ 多实例共享同一宿主 audio 时（按 id 命中同一元素），start() 必按当前 current 校正 src，
 *        避免"点 A 的开始键播 B 的歌"（B4 缺陷 1，P0）。
 *   2. body class 全局副作用：battle-mode（+ battle-keep-bg）由本实例登记后必然释放；跨实例引用
 *      计数保证同页多实例（music-draw 三曲库）时最后一个退出者才移除 class，中途卸载不残留。
 *   3. document 级监听：dblclick / click 挂在**播放生命周期**独立 AbortController 上，退出与
 *      cleanup 都会解绑（动画期间不注册，避免误退）。
 *   4. localStorage：组件自身不写任何 key；keepBgKey 仅**只读**既有设置键（如 dragBattleKeepBg），
 *      不改名、不新增，老存档不受影响。
 *   5. 定时器：滚动 / 打字 / 待播 / 提示 四个句柄统一登记，stop 与 cleanup 全部清除。
 *
 * 用法（页面 component 内命令式取用，P11 问 2）：
 *   const factory = ctx.ui.component("music-player");
 *   const cleanup = factory?.(el.querySelector("[data-slot=music]"), {
 *     items: () => BattleState.musicList,
 *     folder: "1yearplus",
 *     display: "#music-name",
 *     trigger: "#draw-music-btn",
 *     startTrigger: "#play-music-btn",
 *     overlay: { textContent: "BATTLE START", readyMs: 4500 },
 *     onDrawn: ({ item }) => { BattleState.music = item; saveGameState(); },
 *   });
 *
 * 契约：factory(hostEl, props, ctx) => cleanup；组件默认只在 hostEl 内部渲染（audio 为唯一例外——
 *       按 id 复用宿主页元素是本组件的既有跨页契约，见上）。display/trigger 选择器先在 hostEl 内
 *       解析，未命中再落到 document，便于页面把插槽与既有骨架节点对接。
 */

import { pickOne } from "/web/lib/random.mjs";
import { createBodyClassRef } from "/web/lib/body-class.mjs";

const MUSIC_ROOT = "/resource/musics/";
const DEFAULT_FOLDER = "1yearplus"; // 与 drag `lastDrawnMusicSource || "1yearplus"` 一致

/** 组件的 body 级状态类（AGENTS §3.1 规范值；P12 起不再可经 props 覆盖） */
const CANONICAL_BODY_CLASS = "battle-mode";
const KEEP_BG_CLASS = "battle-keep-bg";

/**
 * 跨实例 body class 引用计数（P12）：由 L1 资产 /web/lib/body-class.mjs 承载——
 * 同页多实例时只有最后一个释放者移除 class（组件纪律第 2 条），替代原模块级
 * bodyModeUsers 手写计数（组件纪律第 3 条"禁模块级可变状态"的唯一豁免就此消除）。
 */
const modeRef = createBodyClassRef({ className: CANONICAL_BODY_CLASS });
const keepRef = createBodyClassRef({ className: KEEP_BG_CLASS });

const DEFAULTS = {
  rollTicks: 15, // 闪现次数（9 处为 15，drag 为 40）
  tickMs: 80, // 闪现间隔（9 处为 80，drag 为 50）
  cycle: false, // false = 随机跳；true = 顺序循环（drag）
  preloadOnDraw: true, // 抽中即设置 audio.src（group-battle/bg1/bg2 现状）
  exitOnDblclick: true, // 双击退出（AGENTS §3.1）
  exitOnClick: false, // 单击退出（bg1/bg1-2/bg2/bg2-2 现状；用 startTrigger 时建议 false）
  exitOnEnded: true, // 播放结束自动退出
  rollingClass: "rolling", // 滚动中挂到 display 的类（drag 的 .music-display.rolling）
  resultClass: "selected", // 定格后挂到 display 的类（drag 的 .music-display.selected）
};

const OVERLAY_DEFAULTS = {
  enabled: true, // false = 不加遮罩/打字动画，直接播放（drag 现状）
  textContent: "BATTLE START", // bg1/bg2 为 "BATTLE START"，bg2-2 为 "BATTLE MODE"
  textMs: 130, // 打字间隔（bg1/bg2 为 100ms 级；gb/music-draw 为 130ms）
  readyMs: 4500, // 动画时长，结束后开始播放（bg2-2 为 3000）
  hintMs: 1500, // 播放结束提示的延迟显示
  hintText: "双击任意位置停止",
  hintId: null, // 需保留 bg 组 `#click-to-stop-hint` 既有 CSS 时显式传该 id；默认不设 id（避免多实例重复 id）
  skipOnClick: false, // true = 点击遮罩跳过动画立即播放（group-battle 现状）
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion() {
  return (
    typeof matchMedia === "function" &&
    matchMedia(REDUCED_MOTION_QUERY).matches === true
  );
}

function call(fn, ...args) {
  if (typeof fn !== "function") return;
  try {
    fn(...args);
  } catch (e) {
    console.error("[music-player] 回调抛错:", e);
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

/** 隐藏/显示：同时兼容 .hidden 类（music-draw / group-battle 的 `display:none !important`）、
 *  hidden 属性与内联 display 三种既有约定 */
function setHidden(el, hide) {
  if (!el) return;
  el.hidden = !!hide;
  if (el.classList) el.classList.toggle("hidden", !!hide);
  if (el.style) el.style.display = hide ? "none" : "";
}

function itemName(item) {
  if (item == null) return "";
  if (typeof item === "object") return String(item.name != null ? item.name : "");
  return String(item);
}

/**
 * 创建音乐播放 + 比赛模式组件实例。
 * @param {Element} hostEl 组件宿主（只操作其内部 + 按 id 复用宿主页既有 audio）
 * @param {object} props
 *   items          Array | () => Array   当前曲库曲目池（字符串或 { name, folder }；空 → onEmpty）
 *   folder         string | () => string 曲库文件夹（默认 "1yearplus"；元素上的 folder 优先）
 *   rollTicks      number = 15           闪现次数
 *   tickMs         number = 80           闪现间隔（ms）
 *   cycle          boolean = false       true = 顺序循环闪现（drag）
 *   pick           (list) => item        随机源（默认 = /web/lib/random.mjs 的 pickOne；可覆盖）
 *   display        Element | selector    曲名展示节点（未传或 ":host" → 宿主内自建
 *                                        .cmp-music__display 内容子节点，不覆写宿主 textContent，
 *                                        以免抹掉宿主内的遮罩/hint 节点；见缺陷 5）
 *   format         (item) => string      展示文本格式化（如去 .mp3 后缀）
 *   audio          Element | selector    复用既有 audio（默认探测 hostEl 内 audio → #music-player
 *                                        → #musicPlayer → 自建）
 *   preloadOnDraw  boolean = true        抽中即设置 audio.src
 *   keepBg         boolean | () => boolean  播放时加 battle-keep-bg
 *   keepBgKey      string                只读 localStorage 键（localStorage[key] !== "false" 即真，
 *                                        与 drag "dragBattleKeepBg" 语义一致；显式 keepBg 优先）
 *   overlay        object                见 OVERLAY_DEFAULTS（enabled/textContent/textMs/readyMs/
 *                                        hintMs/hintText/hintId/skipOnClick）
 *   exitOnDblclick boolean = true        双击任意位置退出
 *   exitOnClick    boolean = false       单击任意位置退出（bg1/bg2 现状）
 *   exitOnEnded    boolean = true        播放结束自动退出
 *   rollingClass   string = "rolling"    滚动中挂到 display 的类
 *   resultClass    string = "selected"   定格后挂到 display 的类
 *   trigger        Element | selector    抽取按钮（点击 → draw()，滚动期间 disabled）
 *   startTrigger   Element | selector    播放按钮（点击 → 播放中则 stop，否则 start()）
 *   onDrawn        ({ item, name, url }) 定格回调（业务写状态/存档入口）
 *   onOverlayShown ({ host, overlay, text, hint })
 *                                        进入比赛模式、遮罩已显示、逐字动画开始**之前**触发
 *                                        （页面接"进入模式即抖屏/抖文字"一类钩子用；不传即无行为）。
 *                                        仅 overlay.enabled 时触发
 *   onStarted      ({ item, name, url }) 音乐真正开始播放
 *   onExited       ({ reason, item })    退出（reason: "ended" | "toggle" | "manual" | "error" | "user"）
 *   onError        (err)                 播放失败（autoplay 拦截/资源缺失）
 *   onEmpty        ()                    未抽到音乐 / 曲库为空
 *   onTick         (item, i, total)      每个闪现 tick
 *   onReady        (api)                 交出 { draw, start, stop, toggle, setItem, clearItem,
 *                                        getItem, isPlaying, isBusy, getPhase, getAudio }
 *                                        其中 start(opts) / toggle(opts) 支持 { skipOverlay: true }：
 *                                        跳过遮罩/逐字/待播立即播放（重播场景，B4 缺陷 4）。
 *                                        clearItem() = 清 current + 暂停/归零/摘 src + 摘
 *                                        rolling/selected 类 + 清空展示文本（文案归调用方）。
 * @param {object} ctx 内核上下文（保留契约形参，本组件不依赖内核服务）
 * @returns {Function|undefined} cleanup
 */
export function createMusicPlayer(hostEl, props = {}, ctx) {
  if (!hostEl || typeof document === "undefined" || !document.body) return undefined;
  const p = { ...DEFAULTS, ...props };
  const ov = { ...OVERLAY_DEFAULTS, ...(props.overlay || {}) };
  const pick = typeof p.pick === "function" ? p.pick : pickOne;
  const ctrl = new AbortController(); // 实例级监听（按钮）
  const { signal } = ctrl;
  const ownNodes = []; // 组件自建节点，cleanup 时移除

  let current = null;
  let phase = "idle"; // idle | rolling | starting | playing
  let holdsBodyMode = false;
  let holdsKeepBg = false; // 本实例是否持有 battle-keep-bg 引用（释放时成对归还 keepRef）
  let playCtrl = null; // 播放生命周期监听（document dblclick/click）
  let rollTimer = null;
  let typeTimer = null;
  let readyTimer = null;
  let hintTimer = null;

  // ★ 缺陷 5：display 默认（未传或 ":host"）不再直接写宿主 textContent —— 宿主内还有组件自建的
  //   遮罩（ensureOverlay 挂 hostEl）与提示节点，写 textContent 会把它们整体抹掉。
  //   改为在宿主内自建专用内容子节点（类名 .cmp-music__display，随 ownNodes 在 cleanup 移除）；
  //   显式传入 display 选择器/元素的调用方行为逐字不变（现有调用方全部传显式 display）。
  const explicitDisplay = resolveNode(hostEl, p.display);
  const display =
    explicitDisplay && explicitDisplay !== hostEl
      ? explicitDisplay
      : createNode("span", "cmp-music__display", hostEl);
  const trigger = resolveNode(hostEl, p.trigger);
  const startTrigger = resolveNode(hostEl, p.startTrigger);

  /* ---------- DOM：audio / 遮罩 / 提示 ---------- */

  function createNode(tag, cls, parent) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    (parent || hostEl).appendChild(el);
    ownNodes.push(el);
    return el;
  }

  function resolveAudio() {
    const explicit = resolveNode(hostEl, p.audio);
    if (explicit) return explicit;
    // ★ B4 缺陷 1：宿主内自带 audio 优先于按 id 复用。多实例页面若每个宿主各持一个 audio，
    //   不能因为页面里恰好还有 #music-player 就全部命中间一元素（相互抢歌）。
    //   单实例页面宿主（空 [data-slot]）内无 audio → 仍按 id 复用骨架 #music-player，行为不变。
    const inner = typeof hostEl.querySelector === "function" ? hostEl.querySelector("audio") : null;
    if (inner) return inner;
    for (const id of ["music-player", "musicPlayer"]) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    const el = createNode("audio", "cmp-music__audio", hostEl); // 自建：组件卸载时随 ownNodes 移除
    el.preload = "none";
    return el;
  }

  function ensureOverlay() {
    if (!ov.enabled) return { root: null, text: null, hint: null };
    const root = createNode("div", "battle-overlay cmp-music__overlay");
    const text = createNode("div", "battle-start battle-start-text cmp-music__text", root);
    const hint = createNode("div", "click-to-stop cmp-music__hint"); // 与 root 平级：root 隐藏后提示仍在
    if (ov.hintId) hint.id = ov.hintId;
    hint.textContent = ov.hintText;
    setHidden(root, true);
    setHidden(hint, true);
    return { root, text, hint };
  }

  const audio = resolveAudio();
  const nodes = ensureOverlay();

  /* ---------- 视觉状态 ---------- */

  function paint(item, isResult) {
    if (!display) return;
    display.textContent = typeof p.format === "function" ? String(p.format(item)) : itemName(item);
    if (display.classList) {
      display.classList.toggle(p.rollingClass || "rolling", !isResult);
      display.classList.toggle(p.resultClass || "selected", isResult);
    }
  }

  function resolveItems() {
    const list = resolveValue(p.items);
    return Array.isArray(list) ? list : [];
  }

  function itemFolder(item) {
    if (item && typeof item === "object" && item.folder) return String(item.folder);
    const f = resolveValue(p.folder);
    return f ? String(f) : DEFAULT_FOLDER;
  }

  function itemUrl(item) {
    return MUSIC_ROOT + itemFolder(item) + "/" + itemName(item);
  }

  function describe(item) {
    return { item, name: itemName(item), url: itemUrl(item), folder: itemFolder(item) };
  }

  function setAudioSrc(item) {
    if (!audio) return;
    audio.src = itemUrl(item);
    if (typeof audio.load === "function") audio.load();
  }

  /**
   * 确保 audio.src 指向 item；仅当当前 src 不是同一曲目时才重设。
   * ★ B4 缺陷 1（P0）修复点：同页多实例共享同一 <audio>（例如都按 id 命中 #music-player）时，
   *   A 抽取 → B 抽取会把元素 src 覆写成 B 的曲目；点 A 的「开始」必须把 src 拉回 A 的 current，
   *   否则播放的是 B 的歌。旧实现只在 `!audio.src` 时设置，src 已被别的实例写脏时不会纠正。
   *   同曲目时不重设：保留 draw 阶段预载好的缓冲，避免 start() 每次 load() 重新拉流。
   */
  function ensureAudioSrc(item) {
    if (!audio) return;
    const url = itemUrl(item);
    // audio.src 返回解析后的绝对 URL，不能直接比；比较 setAudioSrc 写入的 content attribute
    const attr =
      typeof audio.getAttribute === "function" ? audio.getAttribute("src") : null;
    if (attr === url) return;
    setAudioSrc(item);
  }

  /** 暂停 + 播放位置归零 + 摘除媒体源（宿主 audio 元素本身保留，禁删）——clearItem 用 */
  function releaseAudio() {
    if (!audio) return;
    try {
      audio.pause();
    } catch (e) {
      /* 未加载媒体时可能抛错，忽略 */
    }
    try {
      audio.currentTime = 0;
    } catch (e) {
      /* 同上 */
    }
    if (typeof audio.removeAttribute === "function") audio.removeAttribute("src");
    if (typeof audio.load === "function") {
      try {
        audio.load(); // 摘 src 后重新初始化：networkState 归零、paused=true、src 读回空串
      } catch (e) {
        /* 同上 */
      }
    }
  }

  /* ---------- body class（全局副作用，引用计数 + 必然释放） ---------- */

  function resolveKeepBg() {
    if (typeof p.keepBg === "function") return !!p.keepBg();
    if (p.keepBg !== undefined) return !!p.keepBg;
    if (p.keepBgKey && typeof localStorage !== "undefined") {
      try {
        return localStorage.getItem(p.keepBgKey) !== "false";
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  function acquireBodyMode() {
    if (holdsBodyMode) return;
    holdsBodyMode = true;
    modeRef.acquire();
    if (resolveKeepBg()) {
      keepRef.acquire();
      holdsKeepBg = true;
    }
  }

  function releaseBodyMode() {
    if (!holdsBodyMode) return;
    holdsBodyMode = false;
    modeRef.release();
    if (holdsKeepBg) {
      keepRef.release(); // 计数归零时由引用计数器移除类（跨实例最后一个退出者生效）
      holdsKeepBg = false;
    }
  }

  /* ---------- 定时器 ---------- */

  function clearRollTimer() {
    if (rollTimer !== null) {
      clearInterval(rollTimer);
      rollTimer = null;
    }
  }
  function clearWaitTimers() {
    if (typeTimer !== null) {
      clearInterval(typeTimer);
      typeTimer = null;
    }
    if (readyTimer !== null) {
      clearTimeout(readyTimer);
      readyTimer = null;
    }
    if (hintTimer !== null) {
      clearTimeout(hintTimer);
      hintTimer = null;
    }
  }

  /* ---------- 抽取动画 ---------- */

  function finishDraw(list) {
    clearRollTimer();
    const item = pick(list);
    current = item;
    paint(item, true);
    if (p.preloadOnDraw !== false) setAudioSrc(item);
    phase = "idle";
    if (trigger) trigger.disabled = false;
    if (startTrigger) startTrigger.disabled = false;
    call(p.onDrawn, describe(item));
  }

  function draw() {
    // 只在 idle 抽取：播放/动画期间 UI 本就被 battle-mode 隐藏（9 处实现同理），
    // 避免"播放中改 src"产生相位不一致；需要重抽时先 stop()
    if (phase !== "idle") return false;
    const list = resolveItems();
    if (list.length === 0) {
      call(p.onEmpty);
      return false;
    }
    if (trigger) trigger.disabled = true;
    if (startTrigger) startTrigger.disabled = true;

    if (prefersReducedMotion()) {
      phase = "rolling"; // finishDraw 会复位为 idle
      finishDraw(list);
      return true;
    }

    phase = "rolling";
    const total = Math.max(1, Number(p.rollTicks) || DEFAULTS.rollTicks);
    let i = 0;
    rollTimer = setInterval(() => {
      i += 1;
      if (i < total) {
        const item = p.cycle ? list[(i - 1) % list.length] : pick(list);
        paint(item, false);
        call(p.onTick, item, i, total);
      } else {
        finishDraw(list);
      }
    }, Math.max(1, Number(p.tickMs) || DEFAULTS.tickMs));
    return true;
  }

  /* ---------- 播放 / 比赛模式 ---------- */

  function showHint() {
    setHidden(nodes.hint, false);
  }

  function typeOverlayText() {
    if (!nodes.text) return;
    const full = String(ov.textContent == null ? "" : ov.textContent);
    if (prefersReducedMotion() || !Number(ov.textMs)) {
      nodes.text.textContent = full; // 减少动效偏好：不做逐字动画，直接全量上屏
      return;
    }
    nodes.text.textContent = "";
    let i = 0;
    typeTimer = setInterval(() => {
      i += 1;
      nodes.text.textContent = full.slice(0, i);
      if (i >= full.length) {
        clearInterval(typeTimer);
        typeTimer = null;
      }
    }, Math.max(1, Number(ov.textMs)));
  }

  function beginPlayback() {
    if (phase !== "starting") return; // 只从 start()/readyTimer/遮罩跳过 三个入口进入
    clearWaitTimers();
    setHidden(nodes.root, true);
    showHint();
    phase = "playing";
    if (audio) {
      const played = audio.play();
      if (played && typeof played.then === "function") {
        played.catch((err) => {
          call(p.onError, err);
          stop("error");
        });
      }
      if (p.exitOnEnded !== false) audio.onended = () => stop("ended");
    }
    // 退出监听只在此刻登记：动画期间的点击不应误退（与原实现的相位判定等价）
    playCtrl = new AbortController();
    const { signal: playSignal } = playCtrl;
    if (p.exitOnDblclick !== false) {
      document.addEventListener("dblclick", onDocDblClick, { signal: playSignal });
    }
    if (p.exitOnClick) document.addEventListener("click", onDocClick, { signal: playSignal });
    call(p.onStarted, describe(current));
  }

  const startedAt = { t: 0 };

  function onDocDblClick() {
    if (phase !== "playing") return;
    stop("user");
  }

  function onDocClick(e) {
    if (phase !== "playing") return;
    if (Date.now() - startedAt.t < 250) return; // 避免 startTrigger 的这一次点击立即自停
    // 排除音频控件与提示节点：迁移前 handleDocumentClick 明确不因点击这两者退出
    //（否则点原生暂停/拖进度会冒泡成"退出比赛模式"）。迁移时曾遗漏，P11 终审 [P2] 补回。
    // ★ B3 修复：原为 `const audio = getAudio();`——作用域内不存在 getAudio（只有 api.getAudio），
    //   单击退出的监听每次触发都抛 ReferenceError，导致 exitOnClick 全量失效（四个模块都受影响）。
    //   直接使用闭包内的 audio 常量（resolveAudio 的结果），语义与 api.getAudio() 完全相同。
    if (audio && e.target && audio.contains(e.target)) return;
    const hint = nodes && nodes.hint;
    if (hint && e.target && hint.contains(e.target)) return;
    stop("user");
  }

  /**
   * 进入比赛模式并播放当前曲目。
   * @param {{ skipOverlay?: boolean }} [opts] skipOverlay=true 跳过 BATTLE START 遮罩/逐字/待播，
   *        立即播放（原 group-battle `replayBattleMusic` 的重播语义）。首次进入仍按 overlay.enabled
   *        走遮罩；不传 opts = 旧行为逐字不变。
   */
  function start(opts) {
    if (phase === "starting" || phase === "playing") return false;
    if (!current) {
      call(p.onEmpty);
      return false;
    }
    // ★ B4 缺陷 1（P0）：按当前 current 校正 src（同曲目不重载），多实例共享 audio 时不播错歌
    ensureAudioSrc(current);
    acquireBodyMode();
    phase = "starting";
    startedAt.t = Date.now();
    const skipOverlay = !!(opts && opts.skipOverlay);
    if (ov.enabled && !skipOverlay) {
      setHidden(nodes.root, false);
      setHidden(nodes.hint, true);
      // 进入比赛模式 → 遮罩显示 → 逐字动画开始前：页面侧视觉钩子（抖动等）的触发点。
      // 刻意早于 onStarted（beginPlayback，readyMs 后）——迁移前 shake 就发生在进入模式瞬间。
      call(p.onOverlayShown, {
        host: hostEl,
        overlay: nodes.root,
        text: nodes.text,
        hint: nodes.hint,
      });
      typeOverlayText();
      if (Number(ov.hintMs) > 0) hintTimer = setTimeout(showHint, Number(ov.hintMs));
      readyTimer = setTimeout(beginPlayback, Math.max(0, Number(ov.readyMs) || 0));
    } else {
      beginPlayback();
    }
    return true;
  }

  /** 无回调的彻底清理（stop 与 cleanup 共用） */
  function destroy() {
    clearRollTimer();
    clearWaitTimers();
    if (nodes.root) setHidden(nodes.root, true);
    if (nodes.hint) setHidden(nodes.hint, true);
    if (audio) {
      audio.onended = null;
      try {
        audio.pause();
      } catch (e) {
        /* 未加载媒体时可能抛错，忽略 */
      }
      try {
        audio.currentTime = 0;
      } catch (e) {
        /* 同上 */
      }
    }
    if (playCtrl) {
      playCtrl.abort();
      playCtrl = null;
    }
    releaseBodyMode();
    phase = "idle";
    if (trigger) trigger.disabled = false;
    // 对称复位：抽取滚动窗口内 startTrigger 也被禁用（draw()），此时页面路径 stop() →
    // destroy() 若不复位，播放按钮会滞留 disabled 到下一次抽取完成
    if (startTrigger) startTrigger.disabled = false;
  }

  function stop(reason = "manual") {
    if (phase === "idle") return false;
    const item = current;
    const wasPlaying = phase === "playing";
    destroy();
    call(p.onExited, { reason, item, wasPlaying });
    return true;
  }

  function toggle(opts) {
    return phase === "idle" ? start(opts) : stop("toggle");
  }

  /** 直接上屏（不播放、不回调）：页面从存档恢复 drawnMusic 时用；null → 等价 clearItem */
  function setItem(item) {
    if (!item) return clearItem();
    current = item;
    paint(item, true);
    if (p.preloadOnDraw !== false) setAudioSrc(item);
    return true;
  }

  /**
   * 清空当前曲目（drag 切曲库/重置、group-battle reset/revive 收尾调用）。
   *
   * ★ B4 缺陷 2 修复后的完整语义：
   *   1. current = null；
   *   2. 音频暂停 + currentTime 归零 + 摘除 src（宿主 audio 元素保留，禁删）；
   *   3. display 移除 rolling / selected 两个类（旧实现 paint(null,false) 会遗留 rolling）；
   *   4. display 文本清空（不再经 paint(null) 写入空串）；展示文案由调用方决定
   *      （如 drag 随后写 "—"、bg1 写 "音乐名称"）。
   *
   * 不改 phase / body class：播放中请先 stop()（与调用方现状一致）。调用方在调用前后自带的
   * pause()/currentTime=0/src="" 兜底与此语义一致，幂等、不会互相破坏。不触发任何回调。
   */
  function clearItem() {
    current = null;
    releaseAudio();
    if (display) {
      display.textContent = "";
      if (display.classList) {
        display.classList.remove(p.rollingClass || "rolling", p.resultClass || "selected");
      }
    }
    return true;
  }

  const api = {
    draw,
    start,
    stop,
    toggle,
    setItem,
    clearItem,
    getItem: () => current,
    isPlaying: () => phase === "playing",
    isBusy: () => phase !== "idle",
    getPhase: () => phase,
    getAudio: () => audio,
    getDisplay: () => display,
    getBodyModeUsers: () => modeRef.count(), // 调试/断言用：同页多实例引用计数
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
  if (startTrigger) {
    startTrigger.addEventListener(
      "click",
      (e) => {
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        toggle();
      },
      { signal }
    );
  }
  // 点击遮罩跳过 BATTLE START 动画（group-battle 现状）：只注册一次，动画进行中才响应
  if (ov.skipOnClick && nodes.root) {
    nodes.root.addEventListener(
      "click",
      () => {
        if (phase === "starting") beginPlayback();
      },
      { signal }
    );
  }

  call(p.onReady, api);

  /** cleanup：清定时器 + 解绑（含 document 级）+ 释放 body class + 移除自建节点（幂等） */
  return function cleanup() {
    destroy();
    ctrl.abort();
    if (startTrigger) startTrigger.disabled = false;
    if (display && display.classList) {
      display.classList.remove(p.rollingClass || "rolling", p.resultClass || "selected");
    }
    while (ownNodes.length) {
      const n = ownNodes.pop();
      if (n && n.parentNode) n.parentNode.removeChild(n);
    }
  };
}
