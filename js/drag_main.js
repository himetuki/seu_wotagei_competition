/**
 * Drag式比赛 — 核心状态 & 初始化
 *
 * 坐标系:
 *   1 GU = 容器宽度 / 50
 *   方框尺寸: 宽 4 GU × 高 1.2 GU
 *   每轮水平收缩: 5 GU
 *
 * 交互核心: 拖拽 (HTML5 Drag & Drop)
 *   仅当两父级均 Occupied → 子级 Pending → 可拖拽
 */

/* =================================================================
 *  常量
 * ================================================================= */
const GU_RATIO = 50;
const BOX_W_GU = 4;
const BOX_H_GU = 1.2;
const ROUND_STEP_GU = 5;

/* =================================================================
 *  持久化 API
 * ================================================================= */
const API_URL = "http://localhost:3000/api/drag-process";
const API_CLEAR_URL = "http://localhost:3000/api/clear-drag-process";

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
  battleKeepBg: true,
  doubleElim: false,
  doubleElimActive: false,
  doubleElimResetDone: false,
};

/* DOM 缓存 */
let canvasEl, nodesLayer, svgEl, containerW, containerH, GU, boxW, boxH;
let dragData = null;

/* =================================================================
 *  初始化入口
 * ================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  canvasEl = document.getElementById("canvas");
  nodesLayer = document.getElementById("nodes-layer");
  svgEl = document.getElementById("lines-svg");

  // 加载设置
  const keepBg = localStorage.getItem("dragBattleKeepBg");
  if (keepBg !== null) State.battleKeepBg = keepBg !== "false";
  const doubleElim = localStorage.getItem("dragDoubleElim");
  if (doubleElim !== null) State.doubleElim = doubleElim === "true";

  // 控制按钮
  document.getElementById("switch-player1-btn").addEventListener("click", () => switchPlayerSource("player1"));
  document.getElementById("switch-player2-btn").addEventListener("click", () => switchPlayerSource("player2"));
  document.getElementById("shuffle-btn").addEventListener("click", shufflePlayers);
  document.getElementById("reset-game-btn").addEventListener("click", handleReset);
  document.getElementById("setting-btn").addEventListener("click", () => { window.location.href = "../html/setting.html"; });
  document.getElementById("home-btn").addEventListener("click", () => { window.location.href = "../html/index.html"; });

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
      fetch("http://localhost:3000/api/drag-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doubleElim: val }),
      }).catch(() => {});
    });

    document.getElementById("modal-close-btn").addEventListener("click", () => {
      modalOverlay.classList.add("closed");
    });
  }

  // 音乐库切换按钮
  document.getElementById("switch-music-old-btn").addEventListener("click", () => switchMusicSource("old"));
  document.getElementById("switch-music-new-btn").addEventListener("click", () => switchMusicSource("new"));
  document.getElementById("switch-music-ex-btn").addEventListener("click", () => switchMusicSource("ex"));

  // 音乐抽取 & 比赛按钮
  document.getElementById("draw-music-btn").addEventListener("click", drawMusic);
  document.getElementById("start-battle-btn").addEventListener("click", startBattle);

  // 双击退出比赛模式
  document.addEventListener("dblclick", (e) => {
    if (battleActive) exitBattle();
  });

  // 窗口大小变化重渲染
  window.addEventListener("resize", debounce(() => {
    if (!canvasEl) return;
    recomputeLayout();
    renderAll();
  }, 150));

  // 加载数据
  loadSettings()
    .then(() => Promise.all([loadPlayers(), loadMusic()]))
    .then(() => {
      const loadedSource = State.playerSource;
      loadStateFromServer().then(ok => {
        if (!ok) loadLocalState(State.playerSource);

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
});

/* =================================================================
 *  工具函数
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

function showHint(msg) {
  const hint = document.getElementById("status-hint");
  hint.textContent = msg;
  setTimeout(() => {
    if (hint.textContent === msg) updateStatus();
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
