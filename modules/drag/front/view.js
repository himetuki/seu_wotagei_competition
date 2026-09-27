/**
 * Drag式比赛 — 页面 flow（P11-B4「积木拼装」迁移后）
 *
 * 由原多脚本按加载顺序并入同一闭包（main → data → bracket → render → drag → music），
 * 函数体逐行保留；全局函数/变量 → 模块闭包作用域。原 drag_main.js 的
 * DOMContentLoaded 初始化改为组件体内直接执行（kernel render 时调用）。
 *
 * 分层（P11 §2.1）：跨页同构能力已抽走，本文件不再是"第 6 份手抄实现"：
 *   · 音乐抽取闪现动画（40 tick × 50ms 顺序循环） → 组件 component-draw-machine
 *   · 播放 + 比赛模式（进入 battle-mode / onended / 双击退出） → component-music-player
 *   · 持久化双写 + 恢复链 + 重置            → /web/lib/persist.mjs（createPersistence）
 *   · 洗牌（原手写 Fisher–Yates 循环）        → /web/lib/random.mjs（shuffle）
 *   · bracket / 拖拽 / undo 快照栈            → 本页专属 flow，原样保留（P11 §5.4 不做清单）
 *
 * 有意行为变更（仅以下五处，其余逐行保留语义）：
 *   1. 音乐抽取动画改为 component-draw-machine：ticks/tickMs/cycle 与迁移前逐字一致
 *      （40 × 50ms 顺序循环；末次定格随机），展示类 rolling/selected 同名前缀沿用 CSS。
 *   2. 播放/比赛模式改为 component-music-player：body 类 battle-mode / battle-keep-bg 的加移
 *      归组件（引用计数，卸载必释放）；「双击屏幕结束比赛」提示仍由本页 CSS
 *      `body.battle-mode::after` 承担（组件 overlay.enabled:false，不渲染提示节点，无重复）。
 *   3. 持久化改用 createPersistence：localStorage key（dragBattleState2_<source>）与 API 端点
 *      （/api/drag-process、/api/clear-drag-process）**逐字保留**；保存体仍是
 *      { ...getPersisted(), lastUpdate }，恢复链仍是 服务端 → 本地 → 重建。
 *   4. shufflePlayers 的手写循环 → shuffle()（同为 Fisher–Yates，等概率、不改入参语义一致）。
 *   5. 「抽取期间禁用开始按钮」保留（迁移前 drawMusic 的按钮态）：改由 draw-machine 的
 *      onTick（滚动首个 tick 起）触发，不再由页面绑定 #draw-music-btn（避免与组件双跑）。
 *
 * 坐标系:
 *   1 GU = 容器宽度 / 50
 *   方框尺寸: 宽 4 GU × 高 1.2 GU
 *   每轮水平收缩: 5 GU
 *
 * 交互核心: 拖拽 (HTML5 Drag & Drop)
 *   仅当两父级均 Occupied → 子级 Pending → 可拖拽
 */

import { iconEl } from "/web/icons.mjs";
import { shuffle } from "/web/lib/random.mjs";
import { createPersistence } from "/web/lib/persist.mjs";

/* =================================================================
 *  常量（原 drag_main.js）
 * ================================================================= */
const GU_RATIO = 50;
const BOX_W_GU = 4;
const BOX_H_GU = 1.2;
const ROUND_STEP_GU = 5;

/* =================================================================
 *  持久化 API（localStorage key 与端点逐字保留，经 createPersistence 双写/恢复/重置）
 * ================================================================= */
const API_URL = "/api/drag-process";
const API_CLEAR_URL = "/api/clear-drag-process";

/* 两个选手源各一份存档（key 由 storageKey(source) 决定，控制器按源懒建并缓存）。
   组件入口处注入 ctx.api；控制器复用 localStorage 与既有端点，键名不改。 */
const persistBySource = new Map();
let apiRef = null;

/** 取（或建）指定选手源的持久化控制器；source 缺省 = 当前源 */
function persistFor(source) {
  const src = source || State.playerSource;
  if (!persistBySource.has(src)) {
    persistBySource.set(
      src,
      createPersistence({
        key: storageKey(src), // "dragBattleState2_<source>"，逐字保留
        storage: localStorage,
        endpoint: API_URL,
        clearEndpoint: API_CLEAR_URL,
        api: apiRef,
        // 迁移前 loadStateFromServer 的两条判定：有节点 + 源一致（源不同则视为未命中，
        // 交给恢复链的本地分支），空载荷不算存档
        isValid: (data) =>
          !!data &&
          Array.isArray(data.nodes) &&
          data.nodes.length > 0 &&
          (!data.playerSource || data.playerSource === src),
      })
    );
  }
  return persistBySource.get(src);
}

/* 组件实例 API 桥（front/plugin.js 传入、组件 onReady 回填；组件缺失时保持 null） */
let apis = { music: null, draw: null };

/* =================================================================
 *  全局状态
 * ================================================================= */
const State = {
  playerSource: "player1",
  totalCount: 8,
  allPlayers: [],
  n: 3,
  nodes: [],
  nodeById: {},
  championId: null,
  phase: "playing",
  undoStack: [],
  music: { oldList: [], newList: [], exList: [], current: null },
  musicSource: "old",
  doubleElim: false,
  doubleElimActive: false,
  doubleElimResetDone: false,
};

/* DOM 缓存 */
let canvasEl, nodesLayer, svgEl, containerW, containerH, GU, boxW, boxH;
let dragData = null;

/* =================================================================
 *  音乐抽取 & 比赛模式
 *  运行态（滚动句柄 / 当前曲目 / battleActive）已归组件实例持有：
 *  抽取 = draw-machine 实例，播放与比赛模式 = music-player 实例（见 componentProps）
 * ================================================================= */

/* =================================================================
 *  工具函数（原 drag_main.js）
 * ================================================================= */
function truncateName(name) {
  if (!name) return "";
  return name.length > 10 ? name.substring(0, 9) + "…" : name;
}

function showError(msg) {
  const bar = document.getElementById("error-bar");
  document.getElementById("error-msg").textContent = msg;
  bar.classList.remove("hidden");
}

function hideError() {
  document.getElementById("error-bar").classList.add("hidden");
}

/**
 * 状态提示注入：前置内联 SVG 图标 + 纯文本节点。
 * 文本经 createTextNode 写入（非 innerHTML），玩家名等外部数据不参与 HTML 解析。
 */
function setHintWithIcon(node, iconName, text) {
  if (!node) return;
  node.textContent = "";
  const svg = iconName ? iconEl(iconName, { size: 16, class: "status-icon" }) : null;
  if (svg) node.appendChild(svg);
  node.appendChild(document.createTextNode((svg ? " " : "") + text));
}

function showHint(msg, iconName) {
  const hint = document.getElementById("status-hint");
  if (!hint) return;
  setHintWithIcon(hint, iconName, msg);
  // 快照比较（textContent 含图标前的空格，不能直接与 msg 比较）：
  // 3 秒内未被新提示/状态刷新覆盖时，才回落到 updateStatus()
  const snapshot = hint.textContent;
  setTimeout(() => {
    if (hint.textContent === snapshot) updateStatus();
  }, 3000);
}

function showTooltip(x, y, msg) {
  const tt = document.getElementById("tooltip");
  tt.textContent = msg;
  tt.style.left = x + "px";
  tt.style.top = y + "px";
  tt.classList.remove("hidden");
}

function hideTooltip() {
  document.getElementById("tooltip").classList.add("hidden");
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/* =================================================================
 *  document/window 级监听（具名化，供 cleanup 解绑）
 *  （原 handleGlobalDblClick「双击退出比赛」已随 music-player 组件化删除：
 *    组件的双击监听只在播放生命周期内登记，退出/卸载都解绑）
 * ================================================================= */
const handleWinResize = debounce(() => {
  if (!canvasEl) return;
  recomputeLayout();
  renderAll();
}, 150);

/* =================================================================
 *  组件运行时 props（front/plugin.js 挂载时取用）
 *
 * 静态 props（时序/文案）可由 web/front.json 的 drag config.components 覆盖，
 * 运行时 props 优先级更高。按钮归属刻意不重叠（见 front/plugin.js 头注释）：
 *   draw-machine  : #draw-music-btn（40×50ms 顺序循环）+ 抽取期间禁用开始按钮
 *   music-player  : 不接管 trigger，只接管 #start-battle-btn（overlay 关闭：无倒计时/打字动画，
 *                   与迁移前直接播放一致；keepBg 读既有 dragBattleKeepBg 键）
 *   串联          : draw 定格 → bridge.music.setItem({ name, folder })（folder 来自曲库标签，
 *                   与迁移前 lastDrawnMusicSource 决定播放目录同义）
 * ================================================================= */
export function componentProps(bridge) {
  return {
    "music-player": {
      // 曲目池带曲库目录：music-player 取 item.folder 定 /resource/musics/<folder>/
      //（与 setItem 传入的 { name, folder } 同形；trigger 为空时本项不参与抽取）
      items: () => getTaggedMusicList().map((m) => ({ name: m.name, folder: m.source })),
      display: "#music-display",
      trigger: null, // 抽取归 draw-machine（同按钮双绑会双跑动画）
      startTrigger: "#start-battle-btn",
      overlay: { enabled: false }, // 迁移前无 BATTLE START 倒计时/打字动画
      exitOnDblclick: true, // 迁移前 handleGlobalDblClick
      exitOnClick: false,
      exitOnEnded: true, // 迁移前 player.onended → exitBattle
      keepBgKey: "dragBattleKeepBg", // 只读既有设置键（drag 原有语义）
      onReady: (api) => {
        bridge.music = api;
      },
      // 迁移前 exitBattle 尾部的重排（battle 期间 .app-wrapper display:none → 画布尺寸归零）
      onExited: () => {
        recomputeLayout();
        renderAll();
      },
    },
    "draw-machine": {
      items: () => getTaggedMusicList(),
      display: "#music-display",
      trigger: "#draw-music-btn",
      ticks: 40, // 迁移前 TOTAL_TICKS
      tickMs: 50, // 迁移前 setInterval 间隔
      cycle: true, // 迁移前为顺序循环（currentIdx+1），非随机跳
      onReady: (api) => {
        bridge.draw = api;
      },
      onEmpty: () => showHint("音乐列表为空"),
      // 迁移前 drawMusic 在滚动期间禁用「开始比赛」按钮（首个 tick 即 50ms 后，玩家不可能抢点）
      onTick: () => {
        const startBtn = document.getElementById("start-battle-btn");
        if (startBtn) startBtn.disabled = true;
      },
      onResult: (item) => {
        // 迁移前：lastDrawnMusic = finalItem.name / lastDrawnMusicSource = finalItem.source
        const startBtn = document.getElementById("start-battle-btn");
        if (startBtn) startBtn.disabled = false;
        // P11 缺陷台账 #3：抽取结果进 State（getPersisted 的 music.current 字段此前无人
        // 写入，存档恒 null）→ saveState 双写，刷新后恢复链才有曲目可复原
        State.music.current = { name: item.name, folder: item.source };
        saveState();
        if (bridge.music) bridge.music.setItem({ name: item.name, folder: item.source });
      },
    },
  };
}

/* =================================================================
 *  组件入口（原 DOMContentLoaded 初始化，kernel render 时执行）
 * ================================================================= */
export function dragComponent(el, meta, ctx, bridge) {
  // cleanup 契约：静态骨架节点的全部监听经 signal 登记，重渲染时 abort 统一解绑，
  // 防止不刷新页面的重复 render 造成双绑双触发
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

  // 组件实例 API（front/plugin.js 的 onReady 回填；组件缺失时保持 null）
  apis = bridge || { music: null, draw: null };
  apiRef = ctx && ctx.api ? ctx.api : null;

  canvasEl = document.getElementById("canvas");
  nodesLayer = document.getElementById("nodes-layer");
  svgEl = document.getElementById("lines-svg");

  // 加载设置（battleKeepBg 不再读入页面：music-player 在开赛时按 keepBgKey 只读同一键）
  const doubleElim = localStorage.getItem("dragDoubleElim");
  if (doubleElim !== null) State.doubleElim = doubleElim === "true";

  // 控制按钮
  document.getElementById("switch-player1-btn").addEventListener("click", () => switchPlayerSource("player1"), { signal });
  document.getElementById("switch-player2-btn").addEventListener("click", () => switchPlayerSource("player2"), { signal });
  document.getElementById("shuffle-btn").addEventListener("click", shufflePlayers, { signal });
  document.getElementById("reset-game-btn").addEventListener("click", handleReset, { signal });
  document.getElementById("setting-btn").addEventListener("click", () => { window.location.href = "/m/setting"; }, { signal });
  document.getElementById("home-btn").addEventListener("click", () => { window.location.href = "/m/home"; }, { signal });

  // 启动弹窗: 读取/同步双败开关
  const modalToggle = document.getElementById("modal-double-elim-toggle");
  const modalOverlay = document.getElementById("startup-modal");
  if (modalToggle && modalOverlay) {
    const savedDE = localStorage.getItem("dragDoubleElim");
    modalToggle.checked = savedDE === "true";
    State.doubleElim = modalToggle.checked;

    modalToggle.addEventListener("change", () => {
      const val = modalToggle.checked;
      State.doubleElim = val;
      localStorage.setItem("dragDoubleElim", String(val));
      fetch("/api/drag-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doubleElim: val }),
      }).catch(() => {});
    }, { signal });

    document.getElementById("modal-close-btn").addEventListener("click", () => {
      modalOverlay.classList.add("closed");
    }, { signal });
  }

  // 音乐库切换按钮
  document.getElementById("switch-music-old-btn").addEventListener("click", () => switchMusicSource("old"), { signal });
  document.getElementById("switch-music-new-btn").addEventListener("click", () => switchMusicSource("new"), { signal });
  document.getElementById("switch-music-ex-btn").addEventListener("click", () => switchMusicSource("ex"), { signal });

  // 音乐抽取 & 比赛按钮 + 双击退出比赛的监听全部归组件实例
  // （draw-machine 的 trigger / music-player 的 startTrigger + 播放期 document dblclick），
  // 页面侧不再绑定，避免与组件双跑。

  // 窗口大小变化重渲染
  window.addEventListener("resize", handleWinResize, { signal });

  // 加载数据
  loadSettings()
    .then(() => Promise.all([loadPlayers(), loadMusic()]))
    .then(() => {
      const loadedSource = State.playerSource;
      // 恢复链：服务端 → 本地 → 无（重建），与迁移前 loadStateFromServer + loadLocalState 同序
      return persistFor(State.playerSource).load().then(({ data, source }) => {
        if (source === "server" || source === "local") {
          restoreState(data);
          restoreComponentCurrent(); // 存档曲目复原到组件实例（P11 缺陷台账 #3）
        }

        const sourceChanged = State.playerSource !== loadedSource;
        const restoredCount = State.totalCount;
        const actualAvailable = State.allPlayers.length;
        const needRebuild = sourceChanged ||
          State.nodes.length === 0 ||
          restoredCount > actualAvailable ||
          restoredCount !== Math.pow(2, Math.ceil(Math.log2(restoredCount)));

        if (needRebuild) {
          State.playerSource = loadedSource;
          State.totalCount = actualAvailable;
          buildOrResetBracket();
          document.getElementById("switch-player1-btn").classList.toggle("active", State.playerSource === "player1");
          document.getElementById("switch-player2-btn").classList.toggle("active", State.playerSource === "player2");
        }

        // 双败赛恢复：若已激活，只重新计算布局，不要 rebuild
        if (State.doubleElimActive) {
          recomputeDoubleElimLayout();
        }
        // 旧存档可能包含 LL_0 节点但未标记 doubleElimActive，需重建
        else if (State.nodeById["LL_0"]) {
          buildOrResetBracket();
        }

        recomputeLayout();
        renderAll();
      });
    });

  return () => cleanupDragPage(bindAbort);
}

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用）
 * ================================================================= */
function cleanupDragPage(bindAbort) {
  // signal 登记的静态骨架监听（按钮/window resize）统一解绑
  if (bindAbort) bindAbort.abort();

  dragData = null;

  // 音乐抽取定时器 / battle 运行态 / body 类（battle-mode、battle-keep-bg）/
  // #music-player 的 onended+pause 归零，全部由组件实例的 cleanup 负责
  // （front/plugin.js 收集后逐个调用），页面侧不再重复。
}

/* =================================================================
 *  选手组切换（原 drag_data.js）
 * ================================================================= */
function switchPlayerSource(source) {
  if (State.playerSource === source) return;

  if (State.nodes.length > 0) saveState();

  State.playerSource = source;
  State.phase = "playing";

  document.getElementById("switch-player1-btn").classList.toggle("active", source === "player1");
  document.getElementById("switch-player2-btn").classList.toggle("active", source === "player2");

  const saved = localStorage.getItem("dragTotalCount");
  if (saved) State.totalCount = Math.max(2, parseInt(saved) || 8);

  loadPlayers().then(() => {
    const raw = localStorage.getItem(storageKey(source));
    if (raw) {
      try {
        const data = JSON.parse(raw);
        const restoredCount = data.totalCount || 0;
        const actualAvailable = State.allPlayers.length;
        const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;
        const compatible = data.nodes && data.nodes.length > 0 &&
          restoredCount <= actualAvailable && isPow2(restoredCount || 1);

        if (compatible) {
          restoreState(data);
          restoreComponentCurrent(); // 切源恢复存档：曲目同步复原到组件实例（同 #3）
          recomputeLayout();
          renderAll();
          showHint("已切换到" + (source === "player1" ? "加组" : "内组") + "（已恢复进度）");
          return;
        }
      } catch (e) {}
    }

    buildOrResetBracket();
    saveState();
    renderAll();
    showHint("已切换到" + (source === "player1" ? "加组" : "内组"));
  });
}

/* =================================================================
 *  随机 & 加载
 * ================================================================= */
function shufflePlayers() {
  loadPlayers().then(() => {
    if (State.allPlayers.length === 0) return;
    // 洗牌改用 L1 共享库（Fisher–Yates，等概率；返回新数组，等价于原手写循环的最终排列）
    State.allPlayers = shuffle(State.allPlayers);
    buildOrResetBracket();
    saveState();
    renderAll();
    showHint("已随机排列选手");
  });
}

function loadPlayers() {
  const file = State.playerSource === "player1" ? "player1.json" : "player2.json";
  return fetch("/resource/json/" + file)
    .then(r => r.json())
    .then(data => {
      State.allPlayers = data.map(item => (item && item.name ? item.name.trim() : "")).filter(Boolean);

      const effective = Math.min(State.totalCount, State.allPlayers.length);
      State.totalCount = Math.max(2, effective);

      const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;
      if (!isPow2(State.allPlayers.length)) {
        const padded = Math.pow(2, Math.ceil(Math.log2(State.allPlayers.length)));
        showError("选手人数(" + State.allPlayers.length + ")非2^n，将补齐至" + padded + "个位置");
      } else {
        hideError();
      }

      document.getElementById("round-label").textContent =
        "第1轮 · " + State.totalCount + "人";
    })
    .catch(err => {
      console.error("加载选手失败:", err);
      showError("选手数据加载失败");
    });
}

function loadMusic() {
  return Promise.all([
    fetch("/resource/json/musics_list.json").then(r => r.json()).catch(() => []),
    fetch("/resource/json/musics_list_2.json").then(r => r.json()).catch(() => []),
    fetch("/resource/json/musics_list_ex.json").then(r => r.json()).catch(() => []),
  ]).then(([oldL, newL, exL]) => {
    State.music.oldList = oldL;
    State.music.newList = newL;
    State.music.exList = exL;
  });
}

function loadSettings() {
  const saved = localStorage.getItem("dragTotalCount");
  if (saved) State.totalCount = Math.max(2, parseInt(saved) || 8);
  return fetch("/api/drag-settings")
    .then(r => r.json())
    .then(data => {
      if (data && data.totalCount) {
        State.totalCount = Math.max(2, parseInt(data.totalCount));
      }
      if (data && typeof data.doubleElim === "boolean") {
        State.doubleElim = data.doubleElim;
      }
    })
    .catch(() => {});
}

/* =================================================================
 *  重置
 * ================================================================= */
function handleReset() {
  if (!confirm("确定要重置比赛？所有进度将丢失。")) return;

  // 清两端存档（本地 key + POST /api/clear-drag-process），键/端点逐字保留
  persistFor(State.playerSource).reset();

  State.music.current = null;

  // 音乐运行态归组件实例：停止播放 + 退出比赛模式（body 类随组件引用计数释放）+ 清曲目 + 中止滚动
  if (apis.music) {
    apis.music.stop("manual");
    apis.music.clearItem();
  }
  if (apis.draw) apis.draw.cancel();

  // 展示与按钮复位（迁移前 handleReset 的既有观感）
  const musicDisplay = document.getElementById("music-display");
  musicDisplay.textContent = "—";
  musicDisplay.classList.remove("rolling", "selected");
  document.getElementById("draw-music-btn").disabled = false;
  document.getElementById("start-battle-btn").disabled = true;

  loadPlayers().then(() => {
    buildOrResetBracket();
    saveState();
    recomputeLayout();
    renderAll();
    showHint("已重置");
  });
}

/* =================================================================
 *  持久化
 * ================================================================= */
function storageKey(source) {
  return "dragBattleState2_" + (source || State.playerSource);
}

function getPersisted() {
  return {
    playerSource: State.playerSource,
    totalCount: State.totalCount,
    allPlayers: State.allPlayers,
    n: State.n,
    nodes: State.nodes.map(n => ({
      id: n.id, type: n.type, side: n.side, round: n.round, index: n.index,
      playerName: n.playerName, state: n.state, parentIds: n.parentIds,
      childId: n.childId, badge: n.badge, autoBye: n.autoBye,
    })),
    championId: State.championId,
    phase: State.phase,
    undoStack: State.undoStack,
    music: { current: State.music.current },
    doubleElimActive: State.doubleElimActive,
    doubleElimResetDone: State.doubleElimResetDone,
  };
}

/**
 * 双写保存（localStorage + POST /api/drag-process）：键与端点逐字保留，
 * 保存体仍是 { ...getPersisted(), lastUpdate }（createPersistence 负责，失败不抛）。
 */
function saveState() {
  persistFor(State.playerSource).save(getPersisted());
}

function restoreState(data) {
  State.playerSource = data.playerSource || "player1";
  State.totalCount = data.totalCount || 8;
  State.n = data.n || 3;
  State.phase = data.phase || "playing";
  State.undoStack = data.undoStack || [];
  State.music.current = data.music?.current || null;
  State.doubleElimActive = data.doubleElimActive || false;
  State.doubleElimResetDone = data.doubleElimResetDone || false;

  State.nodes = (data.nodes || []).map(n => ({
    id: n.id, type: n.type, side: n.side, round: n.round, index: n.index,
    playerName: n.playerName, state: n.state, parentIds: n.parentIds || [],
    childId: n.childId, badge: n.badge, autoBye: n.autoBye,
    x: 0, y: 0,
  }));

  State.nodeById = {};
  State.nodes.forEach(n => { State.nodeById[n.id] = n; });
  State.championId = data.championId || null;

  document.getElementById("switch-player1-btn").classList.toggle("active", State.playerSource === "player1");
  document.getElementById("switch-player2-btn").classList.toggle("active", State.playerSource === "player2");
}

/**
 * 把存档里的当前曲目复原到 music-player 组件实例（P11 缺陷台账 #3）。
 * 恢复链原先只回填 State.music.current，组件实例的 current/display/audio.src 仍是空 ——
 * 刷新后「开始比赛」无歌可放或须重抽。经 bridge.music 的 setItem 实例 API 复原
 * （不捅组件内部状态），并解禁「开始比赛」按钮（与抽取定格 onResult 的按钮态一致）。
 * 仅页面 flow 侧调用：组件被禁用（apis.music 为 null）或存档无曲目时为无操作。
 */
function restoreComponentCurrent() {
  if (!apis.music || !State.music.current) return;
  apis.music.setItem(State.music.current);
  const startBtn = document.getElementById("start-battle-btn");
  if (startBtn) startBtn.disabled = false;
}

/* =================================================================
 *  坐标计算引擎（原 drag_bracket.js）
 * ================================================================= */
function recomputeLayout() {
  if (!canvasEl) return;
  const rect = canvasEl.getBoundingClientRect();
  containerW = rect.width;
  containerH = rect.height;
  if (containerW === 0 || containerH === 0) return;
  GU = containerW / GU_RATIO;
  boxW = BOX_W_GU * GU;
  boxH = BOX_H_GU * GU;
}

function nodeCenter(side, round, verticalIdxInRound, nodesPerSideThisRound) {
  const totalY = containerH - 2 * GU;
  const spacing = totalY / (nodesPerSideThisRound + 1);
  const yCenter = GU + (verticalIdxInRound + 1) * spacing;

  if (side === "left") {
    return { x: round * ROUND_STEP_GU * GU + boxW / 2, y: yCenter };
  } else if (side === "right") {
    return { x: containerW - round * ROUND_STEP_GU * GU - boxW / 2, y: yCenter };
  } else {
    return { x: containerW / 2, y: containerH / 2 };
  }
}

function winnerY(parent1, parent2) {
  return (parent1.y + parent2.y) / 2;
}

/* =================================================================
 *  标准淘汰赛对阵表
 * ================================================================= */
function buildBracket() {
  const total = State.totalCount;
  const players = State.allPlayers.slice(0, total);
  State.n = Math.ceil(Math.log2(total));
  const fullSlots = Math.pow(2, State.n);
  const perSide = fullSlots / 2;

  const padded = [...players];
  while (padded.length < fullSlots) padded.push(null);

  State.nodes = [];
  State.nodeById = {};
  State.championId = null;

  // 叶子层
  const leafLeft = [], leafRight = [];
  for (let i = 0; i < perSide; i++) {
    leafLeft.push(padded[i]);
    leafRight.push(padded[perSide + i]);
  }

  const leftLeaves = leafLeft.map((name, idx) => {
    const pos = nodeCenter("left", 0, idx, perSide);
    const id = "L_" + idx;
    return { id, type: "leaf", side: "left", round: 0, index: idx,
      playerName: name, state: name ? "occupied" : "pending",
      parentIds: [], childId: null, x: pos.x, y: pos.y, badge: null };
  });
  const rightLeaves = leafRight.map((name, idx) => {
    const pos = nodeCenter("right", 0, idx, perSide);
    const id = "R_" + idx;
    return { id, type: "leaf", side: "right", round: 0, index: idx,
      playerName: name, state: name ? "occupied" : "pending",
      parentIds: [], childId: null, x: pos.x, y: pos.y, badge: null };
  });

  State.nodes.push(...leftLeaves, ...rightLeaves);
  leftLeaves.forEach(n => State.nodeById[n.id] = n);
  rightLeaves.forEach(n => State.nodeById[n.id] = n);

  // 递归构建胜者层
  let currentRoundNodes = { left: [...leftLeaves], right: [...rightLeaves] };
  const sideKeys = ["left", "right"];

  for (let r = 1; r < State.n; r++) {
    const nextRound = { left: [], right: [] };
    const perSideThisRound = currentRoundNodes.left.length / 2;

    for (const side of sideKeys) {
      const parents = currentRoundNodes[side];
      for (let i = 0; i < parents.length; i += 2) {
        const p1 = parents[i], p2 = parents[i + 1];
        if (!p1 || !p2) continue;

        const wY = winnerY({ y: p1.y }, { y: p2.y });
        const pos = nodeCenter(side, r, i / 2, perSideThisRound);
        const id = side === "left" ? "WL_" + r + "_" + (i / 2) : "WR_" + r + "_" + (i / 2);
        const wNode = {
          id, type: "winner", side, round: r, index: i / 2,
          playerName: null, state: "pending",
          parentIds: [p1.id, p2.id], childId: null,
          x: pos.x, y: wY, badge: null,
        };
        p1.childId = id; p2.childId = id;
        nextRound[side].push(wNode);
        State.nodes.push(wNode);
        State.nodeById[id] = wNode;
      }
    }
    currentRoundNodes = nextRound;
  }

  // 冠军节点
  const leftFinal = currentRoundNodes.left[0];
  const rightFinal = currentRoundNodes.right[0];
  if (leftFinal && rightFinal) {
    const champId = "CHAMPION";
    const pos = nodeCenter("center", 0, 0, 1);
    const cY = winnerY({ y: leftFinal.y }, { y: rightFinal.y });
    const champNode = {
      id: champId, type: "champion", side: "center", round: State.n, index: 0,
      playerName: null, state: "pending",
      parentIds: [leftFinal.id, rightFinal.id], childId: null,
      x: pos.x, y: cY, badge: null,
    };
    leftFinal.childId = champId;
    rightFinal.childId = champId;
    State.nodes.push(champNode);
    State.nodeById[champId] = champNode;
    State.championId = champId;
  }
}

function buildOrResetBracket() {
  State.nodes = [];
  State.nodeById = {};
  State.championId = null;
  State.undoStack = [];
  State.phase = "playing";
  State.doubleElimActive = false;
  State.doubleElimResetDone = false;

  const savedTotal = localStorage.getItem("dragTotalCount");
  if (savedTotal) State.totalCount = Math.max(2, parseInt(savedTotal) || 8);
  if (State.allPlayers.length > State.totalCount) {
    State.allPlayers = State.allPlayers.slice(0, State.totalCount);
  }

  buildBracket();
  processByes();
  applyDoubleElimBadges();
}

function processByes() {
  // 双败淘汰赛中不存在轮空，LL_*/WF_DROP 等空槽是在等对手就位，不是 bye
  if (State.doubleElimActive) return;
  for (const node of State.nodes) {
    if (node.state !== "pending" || node.parentIds.length < 2) continue;
    const parents = node.parentIds.map(id => State.nodeById[id]).filter(Boolean);
    if (parents.length !== 2) continue;

    const p1occ = parents[0].state === "occupied" && parents[0].playerName;
    const p2occ = parents[1].state === "occupied" && parents[1].playerName;
    const p1IsEmptyLeaf = parents[0].type === "leaf" && parents[0].state === "pending" && !parents[0].playerName;
    const p2IsEmptyLeaf = parents[1].type === "leaf" && parents[1].state === "pending" && !parents[1].playerName;

    if (p1occ && p2IsEmptyLeaf) {
      node.playerName = parents[0].playerName;
      node.state = "occupied";
      parents[0].state = "advanced";
      node.autoBye = true;
    } else if (p2occ && p1IsEmptyLeaf) {
      node.playerName = parents[1].playerName;
      node.state = "occupied";
      parents[1].state = "advanced";
      node.autoBye = true;
    }
  }
}

/* =================================================================
 *  四强 → 双败淘汰过渡
 * ================================================================= */
function applyDoubleElimBadges() {
  const activeNodes = State.nodes.filter(n =>
    n.state === "occupied" && n.playerName &&
    n.childId && State.nodeById[n.childId]?.state === "pending"
  );
  if (activeNodes.length === 4) {
    activeNodes.forEach(n => { n.badge = "W"; });
  }
}

function getActivePlayerCount() {
  return State.nodes.filter(n =>
    n.state === "occupied" && n.playerName &&
    n.childId && State.nodeById[n.childId]?.state === "pending"
  ).length;
}

function checkDoubleElimTransition() {
  if (!State.doubleElim) return false;
  if (State.doubleElimActive) return false;
  if (getActivePlayerCount() !== 4) return false;
  transitionToDoubleElim();
  return true;
}

function transitionToDoubleElim() {
  const activeNodes = State.nodes.filter(n =>
    n.state === "occupied" && n.playerName &&
    n.childId && State.nodeById[n.childId]?.state === "pending"
  );
  if (activeNodes.length !== 4) return;

  State.allPlayers = activeNodes.map(n => n.playerName);
  State.totalCount = 4;
  State.doubleElimActive = true;
  State.doubleElimResetDone = false;
  State.nodes = [];
  State.nodeById = {};
  State.championId = null;
  State.undoStack = [];

  buildDoubleElimBracket();
  recomputeDoubleElimLayout();
  renderLines();
  renderNodes();
  updateStatus();
  showHint("四强双败淘汰赛已开启！");
}

/* =================================================================
 *  四强双败淘汰赛 — 对阵表构建 & 布局
 *
 *  结构:
 *   L_0(A) ──┐                     ┌── R_0(C)
 *            WL_1_0 ──┐     ┌── WR_1_0
 *   L_1(B) ──┘        │     │     ┌── R_1(D)
 *                     WF_2_0 ──────────┐
 *                                      │
 *                                   CHAMPION
 *                                      │
 *                     LF_2_0 ──────────┘
 *                  /            \
 *            LB_1_0          WF_DROP
 *          /       \         (胜者组决赛败者)
 *     LL_0(B)    LL_1(D)
 *
 * 标准四强双败流程 (4 轮交互，败者自动进位):
 *   第一轮 半决赛:   L_0 vs L_1 → 胜者→WL_1_0, 败者→LL_0 (自动)
 *                    R_0 vs R_1 → 胜者→WR_1_0, 败者→LL_1 (自动)
 *   第二轮 胜决+败R1: WL_1_0 vs WR_1_0 → 胜者→WF_2_0, 败者→WF_DROP (自动)
 *                    LL_0 vs LL_1 → 胜者→LB_1_0, 败者→淘汰(第4名)
 *   第三轮 败者组决赛: LB_1_0 vs WF_DROP → 胜者→LF_2_0, 败者→淘汰(第3名)
 *   第四轮 总决赛:     WF_2_0 vs LF_2_0 → CHAMPION
 *                     (若 LF 胜则加赛: 双方各1败, 再次对决)
 * ================================================================= */
function buildDoubleElimBracket() {
  const players = State.allPlayers.slice(0, 4);
  State.n = 2;
  State.nodes = [];
  State.nodeById = {};

  // 胜者组叶子
  const wLeaves = [
    { id: "L_0", side: "left", index: 0, playerName: players[0] || null },
    { id: "L_1", side: "left", index: 1, playerName: players[1] || null },
    { id: "R_0", side: "right", index: 0, playerName: players[2] || null },
    { id: "R_1", side: "right", index: 1, playerName: players[3] || null },
  ];
  for (const wl of wLeaves) {
    const node = {
      id: wl.id, type: "leaf", side: wl.side, round: 0, index: wl.index,
      playerName: wl.playerName,
      state: wl.playerName ? "occupied" : "pending",
      parentIds: [], childId: null, x: 0, y: 0, badge: null,
    };
    State.nodes.push(node);
    State.nodeById[node.id] = node;
  }

  // 胜者组 R1
  const wl1 = createDoubleElimWinner("WL_1_0", "left", 1, 0, ["L_0", "L_1"]);
  const wr1 = createDoubleElimWinner("WR_1_0", "right", 1, 0, ["R_0", "R_1"]);
  State.nodeById["L_0"].childId = "WL_1_0";
  State.nodeById["L_1"].childId = "WL_1_0";
  State.nodeById["R_0"].childId = "WR_1_0";
  State.nodeById["R_1"].childId = "WR_1_0";

  // 胜者组 R2
  const wf = createDoubleElimWinner("WF_2_0", "center", 2, 0, ["WL_1_0", "WR_1_0"]);
  wl1.childId = "WF_2_0";
  wr1.childId = "WF_2_0";

  // 败者组输入叶子
  for (const ll of [{ id: "LL_0", index: 0 }, { id: "LL_1", index: 1 }]) {
    const node = {
      id: ll.id, type: "leaf", side: "losers", round: 0, index: ll.index,
      playerName: null, state: "pending",
      parentIds: [], childId: null, x: 0, y: 0, badge: null,
    };
    State.nodes.push(node);
    State.nodeById[node.id] = node;
  }

  // 败者组 R1
  const lb1 = createDoubleElimWinner("LB_1_0", "losers", 1, 0, ["LL_0", "LL_1"]);
  State.nodeById["LL_0"].childId = "LB_1_0";
  State.nodeById["LL_1"].childId = "LB_1_0";

  // WF 败者接收槽
  const wfDrop = {
    id: "WF_DROP", type: "leaf", side: "losers", round: 0, index: 2,
    playerName: null, state: "pending",
    parentIds: [], childId: null, x: 0, y: 0, badge: null,
  };
  State.nodes.push(wfDrop);
  State.nodeById["WF_DROP"] = wfDrop;

  // 败者组决赛
  const lf = createDoubleElimWinner("LF_2_0", "center", 2, 0, ["LB_1_0", "WF_DROP"]);
  lb1.childId = "LF_2_0";
  wfDrop.childId = "LF_2_0";

  // 总决赛
  const champ = {
    id: "CHAMPION", type: "champion", side: "center", round: 3, index: 0,
    playerName: null, state: "pending",
    parentIds: ["WF_2_0", "LF_2_0"], childId: null,
    x: 0, y: 0, badge: null,
  };
  wf.childId = "CHAMPION";
  lf.childId = "CHAMPION";
  State.nodes.push(champ);
  State.nodeById["CHAMPION"] = champ;
  State.championId = "CHAMPION";

  recomputeDoubleElimLayout();
}

function createDoubleElimWinner(id, side, round, index, parentIds) {
  const node = {
    id, type: "winner", side, round, index,
    playerName: null, state: "pending",
    parentIds: parentIds, childId: null,
    x: 0, y: 0, badge: null,
  };
  State.nodes.push(node);
  State.nodeById[id] = node;
  return node;
}

function recomputeDoubleElimLayout() {
  if (!canvasEl) return;
  const w = containerW, h = containerH;
  if (w === 0 || h === 0) return;

  const wTop = h * 0.22;
  const wBot = h * 0.38;
  const lTop = h * 0.65;
  const lBot = h * 0.78;
  const lfY = (lTop + lBot) / 2 + h * 0.08;
  const wfY = (wTop + wBot) / 2;
  const champY = (wfY + lfY) / 2;

  const positions = {
    L_0: { x: w * 0.04, y: wTop },
    L_1: { x: w * 0.04, y: wBot },
    R_0: { x: w * 0.96, y: wTop },
    R_1: { x: w * 0.96, y: wBot },
    WL_1_0: { x: w * 0.16, y: wfY },
    WR_1_0: { x: w * 0.84, y: wfY },
    WF_2_0: { x: w * 0.38, y: wfY },
    LL_0: { x: w * 0.08, y: lTop },
    LL_1: { x: w * 0.08, y: lBot },
    LB_1_0: { x: w * 0.22, y: (lTop + lBot) / 2 },
    WF_DROP: { x: w * 0.38, y: lBot },
    LF_2_0: { x: w * 0.53, y: lfY },
    CHAMPION: { x: w * 0.73, y: champY },
  };

  for (const node of State.nodes) {
    const pos = positions[node.id];
    if (pos) { node.x = pos.x; node.y = pos.y; }
  }
}

/* =================================================================
 *  渲染主入口（原 drag_render.js）
 * ================================================================= */
function renderAll() {
  recomputeLayout();

  if (State.doubleElimActive) {
    recomputeDoubleElimLayout();
  } else {
    for (const node of State.nodes) {
      const perSideRound0 = Math.pow(2, State.n - 1);
      if (node.type === "leaf") {
        const pos = nodeCenter(node.side, 0, node.index, perSideRound0);
        node.x = pos.x; node.y = pos.y;
      } else if (node.type === "winner") {
        const parents = node.parentIds.map(id => State.nodeById[id]).filter(Boolean);
        if (parents.length === 2) {
          const pos = nodeCenter(node.side, node.round, node.index,
            Math.pow(2, State.n - 1 - node.round));
          node.x = pos.x;
          node.y = winnerY(parents[0], parents[1]);
        }
      } else if (node.type === "champion") {
        const parents = node.parentIds.map(id => State.nodeById[id]).filter(Boolean);
        node.x = containerW / 2;
        node.y = parents.length === 2 ? winnerY(parents[0], parents[1]) : containerH / 2;
      }
    }
  }

  renderLines();
  renderNodes();
  updateStatus();
}

/* =================================================================
 *  节点渲染
 * ================================================================= */
function renderNodes() {
  nodesLayer.innerHTML = "";

  for (const node of State.nodes) {
    const el = document.createElement("div");
    el.className = "node-box";
    el.id = "node-" + node.id;
    el.dataset.nodeId = node.id;

    el.style.width = boxW + "px";
    el.style.height = boxH + "px";
    el.style.left = (node.x - boxW / 2) + "px";
    el.style.top = (node.y - boxH / 2) + "px";

    el.classList.add("state-" + node.state);

    if (node.playerName) {
      const displayName = truncateName(node.playerName);
      el.textContent = displayName;
      if (displayName !== node.playerName) el.title = node.playerName;
    } else if (node.state === "pending") {
      if (State.doubleElimActive && node.id.startsWith("LL_")) {
        el.textContent = "败者";
      } else if (State.doubleElimActive && node.id === "WF_DROP") {
        el.textContent = "WF败者";
      } else if (State.doubleElimActive && node.id === "LF_2_0") {
        el.textContent = "败决";
      } else if (State.doubleElimActive && node.id === "WF_2_0") {
        el.textContent = "胜决";
      } else if (node.type === "champion") {
        el.textContent = "决赛";
      } else {
        el.textContent = "[TBD]";
      }
    }

    if (node.type === "champion") {
      el.classList.add("champion-slot");
    }

    if (node.badge) {
      const badge = document.createElement("span");
      badge.className = "badge " + (node.badge === "W" ? "w-badge" : "l-badge");
      badge.textContent = node.badge;
      el.appendChild(badge);
    }

    if (canBeDragged(node)) {
      el.classList.add("draggable");
      el.draggable = true;
      el.addEventListener("dragstart", onDragStart);
      el.addEventListener("dragend", onDragEnd);
    }

    if (node.state === "advanced" || node.state === "occupied") {
      el.addEventListener("dblclick", (e) => onDoubleClickNode(node, e));
    }

    if (canBeDropTarget(node)) {
      el.addEventListener("dragover", onDragOver);
      el.addEventListener("dragenter", onDragEnter);
      el.addEventListener("dragleave", onDragLeave);
      el.addEventListener("drop", onDrop);
    }

    nodesLayer.appendChild(el);
  }
}

/* =================================================================
 *  连线渲染
 * ================================================================= */
function renderLines() {
  svgEl.innerHTML = "";

  for (const node of State.nodes) {
    const parents = node.parentIds.map(id => State.nodeById[id]).filter(Boolean);

    if (parents.length >= 2) {
      const p1 = parents[0], p2 = parents[1];
      const mergeX = node.side === "left"
        ? p1.x + boxW / 2 + (node.x - boxW / 2 - p1.x - boxW / 2) * 0.4
        : p2.x - boxW / 2 - (p2.x - boxW / 2 - node.x - boxW / 2) * 0.4;
      const midY = (p1.y + p2.y) / 2;

      const colorClass = node.state === "pending"
        ? "pending-line" : (node.state === "occupied" ? "active-line" : "");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      const points = [
        (p1.side === "left" || p1.side === "losers" ? p1.x + boxW / 2 : p1.x - boxW / 2) + "," + p1.y,
        mergeX + "," + p1.y,
        mergeX + "," + midY,
        mergeX + "," + p2.y,
        (p2.side === "left" || p2.side === "losers" ? p2.x + boxW / 2 : p2.x - boxW / 2) + "," + p2.y,
      ];
      path.setAttribute("points", points.join(" "));
      path.setAttribute("fill", "none");
      if (colorClass) path.classList.add(colorClass);
      svgEl.appendChild(path);

      const winLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      winLine.setAttribute("x1", mergeX);
      winLine.setAttribute("y1", midY);
      winLine.setAttribute("x2", node.side === "left" || node.side === "losers" ? node.x - boxW / 2 : node.x + boxW / 2);
      winLine.setAttribute("y2", node.y);
      if (colorClass) winLine.classList.add(colorClass);
      svgEl.appendChild(winLine);
    } else if (parents.length === 1) {
      const p = parents[0];
      const colorClass = node.state === "pending"
        ? "pending-line" : (node.state === "occupied" ? "active-line" : "");

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", p.x + boxW / 2);
      line.setAttribute("y1", p.y);
      line.setAttribute("x2", node.x - boxW / 2);
      line.setAttribute("y2", node.y);
      if (colorClass) line.classList.add(colorClass);
      svgEl.appendChild(line);
    }
  }
}

/* =================================================================
 *  状态提示
 * ================================================================= */
function updateStatus() {
  const statusHint = document.getElementById("status-hint");
  const roundLabel = document.getElementById("round-label");

  const modeBadge = document.getElementById("mode-badge");
  if (modeBadge) {
    modeBadge.classList.toggle("hidden", !State.doubleElimActive);
  }

  if (State.phase === "complete") {
    const champ = State.championId ? State.nodeById[State.championId] : null;
    setHintWithIcon(statusHint, "trophy", "冠军: " + (champ ? champ.playerName : "—"));
    roundLabel.textContent = "比赛结束";
    return;
  }

  if (State.doubleElimActive) {
    updateDoubleElimStatus(statusHint, roundLabel);
    return;
  }

  const championNode = State.championId ? State.nodeById[State.championId] : null;
  const isChampionshipRound = championNode &&
    championNode.state === "pending" &&
    championNode.parentIds.every(pid => {
      const p = State.nodeById[pid];
      return p && p.state === "occupied";
    });

  const totalMatches = State.nodes.filter(n => n.type === "winner" || n.type === "champion").length;
  const completed = State.nodes.filter(n => (n.type === "winner" || n.type === "champion") && n.state === "occupied").length;
  const currentRound = findCurrentRound();
  const doubleElimPending = State.doubleElim && !State.doubleElimActive && getActivePlayerCount() > 0;

  if (isChampionshipRound) {
    roundLabel.textContent = "决赛 · " + State.totalCount + "人";
    setHintWithIcon(
      statusHint,
      "trophy",
      doubleElimPending
        ? "决赛！拖拽至中央 [决赛] 方框（剩余 <4 人，双败未触发）"
        : "决赛！拖拽胜者至中央 [决赛] 方框"
    );
  } else {
    roundLabel.textContent = "第" + (currentRound + 1) + "轮 · " + State.totalCount + "人";
    if (!draggableExists()) {
      statusHint.textContent = completed >= totalMatches
        ? "所有比赛已完成" : "等待双方就位后拖拽胜者晋级";
    } else {
      statusHint.textContent = doubleElimPending
        ? "拖拽胜者至内侧 [TBD] 方框以晋级（四强时自动切换双败赛）"
        : "拖拽胜者至内侧 [TBD] 方框以晋级";
    }
  }
}

function updateDoubleElimStatus(statusHint, roundLabel) {
  const wf = State.nodeById["WF_2_0"];
  const lf = State.nodeById["LF_2_0"];
  const lb1 = State.nodeById["LB_1_0"];
  const wl1 = State.nodeById["WL_1_0"];
  const wr1 = State.nodeById["WR_1_0"];
  const ll0 = State.nodeById["LL_0"];
  const ll1 = State.nodeById["LL_1"];
  const wfDrop = State.nodeById["WF_DROP"];

  const wfReady = wl1 && wl1.state === "occupied" && wr1 && wr1.state === "occupied";
  const lbReady = ll0 && ll0.state === "occupied" && ll1 && ll1.state === "occupied";
  const lfReady = lb1 && lb1.state === "occupied" && wfDrop && wfDrop.state === "occupied";
  const grandFinalReady = wf && wf.state === "occupied" && lf && lf.state === "occupied";
  const resetNeeded = State.doubleElimResetDone && grandFinalReady;

  if (resetNeeded) {
    roundLabel.textContent = "双败赛 · 总决赛加赛";
    setHintWithIcon(statusHint, "swords", "加赛决胜局！双方各一败，拖拽胜者至中央 [决赛] 方框");
    return;
  }

  if (!wl1 || wl1.state === "pending" || !wr1 || wr1.state === "pending") {
    roundLabel.textContent = "双败赛 · 半决赛";
    setHintWithIcon(
      statusHint,
      "list",
      !wl1 || wl1.state === "pending"
        ? "第一轮：拖拽左侧 (A vs B) 胜者至上方方框"
        : "第一轮：拖拽右侧 (C vs D) 胜者至上方方框"
    );
    return;
  }

  if (!wf || wf.state === "pending") {
    roundLabel.textContent = "双败赛 · 胜者组决赛";
    setHintWithIcon(
      statusHint,
      "list",
      wfReady
        ? "第二轮：拖拽胜者进入 [胜决] 方框（败者自动进入败者组）"
        : "胜者组决赛即将开始…"
    );
    return;
  }

  if (!lb1 || lb1.state === "pending") {
    roundLabel.textContent = "双败赛 · 败者组第一轮";
    setHintWithIcon(
      statusHint,
      "list",
      lbReady
        ? "第二轮：拖拽败者组胜者至 [TBD] 方框"
        : "等待双方败者就位…"
    );
    return;
  }

  if (!lf || lf.state === "pending") {
    roundLabel.textContent = "双败赛 · 败者组决赛";
    setHintWithIcon(
      statusHint,
      "list",
      lfReady
        ? "第三轮：拖拽胜者进入 [败决] 方框"
        : "等待双方选手就位（胜者组败者 + 败者组胜者）"
    );
    return;
  }

  if (grandFinalReady) {
    roundLabel.textContent = "双败赛 · 总决赛";
    setHintWithIcon(statusHint, "trophy", "第四轮：拖拽胜者至中央 [决赛] 方框！（若败者组冠军胜出将触发加赛）");
    return;
  }

  roundLabel.textContent = "双败赛 · 进行中";
  statusHint.textContent = "等待各轮次选手就位";
}

function findCurrentRound() {
  for (let r = 1; r <= State.n + 1; r++) {
    const nodes = State.nodes.filter(n => n.round === r && (n.type === "winner" || n.type === "champion"));
    if (nodes.some(n => n.state === "pending" || n.state === "in_progress")) return r - 1;
    if (nodes.length > 0 && nodes.every(n => n.state === "occupied")) continue;
    return r - 1;
  }
  return State.n;
}

function draggableExists() {
  return State.nodes.some(n => canBeDragged(n));
}

/* =================================================================
 *  拖拽判定（原 drag_drag.js）
 * ================================================================= */
function canBeDragged(node) {
  if (node.state !== "occupied") return false;
  if (!node.childId) return false;
  const child = State.nodeById[node.childId];
  if (!child) return false;

  if (State.doubleElimActive) return true;

  const parentCount = child.parentIds.length;
  if (parentCount < 1 || parentCount > 2) return false;

  const parents = child.parentIds.map(id => State.nodeById[id]).filter(Boolean);
  if (parents.length !== parentCount) return false;
  if (!parents.every(p => p.state === "occupied")) return false;

  if (child.state === "pending") return true;

  if (child.state === "occupied" && child.playerName !== node.playerName) {
    const otherParents = parents.filter(p => p.id !== node.id);
    return otherParents.length > 0 && otherParents.every(
      p => p.state === "advanced" && p.playerName === child.playerName
    );
  }

  return false;
}

function canBeDropTarget(node) {
  return node.state === "pending" ||
    (node.state === "occupied" && (node.type === "winner" || node.type === "champion"));
}

/* =================================================================
 *  HTML5 拖拽事件
 * ================================================================= */
function onDragStart(e) {
  const nodeId = e.target.dataset.nodeId;
  const node = State.nodeById[nodeId];
  if (!node || !canBeDragged(node)) {
    e.preventDefault();
    return;
  }

  dragData = { fromId: nodeId, toId: node.childId };

  if (State.doubleElimActive) {
    dragData.doubleElimExtraTargets = [];
    ["LL_0", "LL_1"].forEach(id => {
      if (State.nodeById[id] && State.nodeById[id].state === "pending") {
        dragData.doubleElimExtraTargets.push(id);
      }
    });
    if (State.nodeById["WF_DROP"] && State.nodeById["WF_DROP"].state === "pending") {
      dragData.doubleElimExtraTargets.push("WF_DROP");
    }
  }

  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", node.playerName);
  e.target.classList.add("dragging");

  const targetEl = document.getElementById("node-" + node.childId);
  if (targetEl) targetEl.classList.add("drop-target");

  if (dragData.doubleElimExtraTargets) {
    dragData.doubleElimExtraTargets.forEach(id => {
      const el = document.getElementById("node-" + id);
      if (el) el.classList.add("drop-target");
    });
  }
}

function onDragEnd(e) {
  e.target.classList.remove("dragging");
  document.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
  dragData = null;
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function onDragEnter(e) {
  e.preventDefault();
  e.target.classList.add("drop-target");
}

function onDragLeave(e) {
  e.target.classList.remove("drop-target");
}

function onDrop(e) {
  e.preventDefault();
  e.target.classList.remove("drop-target");

  if (!dragData) return;
  const box = e.target.closest(".node-box");
  const toNodeId = box ? box.dataset.nodeId : e.target.dataset.nodeId;

  if (toNodeId === dragData.toId) {
    handleValidDrop(dragData.fromId, toNodeId);
    dragData = null;
    return;
  }

  if (dragData.doubleElimExtraTargets && dragData.doubleElimExtraTargets.includes(toNodeId)) {
    handleValidDrop(dragData.fromId, toNodeId);
    dragData = null;
    return;
  }

  showHint("请拖放到对应内侧方框");
  dragData = null;
}

function handleValidDrop(fromId, toNodeId) {
  const fromNode = State.nodeById[fromId];
  const toNode = State.nodeById[toNodeId];
  if (!fromNode || !toNode) return;

  if (toNode.state === "pending") {
    executeAdvance(fromNode, toNode);
  } else if (toNode.state === "occupied") {
    executeReplace(fromNode, toNode);
  }
}

/* =================================================================
 *  晋级操作
 * ================================================================= */
function executeAdvance(fromNode, toNode) {
  State.undoStack.push({
    fromId: fromNode.id,
    toId: toNode.id,
    prevFromState: fromNode.state,
    prevToState: toNode.state,
    prevToName: toNode.playerName,
  });

  toNode.playerName = fromNode.playerName;
  toNode.state = "occupied";
  fromNode.state = "advanced";

  if (State.doubleElimActive) {
    executeDoubleElimAutoAdvance(fromNode, toNode);
  }

  propagateAdvance(toNode);
  processByes();

  if (State.doubleElimActive && checkDoubleElimBracketReset(toNode)) {
    saveState();
    renderAll();
    return;
  }

  checkCompletion();
  checkDoubleElimTransition();
  saveState();
  renderAll();
  showHint(fromNode.playerName + " 已晋级!");
}

/* =================================================================
 *  双败淘汰自动推进
 * ================================================================= */

/**
 * 双败赛自动推进:
 * 1. 叶子晋级到半决赛胜者槽 → 败者自动放入 LL_0/LL_1
 * 2. 半决赛胜者晋级到胜者组决赛 → 败者自动放入 WF_DROP
 */
function executeDoubleElimAutoAdvance(fromNode, toNode) {
  if ((fromNode.id === "L_0" || fromNode.id === "L_1") && toNode.id === "WL_1_0") {
    autoPlaceLoser(fromNode.id === "L_0" ? "L_1" : "L_0", "LL_0");
  }
  if ((fromNode.id === "R_0" || fromNode.id === "R_1") && toNode.id === "WR_1_0") {
    autoPlaceLoser(fromNode.id === "R_0" ? "R_1" : "R_0", "LL_1");
  }
  if (fromNode.id === "WL_1_0" && toNode.id === "WF_2_0") {
    autoPlaceLoser("WR_1_0", "WF_DROP");
  }
  if (fromNode.id === "WR_1_0" && toNode.id === "WF_2_0") {
    autoPlaceLoser("WL_1_0", "WF_DROP");
  }
}

function autoPlaceLoser(loserNodeId, targetNodeId) {
  const loser = State.nodeById[loserNodeId];
  const target = State.nodeById[targetNodeId];
  if (!loser || !target) return;
  if (loser.state !== "occupied" || !loser.playerName) return;
  if (target.state !== "pending") return;

  target.playerName = loser.playerName;
  target.state = "occupied";
  loser.state = "advanced";

  propagateAdvance(target);
  processByes();

  showHint(loser.playerName + " 自动进入败者组", "bolt");
}

/**
 * 双败总决赛 bracket reset:
 * 若败者组冠军战胜胜者组冠军 → 双方各1败 → 加赛
 */
function checkDoubleElimBracketReset(toNode) {
  if (toNode.id !== "CHAMPION") return false;

  const wf = State.nodeById["WF_2_0"];
  const lf = State.nodeById["LF_2_0"];
  if (!wf || !lf) return false;

  if (toNode.playerName === lf.playerName && wf.state === "occupied" && wf.playerName) {
    if (State.doubleElimResetDone) {
      State.phase = "complete";
      showHint("总决赛加赛结束！冠军: " + toNode.playerName + "！", "trophy");
      return false;
    }

    State.doubleElimResetDone = true;
    toNode.playerName = null;
    toNode.state = "pending";
    lf.state = "occupied";

    State.undoStack.pop();
    cascadeClear(toNode);

    saveState();
    renderAll();
    showHint("胜者组冠军「" + wf.playerName + "」首次失利！双方各一败，请加赛决定冠军！", "alert-triangle");
    return true;
  }
  return false;
}

/* =================================================================
 *  替换 & 传播 & 完成检查
 * ================================================================= */
function executeReplace(fromNode, toNode) {
  const otherParent = toNode.parentIds
    .map(id => State.nodeById[id])
    .find(p => p && p.id !== fromNode.id && p.state === "advanced");

  State.undoStack.push({
    fromId: fromNode.id, toId: toNode.id,
    prevFromState: fromNode.state, prevToState: toNode.state,
    prevToName: toNode.playerName,
    wasReplace: true,
    revertedId: otherParent ? otherParent.id : null,
  });

  if (otherParent) otherParent.state = "occupied";

  cascadeClear(toNode);
  toNode.playerName = null;
  toNode.state = "pending";

  toNode.playerName = fromNode.playerName;
  toNode.state = "occupied";
  fromNode.state = "advanced";

  propagateAdvance(toNode);
  processByes();
  checkCompletion();
  checkDoubleElimTransition();
  saveState();
  renderAll();
  showHint("已替换为 " + fromNode.playerName);
}

function propagateAdvance(node) {
  if (!node.childId) return;
  const child = State.nodeById[node.childId];
  if (!child || child.state !== "pending") return;

  const parents = child.parentIds.map(id => State.nodeById[id]).filter(Boolean);
  if (parents.length === 2 &&
      parents[0].state === "occupied" && parents[1].state === "occupied") {
    child.state = "pending";
  }
}

function checkCompletion() {
  if (!State.championId) return;
  const champ = State.nodeById[State.championId];
  if (champ && champ.state === "occupied") {
    State.phase = "complete";
    setTimeout(() => {
      const el = document.getElementById("node-" + State.championId);
      if (el) el.classList.add("champion-glow");
    }, 100);
  }
}

/* =================================================================
 *  双击撤销
 * ================================================================= */
function onDoubleClickNode(node, e) {
  e.preventDefault();
  if (node.state === "advanced") {
    tryUndoAdvance(node);
  } else if (node.state === "occupied" && node.type === "winner") {
    tryClearWinner(node);
  }
}

function tryUndoAdvance(node) {
  if (!node.childId) return;
  const child = State.nodeById[node.childId];
  if (!child) return;

  if (child.playerName !== node.playerName) {
    node.state = "occupied";
    State.phase = "playing";
    saveState();
    renderAll();
    showHint("已撤销晋级: " + node.playerName + "（对手已晋级，可拖入败者组）");
    return;
  }

  child.playerName = null;
  child.state = "pending";
  node.state = "occupied";

  cascadeClear(child);
  processByes();

  State.phase = "playing";
  saveState();
  renderAll();
  showHint("已撤销晋级: " + node.playerName);
}

function tryClearWinner(node) {
  if (node.parentIds.length < 1) return;
  const parents = node.parentIds.map(id => State.nodeById[id]).filter(Boolean);
  const occupiedParents = parents.filter(p => p && p.state === "advanced" && p.playerName === node.playerName);

  node.playerName = null;
  node.state = "pending";
  occupiedParents.forEach(p => { p.state = "occupied"; });

  cascadeClear(node);
  processByes();

  State.phase = "playing";
  saveState();
  renderAll();
  showHint("已回退");
}

function cascadeClear(node) {
  if (node.parentIds) {
    for (const pid of node.parentIds) {
      const p = State.nodeById[pid];
      if (p && p.state === "advanced" && p.playerName === node.playerName) {
        p.state = "occupied";
      }
    }
  }

  if (!node.childId) return;
  const child = State.nodeById[node.childId];
  if (!child || child.state !== "occupied") return;
  child.playerName = null;
  child.state = "pending";
  child.autoBye = false;
  cascadeClear(child);
}

/* =================================================================
 *  音乐抽取 & 比赛模式
 *
 *  原 drag_music.js 的 drawMusic（40×50ms 顺序循环闪现）→ component-draw-machine；
 *  startBattle / exitBattle（audio.src、body battle-mode / battle-keep-bg、双击退出、onended）
 *  → component-music-player；两者在 componentProps 里按运行时 props 装配并串联。
 *  本段只保留"曲库标签"这一页面语义：曲目需带曲库目录（播放时定 /resource/musics/<folder>/）。
 * ================================================================= */
function getTaggedMusicList() {
  const tagged = [];
  if (State.musicSource === "old") {
    (State.music.oldList || []).forEach(name => tagged.push({ name, source: "1yearplus" }));
  } else if (State.musicSource === "new") {
    (State.music.newList || []).forEach(name => tagged.push({ name, source: "1yearminus" }));
  } else if (State.musicSource === "ex") {
    (State.music.exList || []).forEach(name => tagged.push({ name, source: "1yearplus_ex" }));
  }
  return tagged;
}

/* =================================================================
 *  音乐库切换
 * ================================================================= */
function switchMusicSource(source) {
  if (State.musicSource === source) return;
  State.musicSource = source;

  document.getElementById("switch-music-old-btn").classList.toggle("active", source === "old");
  document.getElementById("switch-music-new-btn").classList.toggle("active", source === "new");
  document.getElementById("switch-music-ex-btn").classList.toggle("active", source === "ex");

  // 迁移前：清 lastDrawnMusic/lastDrawnMusicSource（曲目作废）→ 组件侧的当前曲目同步清空
  //（State 侧一并作废：否则下一次 saveState 会把已作废曲目写回存档，刷新后又给它复原）
  State.music.current = null;
  if (apis.music) apis.music.clearItem();
  const display = document.getElementById("music-display");
  display.textContent = "—";
  display.classList.remove("rolling", "selected");
  document.getElementById("start-battle-btn").disabled = true;

  showHint("已切换到" + (source === "old" ? "1year+" : source === "new" ? "1year-" : "1year+EX") + " 曲库");
}

