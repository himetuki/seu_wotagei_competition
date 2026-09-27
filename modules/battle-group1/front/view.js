/**
 * 一年加组对战（battle-group1）— 页面 flow（P11-B2「积木拼装」迁移后）
 *
 * 分层（P11 §2.1）：本文件 = L4 页面专属 flow（章节/轮次推进、技池、胜者选择与记录、
 * 下一章节提示、数据加载与存档编排）。跨页同构能力已抽走，本文件不再各写一份：
 *   · 抽音乐闪现动画 + 播放 + 比赛模式 → 组件 component-draw-machine / component-music-player
 *     （注册名 "draw-machine" / "music-player"，装配见 front/plugin.js 与 web/front.json 的 compose）
 *   · 洗牌 / 随机抽取              → /web/lib/random.mjs（pickN / pickOne，Fisher–Yates）
 *   · 存档双写 / 恢复 / 重置        → /web/lib/persist.mjs（createPersistence）
 *
 * 有意行为变更（仅以下三处，其余逐行保留语义）：
 *   1. 洗牌由 `sort(() => Math.random() - 0.5)`（有偏）改为 Fisher–Yates（等概率）——
 *      用户拍板统一修正（P11 §1.2 ③）；影响抽取两名选手与随机技能的分布，不影响流程。
 *   2. body 类名 `music-playing-mode` → `battle-mode`（组件规范类名，style.css 同步改名）。
 *   3. 点击提示文案「双击任意位置停止」→「单击任意位置停止」：手势本就是单击
 *      （组件的 exitOnClick，与迁移前 handleDocumentClick 同语义），仅文案与行为对齐。
 *
 * 迁移前 → 迁移后 对照：
 *   handleDrawMusic（15×80ms 闪现 + #fbbf24/#10b981 内联色）→ component-draw-machine
 *   startMusicMode / stopMusicMode / handleDocumentClick / handlePlayMusic
 *     （遮罩/打字动画/4500ms 待播/单击退出/audio onended） → component-music-player
 *   saveGameState / initializeGameState 的服务端与本地恢复链 / clearCache → createPersistence
 *   undoStack → 本模块原本没有该实现（P11 §1.2 ④ 的落点是 drag / group-battle），故无迁移
 *   章节/轮次推进、技池、胜者记录、下一章节提示、bracket 类页面逻辑 → 原样保留
 *
 * 组件降级：组件未注册/被 enabled:false 禁用时插槽留空，页面其余部分照常工作
 * （原内联实现已删除，不做"回退到旧实现"的双路径——双路径会让禁用开关形同虚设）。
 *
 * 缺陷修复（本轮）：
 *   · 比赛模式抖动：接组件新增的 onOverlayShown 钩子（进入模式、遮罩显示、打字动画开始前）。
 *     本页原 CSS 从未有 .shake 选择器（原 JS 的抖动是死代码），style.css 现补 `.battle-start.shake`，
 *     抖动在逐字动画走完的 1300ms 生效（原实现的注入时机）；body 不加 shake（见 style.css 注释）。
 *   · 宿主播放器 #music-player 移出 .container：比赛模式下 .container 整棵子树 opacity:0，
 *     祖先透明无法被子级的 opacity:1 覆盖，控件此前完全不可见（无法暂停/拖进度）。
 *   · 抖动定时器句柄登记，cleanup 兜底移除 .shake 类。
 */

import { iconEl } from "/web/icons.mjs";
import { pickN, pickOne } from "/web/lib/random.mjs";
import { createPersistence } from "/web/lib/persist.mjs";
import { createTimerRegistry } from "/web/lib/timers.mjs";

/* 自动保存定时器句柄（原代码未记录，cleanup 需要清理） */
let autoSaveTimer = null;
/* 服务端存档恢复的延迟写 DOM 定时器（原实现未跟踪，cleanup 一并清理） */
let restoreDelayTimer = null;
/* 存档代数守卫：resetGame 递增；页面装配时采样当前代数，恢复回包/延迟写落地前
 * 代数已变（期间发生过重置）则丢弃本次恢复，防在途存档覆写重置结果 */
let restoreGeneration = 0;
/* 本次页面装配采样的代数（battleGroup1Component 入口赋值） */
let loadGeneration = 0;
/* 一次性收尾定时器（toast/播报自动移除、抖动移除、清缓存后的 reload 等）——
 * P12 起经 /web/lib/timers.mjs 注册表统一登记（替代原 pageTimers + later() 样板）。
 * 按单渲染语义使用：cleanup dispose 后本实例不再重建（内核每文档仅 render 一次） */
const timers = createTimerRegistry();
/** 登记一次性定时器（cleanup 统一清理，避免 teardown 后回调仍在飞；别名保调用点零改动） */
const later = (fn, ms) => timers.later(fn, ms);
/* 持久化控制器（组件入口创建：需要 ctx.api；键/端点逐字保留存档契约） */
let persist = null;
/* 组件实例 API 桥（front/plugin.js 传入、组件 onReady 回填；组件缺失时保持 null） */
let apis = { music: null, draw: null };

/**
 * 抖动兜底清理：摘除 .shake 类（body + 遮罩文字节点）。
 * 组件复用同一批遮罩节点，残留的 .shake 会顶掉下一次的 battle-start-animation 入场动画；
 * 未到期的抖动定时器句柄由 timers 注册表统一清理（见 cleanup）。
 */
function clearBattleShake() {
  if (document.body) document.body.classList.remove("shake");
  document
    .querySelectorAll(".battle-start.shake")
    .forEach((node) => node.classList.remove("shake"));
}

/**
 * 比赛模式抖动（组件 onOverlayShown 钩子：进入模式、遮罩显示、逐字动画开始前触发）。
 * 迁移前 startMusicMode 在逐字动画走完的 1300ms 给 BATTLE START 文字加 .shake（抖动一次）。
 * 本页迁移前**没有** body 级 `.shake` 规则（原 CSS 只有 @keyframes、缺选择器），故此处
 * 只抖动遮罩文字节点——给 body 加 shake 会在 500ms 内平移整页（含 fixed 层），属新引入的
 * 视觉故障，不回填。
 */
function shakeBattleOverlay({ text } = {}) {
  clearBattleShake();
  if (!text) return;
  later(() => {
    text.classList.add("shake");
    later(() => text.classList.remove("shake"), 500);
  }, 1300);
}

/**
 * 一年加组对战系统 - 核心模块
 * 包含全局状态和基础初始化函数
 */

// =============== 全局状态管理 ===============
const BattleState = {
  // 基础数据
  players: [],
  originalPlayers: [],
  tricks: [],
  musicList: [],

  // 对战状态
  currentChapter: 1,
  currentRound: 1,
  currentWinner: null,
  participatedPlayers: [],
  chapterWinners: [],

  // 加载状态
  playersLoaded: false,
  tricksLoaded: false,
  musicLoaded: false,

  // 选中的技能状态
  selectedPlayer1Trick: null,
  selectedPlayer2Trick: null,
};

// =============== DOM 元素引用缓存 ===============
const DOM = {};

const FEATURE_TOGGLE_KEYS = {
  group1DrawTrick: "feature_group1_draw_trick_enabled",
};

// =============== 初始化函数 ===============
// 主入口函数 - 页面加载完成时执行
// （原 DOMContentLoaded 初始化已移至文件末尾组件入口）

// 缓存DOM元素引用
function cacheDOMReferences() {
  // 章节和轮次
  DOM.chapterNumber = document.getElementById("chapter-number");
  DOM.roundNumber = document.getElementById("round-number");

  // 选手区域
  DOM.player1 = document.getElementById("player1");
  DOM.player2 = document.getElementById("player2");
  DOM.player1Name = document.getElementById("player1-name");
  DOM.player2Name = document.getElementById("player2-name");

  // 功能按钮
  DOM.drawPlayersBtn = document.getElementById("draw-players-btn");
  DOM.drawMusicBtn = document.getElementById("draw-music-btn");
  DOM.drawTricksBtn = document.getElementById("draw-tricks-btn");
  DOM.playMusicBtn = document.getElementById("play-music-btn");
  DOM.clearWinnerBtn = document.getElementById("clear-winner-btn");
  DOM.nextRoundBtn = document.getElementById("next-round-btn");
  DOM.resetGameBtn = document.getElementById("reset-game-btn");
  DOM.homeBtn = document.getElementById("home-btn");
  DOM.clearCacheBtn = document.getElementById("clear-cache-btn");

  // 显示区域
  DOM.musicName = document.getElementById("music-name");
  DOM.musicPlayer = document.getElementById("music-player");
  DOM.randomTricksDisplay = document.getElementById("random-tricks-display");
  DOM.randomTricksPanel = document.querySelector("#battle-display .random-tricks");

  // 技池区域
  DOM.tricksPoolPlayer1 = document.getElementById("tricks-pool-list-player1");
  DOM.tricksPoolPlayer2 = document.getElementById("tricks-pool-list-player2");
}

/**
 * 为两张选手卡注入胜者奖杯徽标（原 .winner::before 伪元素 emoji 的 DOM 化替代）。
 * 徽标常驻 DOM，显隐由 CSS `.winner .winner-badge` 控制 —— 不触碰 setWinner 状态机。
 * 重复 render 时跳过已存在节点，避免叠加。
 */
function mountWinnerBadges() {
  for (const player of [DOM.player1, DOM.player2]) {
    if (!player || player.querySelector(".winner-badge")) continue;
    const badge = iconEl("trophy", { size: 24, class: "winner-badge" });
    if (badge) player.appendChild(badge);
  }
}

function applyFeatureToggles() {
  const drawTrickEnabled =
    localStorage.getItem(FEATURE_TOGGLE_KEYS.group1DrawTrick) !== "false";

  if (DOM.drawTricksBtn) {
    DOM.drawTricksBtn.style.display = drawTrickEnabled ? "" : "none";
  }

  if (DOM.randomTricksPanel) {
    DOM.randomTricksPanel.style.display = drawTrickEnabled ? "" : "none";
  }
}

// 初始化数据
function initializeData() {
  // 显示加载提示
  showToast("正在加载数据...", "info");

  // 并行加载所有数据
  Promise.all([loadPlayers(), loadTricks(), loadMusic()])
    .then(() => {
      console.log("所有数据加载完成");
      showToast("数据加载完成", "success");

      // 初始化游戏
      initializeGameState().catch((error) => {
        console.error("游戏状态初始化失败:", error);
        showToast("游戏状态加载失败，请刷新页面重试", "error");
      });
    })
    .catch((error) => {
      console.error("数据加载失败:", error);
      showToast("数据加载失败，请刷新页面重试", "error");
    });
}

/**
 * 一年加组对战系统 - UI模块
 * 包含UI和显示相关函数
 */

// 更新轮次显示
function updateRoundDisplay() {
  if (!DOM.chapterNumber || !DOM.roundNumber) return;

  DOM.chapterNumber.innerText = BattleState.currentChapter;

  // 计算剩余选手
  const availablePlayers = BattleState.players.filter(
    (player) => !BattleState.participatedPlayers.includes(player.name)
  );

  // 计算总轮次数
  const totalMatches = Math.ceil(BattleState.players.length / 2);

  DOM.roundNumber.innerText = `${BattleState.currentRound}/${totalMatches} (剩余选手: ${availablePlayers.length})`;
}

// 显示技能对决
function displayTrickMatch(player1Trick, player2Trick) {
  const container = document.createElement("div");
  container.className = "random-tricks-container";

  const tech1 = document.createElement("span");
  tech1.innerText = player1Trick;
  tech1.className = "tech-highlight";

  const vsText = document.createElement("span");
  vsText.innerText = "VS";
  vsText.className = "vs-text";

  const tech2 = document.createElement("span");
  tech2.innerText = player2Trick;
  tech2.className = "tech-highlight player2";

  container.appendChild(tech1);
  container.appendChild(vsText);
  container.appendChild(tech2);

  DOM.randomTricksDisplay.innerHTML = "";
  DOM.randomTricksDisplay.appendChild(container);
}

// 切换技能划线状态
function toggleCross(element) {
  element.classList.toggle("crossed");
  element.classList.add("animate");

  // 如果是技名高亮元素，特殊处理
  if (element.classList.contains("tech-highlight")) {
    if (element.classList.contains("crossed")) {
      element.style.animation = "none";
    } else {
      // 恢复动画
      const isPlayer2 = element.classList.contains("player2");
      if (isPlayer2) {
        element.style.animation =
          "techname-glow-orange 2s infinite, techname-color-orange 8s infinite, float 3s ease-in-out infinite";
      } else {
        element.style.animation =
          "techname-glow 2s infinite, techname-color 8s infinite, float 3s ease-in-out infinite";
      }
    }
  }

  later(() => element.classList.remove("animate"), 500);
}

// 显示获胜提示
function showWinnerAnnouncement(winnerName) {
  const announcement = document.createElement("div");
  announcement.classList.add("winner-announcement");
  announcement.innerText = `${winnerName} 获胜!`;
  document.body.appendChild(announcement);

  // 自动移除（句柄登记：cleanup 清定时器 + 摘孤儿节点）
  later(() => {
    if (document.body.contains(announcement)) {
      document.body.removeChild(announcement);
    }
  }, 3000);
}

// 重置获胜者显示
function resetWinnerDisplay() {
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");
  BattleState.currentWinner = null;
}

// 显示提示
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `${type}-toast`;
  toast.innerText = message;
  document.body.appendChild(toast);

  // 自动移除（句柄登记：cleanup 清定时器 + 摘孤儿节点）
  later(() => {
    if (document.body.contains(toast)) {
      document.body.removeChild(toast);
    }
  }, 3000);
}

// 添加自动保存定时器
function setupAutoSave() {
  // 每30秒自动保存一次
  autoSaveTimer = setInterval(saveGameState, 30000);
}

/**
 * 一年加组对战系统 - 数据模块
 * 包含数据加载和状态管理函数
 */

// =============== 数据加载函数 ===============
// 加载选手数据
function loadPlayers() {
  console.log("加载选手数据...");

  return fetch("/resource/json/player1.json")
    .then((response) => {
      if (!response.ok) throw new Error("选手数据加载失败");
      return response.json();
    })
    .then((data) => {
      BattleState.players = data;
      BattleState.originalPlayers = [...data];
      BattleState.playersLoaded = true;
      console.log(`成功加载 ${data.length} 名选手`);

      // 保存备份
      localStorage.setItem("backupPlayers", JSON.stringify(data));
      return data;
    })
    .catch((error) => {
      console.error("选手数据加载失败:", error);
      // 尝试从备份恢复
      return loadPlayersFromBackup();
    });
}

// 从备份加载选手数据
function loadPlayersFromBackup() {
  try {
    const backup = localStorage.getItem("backupPlayers");
    if (backup) {
      const data = JSON.parse(backup);
      if (data && data.length > 0) {
        BattleState.players = data;
        BattleState.originalPlayers = [...data];
        BattleState.playersLoaded = true;
        console.log(`从备份加载 ${data.length} 名选手`);
        return data;
      }
    }
    throw new Error("无备份数据");
  } catch (error) {
    console.error("从备份加载选手数据失败:", error);
    showToast("选手数据加载失败", "error");
    return [];
  }
}

// 加载技能数据
function loadTricks() {
  console.log("加载技能数据...");

  return fetch("/resource/json/tricks.json")
    .then((response) => {
      if (!response.ok) throw new Error("技能数据加载失败");
      return response.json();
    })
    .then((data) => {
      BattleState.tricks = data;
      BattleState.tricksLoaded = true;
      console.log(`成功加载 ${data.length} 个技能`);
      return data;
    })
    .catch((error) => {
      console.error("技能数据加载失败:", error);
      showToast("技能数据加载失败", "error");
      return [];
    });
}

// 加载音乐数据
function loadMusic() {
  console.log("加载音乐数据...");

  return fetch("/resource/json/musics_list.json")
    .then((response) => {
      if (!response.ok) throw new Error("音乐数据加载失败");
      return response.json();
    })
    .then((data) => {
      BattleState.musicList = data;
      BattleState.musicLoaded = true;
      console.log(`成功加载 ${data.length} 首音乐`);
      return data;
    })
    .catch((error) => {
      console.error("音乐数据加载失败:", error);
      showToast("音乐数据加载失败", "error");
      return [];
    });
}

// =============== 游戏状态管理 ===============
/**
 * 恢复存档（P11-B2：改用 createPersistence，等价于迁移前的
 * `fetch(GET /api/battle-group1-process)` → `.catch` 回退 localStorage 链）：
 *   - 服务端应答即以其为准（响应体形状 { currentState } 逐字保留）：空壳（无 currentState）
 *     按"无进度"处理、**不回退本地**——与迁移前 `.then` 分支一致（只有请求失败才回退本地）；
 *     因此 isValid 用"非 null 即算已应答"，绕开 persist 缺省"空对象不算存档"的判定。
 *   - 键 "battleGameState" 与端点 /api/battle-group1-process 逐字保留（老存档兼容）。
 */
async function initializeGameState() {
  console.log("初始化游戏状态...");

  // 先显示加载提示
  showToast("正在加载游戏状态...", "info");

  const { data, source } = await persist.load();

  // 代数守卫：等待恢复回包期间若发生过重置，丢弃本次恢复（重置结果不被旧存档覆盖）
  if (loadGeneration !== restoreGeneration) {
    console.info("[battle-group1] 存档恢复落地前检测到重置，丢弃本次恢复");
    completeInitialization();
    return;
  }

  if (source === "server") {
    if (data && data.currentState) {
      restoreFromState(data.currentState);
      console.log("游戏状态已从服务器恢复:", data.currentState);
      guardChapter(BattleState.currentChapter, "server");
      applyRestoredPlayers(data.currentState);
    }
  } else if (source === "local") {
    restoreFromState(data);
    console.log("游戏状态已从本地存储恢复:", data);
    guardChapter(BattleState.currentChapter, "local");
  }

  // 完成剩余初始化（迁移前 hasRedirected 恒为 false：handleChapterRedirect 从不跳转）
  completeInitialization();
}

/** 状态字段恢复（服务端 currentState 与本地存档同形，共用一份映射） */
function restoreFromState(state) {
  BattleState.currentChapter = state.currentChapter || 1;
  BattleState.currentRound = state.currentRound || 1;
  BattleState.participatedPlayers = state.participatedPlayers || [];
  BattleState.chapterWinners = state.chapterWinners || [];

  // 恢复已选择的技能
  if (state.selectedPlayer1Trick) {
    BattleState.selectedPlayer1Trick = state.selectedPlayer1Trick;
  }
  if (state.selectedPlayer2Trick) {
    BattleState.selectedPlayer2Trick = state.selectedPlayer2Trick;
  }
}

/**
 * 原 handleChapterRedirect：检测到非第一章节时只提示并固定在第 1 章第 4 轮，
 * 从不跳转（返回 false → 原 `hasRedirected` 分支为死代码，此处等价简化）。
 */
function guardChapter(chapter, source) {
  if (chapter === 1) return;
  console.log(`检测到非第一章节 (${chapter})，但保持在第一章节...`);
  BattleState.currentChapter = 1;
  BattleState.currentRound = 4; // 设置为第4轮
  if (source === "server") {
    showToast(`检测到进度：第${chapter}章，保持在第一章节`, "info");
  } else {
    showToast(`检测到第${chapter}章进度，已重置为第1章第4轮`, "info");
  }
}

/**
 * 服务端存档的选手名/胜者样式恢复（原实现是 500ms 延迟写 DOM：晚于 completeInitialization
 * 的自动抽人，因此最终显示的是存档里的选手；此处逐行保留该时序语义）。
 */
function applyRestoredPlayers(currentState) {
  if (!currentState.currentPlayers) return;
  // 空壳守卫：两名选手名皆为空串的存档是清档后的默认形（"真值但全空"），不得调度
  // 延迟写覆盖 completeInitialization 的自动抽取结果；有真实选手名的存档行为不变。
  if (
    !currentState.currentPlayers.player1 &&
    !currentState.currentPlayers.player2
  ) {
    console.info("[battle-group1] 空壳存档（无有效选手名），跳过恢复写入");
    return;
  }
  restoreDelayTimer = setTimeout(() => {
    restoreDelayTimer = null;
    // 代数守卫：延迟写落地前发生过重置 → 丢弃（500ms 窗口内的重置优先于恢复写入）
    if (loadGeneration !== restoreGeneration) {
      console.info("[battle-group1] 延迟恢复写入前检测到重置，丢弃本次写入");
      return;
    }
    if (!DOM.player1Name || !DOM.player2Name || !currentState.currentPlayers) return;

    DOM.player1Name.innerText = currentState.currentPlayers.player1 || "";
    DOM.player2Name.innerText = currentState.currentPlayers.player2 || "";

    // 如果有当前获胜者，恢复获胜者样式
    if (currentState.currentWinner) {
      BattleState.currentWinner = currentState.currentWinner;
      const playerId =
        currentState.currentWinner === currentState.currentPlayers.player1
          ? "player1"
          : "player2";
      const winnerElement = document.getElementById(playerId);
      const loserElement = document.getElementById(
        playerId === "player1" ? "player2" : "player1"
      );

      if (winnerElement && loserElement) {
        winnerElement.classList.add("winner");
        loserElement.classList.add("loser");
      }
    }
  }, 500);
}

// 分离出初始化的剩余部分，避免在跳转时执行
function completeInitialization() {
  // 初始化技能选择状态（如果尚未初始化）
  if (BattleState.selectedPlayer1Trick === undefined) {
    BattleState.selectedPlayer1Trick = null;
  }
  if (BattleState.selectedPlayer2Trick === undefined) {
    BattleState.selectedPlayer2Trick = null;
  }

  // 更新UI显示
  updateRoundDisplay();

  // 初始抽取选手（如果当前没有选手）
  if (!DOM.player1Name.innerText || !DOM.player2Name.innerText) {
    handleDrawPlayers();
  } else {
    // 如果有当前选手，更新技池
    updateTrickPools();

    // 如果有已选择的技能，显示技能对决
    if (BattleState.selectedPlayer1Trick && BattleState.selectedPlayer2Trick) {
      displayTrickMatch(
        BattleState.selectedPlayer1Trick,
        BattleState.selectedPlayer2Trick
      );
    }
  }

  // 显示加载完成提示
  showToast("游戏状态加载完成", "success");
}

/** 存档载荷（原 saveGameState 的 state 字面量，字段与顺序逐字保留） */
function getPersisted() {
  return {
    currentChapter: BattleState.currentChapter,
    currentRound: BattleState.currentRound,
    participatedPlayers: BattleState.participatedPlayers,
    chapterWinners: BattleState.chapterWinners,
    players: BattleState.players,
    currentWinner: BattleState.currentWinner,
    selectedPlayer1Trick: BattleState.selectedPlayer1Trick,
    selectedPlayer2Trick: BattleState.selectedPlayer2Trick,
    currentPlayers: {
      player1: DOM.player1Name.innerText,
      player2: DOM.player2Name.innerText,
    },
  };
}

// 保存游戏状态（双写：localStorage + POST；键与端点逐字保留，远端失败提示同迁移前）
function saveGameState() {
  persist.save(getPersisted()).then(({ remote }) => {
    if (remote) console.log("比赛状态已成功保存到服务器");
  });
}

/** persist 失败上报：阶段 → 与迁移前一致的提示文案 */
function handlePersistError(error, phase) {
  if (phase === "save:local") {
    console.error("保存游戏状态失败:", error);
    showToast("自动保存失败", "error");
  } else if (phase === "save:remote") {
    console.error("服务器保存失败:", error);
    showToast("自动保存失败，请检查网络连接", "error");
  } else {
    console.error("存档读写失败:", phase, error);
  }
}

// 清除缓存
function clearCache() {
  try {
    // 确认对话框
    if (!confirm("确定要清除所有缓存数据吗？此操作将无法恢复。")) {
      return;
    }

    // 清除本地存储（battleGameState 由 persist.reset 清）
    localStorage.removeItem("backupPlayers");

    // 清除服务器缓存（persist.reset 走 /api/clear-battle-group1-process）+ 重置 winners 数据
    Promise.all([
      persist.reset(),
      fetch("/api/reset-winners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: true }),
      }),
    ])
      .then(() => {
        console.log("所有缓存已清除");
        showToast("缓存已清除", "success");
        // 重置游戏状态
        resetGame();
        // 延迟刷新页面（一次性定时器登记：teardown 后可被 cleanup 回收）
        later(() => location.reload(), 1000);
      })
      .catch((error) => {
        console.error("清除缓存失败:", error);
        showToast("清除缓存失败", "error");
      });
  } catch (error) {
    console.error("清除缓存失败:", error);
    showToast("清除缓存失败", "error");
  }
}

// 重置游戏
function resetGame() {
  // 代数守卫：使在途存档恢复（恢复回包与 500ms 延迟写）全部失效
  restoreGeneration++;

  BattleState.currentChapter = 1;
  BattleState.currentRound = 1;
  BattleState.currentWinner = null;
  BattleState.participatedPlayers = [];
  BattleState.chapterWinners = [];

  // 恢复原始选手数据
  if (BattleState.originalPlayers.length > 0) {
    BattleState.players = [...BattleState.originalPlayers];
  }

  // 重置选中的技能状态
  BattleState.selectedPlayer1Trick = null;
  BattleState.selectedPlayer2Trick = null;

  // 更新UI
  updateRoundDisplay();

  // 重新抽取选手
  handleDrawPlayers();

  // 清空技名和音乐（音乐展示/播放状态归 music-player 组件，这里同步归零其内部 current）
  DOM.randomTricksDisplay.innerHTML = "请抽取动作";
  if (apis.music) {
    apis.music.stop();
    apis.music.clearItem();
  }
  DOM.musicName.innerText = "音乐名称";
  DOM.musicPlayer.src = "";

  // 重置选手区域样式
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");

  // 初始化winners.json文件
  resetWinnersData()
    .then(() => {
      showToast("游戏已重置，获胜者记录已清空", "success");
    })
    .catch((error) => {
      console.error("清空获胜者记录失败:", error);
      showToast("游戏已重置，但获胜者记录清空失败", "warning");
    });

  // 保存状态
  saveGameState();
}

// 添加重置winners.json的函数
function resetWinnersData() {
  return new Promise((resolve, reject) => {
    // 清空本地存储中的获胜者记录
    localStorage.removeItem("battleWinners");

    // 调用服务器API重置winners.json
    fetch("/api/reset-winners", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("服务器重置失败");
        }
        return response.text();
      })
      .then(() => {
        console.log("获胜者记录已成功重置");
        resolve();
      })
      .catch((error) => {
        console.error("重置获胜者记录失败:", error);
        reject(error);
      });
  });
}

// 保存获胜者数据
function saveWinnerData(winnerData) {
  // 保存到本地存储
  saveWinnerToLocalStorage(winnerData);

  // 保存到服务器
  saveWinnerToServer(winnerData).then((success) => {
    if (!success) {
      showToast("保存到服务器失败，已保存到本地", "warning");
    }
  });
}

// 修改保存到本地存储函数
function saveWinnerToLocalStorage(winnerData) {
  try {
    let savedData = localStorage.getItem("battleWinners");
    let winners = savedData ? JSON.parse(savedData) : {};

    const chapterKey = `chapter${winnerData.chapter}`;
    const roundKey = `round${winnerData.round}`;

    // 确保章节对象存在
    if (!winners[chapterKey]) {
      winners[chapterKey] = {};
    }

    // 添加新的获胜记录，保留其他记录
    winners[chapterKey][roundKey] = winnerData.winner;

    // 保存更新后的数据
    localStorage.setItem("battleWinners", JSON.stringify(winners));
    console.log("获胜者已保存到本地:", winners);
    return true;
  } catch (error) {
    console.error("保存获胜者到本地失败:", error);
    return false;
  }
}

// 修改保存到服务器函数
function saveWinnerToServer(winnerData) {
  return new Promise((resolve) => {
    try {
      // 先获取现有数据
      fetch("/api/battle-group1-process")
        .then((response) => response.json())
        .then((currentData) => {
          // 创建新的获胜记录
          const newWinnerData = {
            [`chapter${winnerData.chapter}`]: {
              [`round${winnerData.round}`]: winnerData.winner,
            },
          };

          // 发送到服务器
          return fetch("/api/winners", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(newWinnerData),
          });
        })
        .then((response) => {
          if (!response.ok) throw new Error("保存失败");
          return response.text();
        })
        .then(() => {
          console.log("获胜者已保存到服务器:", winnerData);
          showToast(`已保存获胜者: ${winnerData.winner}`, "success");
          resolve(true);
        })
        .catch((error) => {
          console.error("保存获胜者到服务器失败:", error);
          resolve(false);
        });
    } catch (error) {
      console.error("保存获胜者到服务器出错:", error);
      resolve(false);
    }
  });
}

/**
 * 一年加组对战系统 - 游戏模块
 * 包含游戏逻辑和流程控制
 */

// 处理下一轮
function handleNextRound() {
  if (!BattleState.currentWinner) {
    showToast("请先选择本轮胜者", "warning");
    return;
  }

  // 记录当前对战的选手
  const player1 = DOM.player1Name.innerText;
  const player2 = DOM.player2Name.innerText;

  // 添加到已参战列表
  if (!BattleState.participatedPlayers.includes(player1)) {
    BattleState.participatedPlayers.push(player1);
  }
  if (!BattleState.participatedPlayers.includes(player2)) {
    BattleState.participatedPlayers.push(player2);
  }

  // 记录获胜者
  if (!BattleState.chapterWinners.includes(BattleState.currentWinner)) {
    BattleState.chapterWinners.push(BattleState.currentWinner);
  }

  // 保存获胜数据
  saveWinnerData({
    chapter: BattleState.currentChapter,
    round: BattleState.currentRound,
    winner: BattleState.currentWinner,
  });

  // 进入下一轮
  proceedToNextRound();
  saveGameState();
}

// 进入下一轮
function proceedToNextRound() {
  // 更新轮次
  BattleState.currentRound++;

  // 检查是否已完成足够多的轮次，而不是仅仅检查可用选手
  // 第一章节应该至少进行4轮比赛
  const minRequiredRounds = 4;
  const maxRoundsChapter1 = 4;

  if (BattleState.currentRound > minRequiredRounds) {
    // 检查可用选手
    const availablePlayers = BattleState.players.filter(
      (player) => !BattleState.participatedPlayers.includes(player.name)
    );

    if (
      availablePlayers.length < 2 ||
      BattleState.currentRound > maxRoundsChapter1
    ) {
      // 显示提示，但不自动跳转
      showNextChapterPrompt();
      return;
    }
  }

  // 更新显示
  updateRoundDisplay();

  // 重置获胜者状态
  resetWinnerDisplay();

  // 抽取下一轮选手
  drawAvailablePlayers();

  // 保存游戏状态
  saveGameState();
}

// 添加一个新函数，显示下一章节提示，让用户手动决定
function showNextChapterPrompt() {
  // 保存当前状态，但保持在第一章节
  BattleState.currentRound = 4; // 固定在第4轮
  saveGameState();

  // 创建一个提示框
  const promptDiv = document.createElement("div");
  promptDiv.className = "next-chapter-prompt";
  promptDiv.innerHTML = `
    <div class="prompt-content">
      <h3>第一章节已完成</h3>
      <p>您已经完成了第一章节的比赛。</p>
      <div class="prompt-buttons">
        <button id="stay-button">留在当前页面</button>
        <button id="next-chapter-button">进入第二章节</button>
      </div>
    </div>
  `;
  document.body.appendChild(promptDiv);

  // 按钮事件
  document.getElementById("stay-button").addEventListener("click", function () {
    document.body.removeChild(promptDiv);
  });

  document
    .getElementById("next-chapter-button")
    .addEventListener("click", function () {
      // 准备下一章节数据
      const chapterWinnersData = {
        winners: BattleState.chapterWinners,
      };
      localStorage.setItem(
        "chapter1Winners",
        JSON.stringify(chapterWinnersData)
      );

      // 跳转
      window.location.href = "/m/battle-group1-2";
    });
}

// 修改开始新章节函数
function startNextChapter() {
  // 如果是第一章节结束，显示提示但不自动跳转
  if (BattleState.currentChapter === 1) {
    // 保存当前状态
    saveGameState();

    // 保存获胜者信息到 localStorage，以便在新页面中恢复
    const chapterWinnersData = {
      winners: BattleState.chapterWinners,
    };
    localStorage.setItem("chapter1Winners", JSON.stringify(chapterWinnersData));

    // 显示提示并让用户选择是否跳转
    showNextChapterPrompt();
    return;
  }

  // 对于其他情况，显示完成信息并跳转到结果页面
  showToast("比赛已结束！", "success");
  later(() => {
    window.location.href = "/m/rank";
  }, 1500);
}

// =============== 辅助功能函数 ===============
// 抽取未参战选手
function drawAvailablePlayers() {
  // 过滤出未参战选手
  const availablePlayers = BattleState.players.filter(
    (player) => !BattleState.participatedPlayers.includes(player.name)
  );

  if (availablePlayers.length < 2) {
    showToast("可用选手不足，将进入下一章节", "warning");
    startNextChapter();
    return;
  }

  // 随机抽取两名未参战选手
  // ★ 有意变更：原 `[...availablePlayers].sort(() => Math.random() - 0.5)` 是有偏洗牌，
  //   改为 /web/lib/random.mjs 的 Fisher–Yates 等概率抽取（用户拍板统一修正）。
  const selectedPlayers = pickN(availablePlayers, 2);

  // 更新UI
  DOM.player1Name.innerText = selectedPlayers[0].name;
  DOM.player2Name.innerText = selectedPlayers[1].name;

  // 更新技池
  updateTrickPools();

  // 重置已选中的技能
  BattleState.selectedPlayer1Trick = null;
  BattleState.selectedPlayer2Trick = null;

  console.log(
    `抽取选手: ${selectedPlayers[0].name} vs ${selectedPlayers[1].name}`
  );
}

// 显示选手技能（当前无调用点：原实现保留，见 P11-C 报告"遗留"一节）
function displayPlayerTricks(container, player, playerKey) {
  if (!container) return;

  container.innerHTML = "";

  // 如果选手没有技能，分配随机技能
  if (
    !player.tricks ||
    !Array.isArray(player.tricks) ||
    player.tricks.length === 0
  ) {
    player.tricks = generateRandomTricks(5);
  }

  // 判断是哪个选手
  const isPlayer2 = playerKey === "player2";

  // 显示技能
  player.tricks.forEach((trick) => {
    const span = document.createElement("span");
    span.innerText = trick;
    span.classList.add("tech-highlight");
    if (isPlayer2) span.classList.add("player2");

    span.addEventListener("click", () => toggleCross(span));
    container.appendChild(span);
  });
}

// 生成随机技能
function generateRandomTricks(count) {
  if (!BattleState.tricks || BattleState.tricks.length === 0) {
    return Array(count)
      .fill()
      .map((_, i) => `默认技能${i + 1}`);
  }

  const numTricks = Math.min(count, BattleState.tricks.length);
  // ★ 有意变更：有偏 sort → Fisher–Yates（同 drawAvailablePlayers）
  return pickN(BattleState.tricks, numTricks).map((trick) => trick.name);
}

// 更新技池
function updateTrickPools() {
  if (!BattleState.tricksLoaded) {
    // 如果技能数据未加载，延迟更新（重试定时器同样登记，cleanup 后不再空转）
    later(updateTrickPools, 500);
    return;
  }

  if (!DOM.tricksPoolPlayer1 || !DOM.tricksPoolPlayer2) {
    console.error("找不到技池DOM元素");
    return;
  }

  // 清空现有技池
  DOM.tricksPoolPlayer1.innerHTML = "";
  DOM.tricksPoolPlayer2.innerHTML = "";

  // 获取所有技能名称
  const trickNames = BattleState.tricks.map((trick) => trick.name);

  // 显示技池
  trickNames.forEach((trick) => {
    // 选手1技池
    const span1 = document.createElement("span");
    span1.innerText = trick;
    span1.classList.add("trick-item");
    span1.addEventListener("click", () => toggleCross(span1));
    span1.addEventListener("mousedown", handleMiddleClick);
    DOM.tricksPoolPlayer1.appendChild(span1);

    // 选手2技池
    const span2 = document.createElement("span");
    span2.innerText = trick;
    span2.classList.add("trick-item");
    span2.addEventListener("click", () => toggleCross(span2));
    span2.addEventListener("mousedown", handleMiddleClick);
    DOM.tricksPoolPlayer2.appendChild(span2);
  });
}

// 设置获胜者 (全局函数)
function setWinner(playerId) {
  // 移除先前样式
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");

  // 设置获胜者
  const winnerElement = document.getElementById(playerId);
  const loserElement = document.getElementById(
    playerId === "player1" ? "player2" : "player1"
  );

  // 获取赢家名称
  BattleState.currentWinner = document.getElementById(
    `${playerId}-name`
  ).innerText;

  // 添加样式
  winnerElement.classList.add("winner");
  loserElement.classList.add("loser");

  // 显示提示
  showWinnerAnnouncement(BattleState.currentWinner);
  saveGameState();
}

/**
 * 一年加组对战系统 - 事件模块
 * 包含事件监听和处理函数
 */

// 设置事件监听器
function setupEventListeners(signal) {
  // 检查DOM元素是否已缓存
  if (
    !DOM.drawPlayersBtn ||
    !DOM.drawMusicBtn ||
    !DOM.drawTricksBtn ||
    !DOM.playMusicBtn ||
    !DOM.clearWinnerBtn ||
    !DOM.nextRoundBtn ||
    !DOM.resetGameBtn
  ) {
    console.error("无法找到必要的DOM元素，请检查HTML结构");
    showToast("页面加载错误，请刷新重试", "error");
    return;
  }

  // 功能按钮事件监听
  // 抽取音乐 / 播放音乐 两个按钮由组件绑定（draw-machine 的 trigger / music-player 的
  // startTrigger），页面侧不再重复绑定，避免双击双跑
  DOM.drawPlayersBtn.addEventListener("click", handleDrawPlayers, { signal });
  DOM.drawTricksBtn.addEventListener("click", handleDrawTricks, { signal });
  DOM.clearWinnerBtn.addEventListener("click", handleClearWinnerSelection, { signal });
  DOM.nextRoundBtn.addEventListener("click", handleNextRound, { signal });

  // 重置按钮
  DOM.resetGameBtn.addEventListener("click", function () {
    if (confirm("确定要重置当前对战进度吗？将开始新的章节。")) {
      resetGame();
    }
  }, { signal });

  // 导航按钮
  DOM.homeBtn.addEventListener("click", function () {
    window.location.href = "index.html";
  }, { signal });

  // 添加清除缓存按钮事件监听
  if (DOM.clearCacheBtn) {
    DOM.clearCacheBtn.addEventListener("click", clearCache, { signal });
  }

  // 选手区域点击已改在组件入口以 addEventListener+signal 绑定（原 HTML 内联 onclick 已移除）

  // 页面卸载前保存状态
  window.addEventListener("beforeunload", saveGameState, { signal });

  // 添加自动保存
  setupAutoSave();
}

// 处理抽取选手
function handleDrawPlayers() {
  console.log("执行抽取选手");

  if (!BattleState.playersLoaded) {
    showToast("选手数据正在加载，请稍候", "info");
    return;
  }

  if (BattleState.players.length < 2) {
    showToast("选手数量不足，无法进行对战", "error");
    return;
  }

  // 抽取未参战选手
  drawAvailablePlayers();
  saveGameState();
}

// 处理抽取动作
function handleDrawTricks() {
  console.log("执行抽取动作");

  if (localStorage.getItem("feature_group1_draw_trick_enabled") === "false") {
    showToast("抽取动作功能已在设置页关闭", "info");
    return;
  }

  if (!BattleState.tricksLoaded) {
    showToast("技能数据正在加载，请稍候", "info");
    return;
  }

  // 确保技池已显示
  if (
    !DOM.tricksPoolPlayer1.children.length ||
    !DOM.tricksPoolPlayer2.children.length
  ) {
    updateTrickPools();
    later(handleDrawTricks, 500);
    return;
  }

  // 获取未划线的技能
  const player1Tricks = Array.from(
    DOM.tricksPoolPlayer1.querySelectorAll(".trick-item:not(.crossed)")
  );
  const player2Tricks = Array.from(
    DOM.tricksPoolPlayer2.querySelectorAll(".trick-item:not(.crossed)")
  );

  if (player1Tricks.length === 0 || player2Tricks.length === 0) {
    showToast("技池中没有可用的技能", "error");
    return;
  }

  // 随机选择技能（/web/lib/random.mjs 等概率单抽）
  const player1Trick = pickOne(player1Tricks).innerText;
  const player2Trick = pickOne(player2Tricks).innerText;

  // 更新选中的技能状态
  BattleState.selectedPlayer1Trick = player1Trick;
  BattleState.selectedPlayer2Trick = player2Trick;

  // 显示结果
  displayTrickMatch(player1Trick, player2Trick);
  saveGameState();
}

// 撤消当前轮次的胜者选择
function handleClearWinnerSelection() {
  if (!BattleState.currentWinner) {
    showToast("当前尚未选择胜者", "info");
    return;
  }

  resetWinnerDisplay();
  saveGameState();
  showToast("已撤消本轮胜者选择", "success");
}

// 处理中键点击函数
function handleMiddleClick(event) {
  if (event.button !== 1) return;

  event.preventDefault();

  const trickName = event.target.innerText;
  const isPlayer1Pool =
    event.target.closest("#tricks-pool-list-player1") !== null;

  // 更新选中的技能状态
  if (isPlayer1Pool) {
    BattleState.selectedPlayer1Trick = trickName;
  } else {
    BattleState.selectedPlayer2Trick = trickName;
  }

  // 显示技能对决
  displayTrickMatch(
    BattleState.selectedPlayer1Trick,
    BattleState.selectedPlayer2Trick
  );

  // 保存状态
  saveGameState();

  // 视觉反馈
  event.target.classList.add("middle-clicked");
  later(() => event.target.classList.remove("middle-clicked"), 300);
}

/* =================================================================
 *  组件装配（P11-B2）：页面侧只声明"运行时 props"，
 *  静态 props（时序/颜色/文案）在 web/front.json 的 battle-group1 config.components
 * ================================================================= */

/**
 * 运行时 props 工厂（front/plugin.js 挂载组件时取用）。
 * 只放依赖页面状态与回调的部分；静态覆盖由清单 config 提供，运行时 props 优先级更高。
 *
 * 分工（两个组件的按钮归属刻意不重叠——共用 #draw-music-btn 会双跑动画）：
 *   draw-machine  : 接管 #draw-music-btn 的闪现动画（保留 #fbbf24/#10b981 内联色）
 *   music-player  : 不接管 trigger，只接管 #play-music-btn（播放/比赛模式/退出）
 *   串联          : draw 定格 → bridge.music.setItem(item)（同步播放器 current + 预载 audio.src）
 */
export function componentProps(bridge) {
  return {
    "music-player": {
      items: () => BattleState.musicList,
      display: "#music-name",
      startTrigger: "#play-music-btn",
      onReady: (api) => {
        bridge.music = api;
      },
      // 比赛模式抖动：组件在"进入模式、遮罩显示、逐字动画开始前"回调；
      // 迁移前抖动发生在路径内 1300ms（BATTLE START 定稿），不是在真正开播的 4500ms。
      onOverlayShown: shakeBattleOverlay,
      // 未抽到音乐即点播放（迁移前提示文案逐字保留）
      onEmpty: () => showToast("请先抽取音乐", "warning"),
    },
    "draw-machine": {
      items: () => BattleState.musicList,
      display: "#music-name",
      trigger: "#draw-music-btn",
      onReady: (api) => {
        bridge.draw = api;
      },
      // 迁移前 handleDrawMusic 的两条前置校验（文案逐字保留）
      onEmpty: () =>
        showToast(
          BattleState.musicLoaded ? "音乐列表为空" : "音乐数据正在加载，请稍候",
          BattleState.musicLoaded ? "error" : "info"
        ),
      onResult: (item) => {
        if (bridge.music) bridge.music.setItem(item);
        showToast(`已抽取音乐: ${item}`, "success");
      },
    },
  };
}

/* =================================================================
 *  组件入口（原 bg1-core.js DOMContentLoaded 初始化，kernel render 时执行）
 * ================================================================= */
export function battleGroup1Component(el, meta, ctx, bridge) {
  // cleanup 契约：静态骨架节点的全部监听经 signal 登记，重渲染时 abort 统一解绑，
  // 防止不刷新页面的重复 render 造成双绑双触发
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

  // 组件实例 API（front/plugin.js 的 onReady 回填；组件缺失时保持 null）
  apis = bridge || { music: null, draw: null };

  // 代数采样：此后任何 resetGame 都会使在途存档恢复失效（见 initializeGameState）
  loadGeneration = restoreGeneration;

  // 存档控制器（键/端点逐字保留；远端失败经 onError 提示，与迁移前文案一致）
  persist = createPersistence({
    key: "battleGameState",
    endpoint: "/api/battle-group1-process",
    clearEndpoint: "/api/clear-battle-group1-process",
    api: ctx && ctx.api ? ctx.api : null,
    // 服务端"已应答"即不读本地（迁移前语义）：非 null 即算有效存档载荷
    isValid: (data) => data !== null && data !== undefined,
    onError: handlePersistError,
  });

  console.log("页面加载完成，初始化系统...");

  // 缓存DOM元素引用
  cacheDOMReferences();

  // 胜者奖杯：原 CSS ::before emoji 改为真实内联 SVG（显隐仍由 .winner 类驱动）
  mountWinnerBadges();

  // 应用功能开关
  applyFeatureToggles();

  // 选手卡点击（原 HTML 内联 onclick="setWinner(...)"）
  DOM.player1.addEventListener("click", () => setWinner("player1"), { signal });
  DOM.player2.addEventListener("click", () => setWinner("player2"), { signal });

  // 绑定事件监听器
  setupEventListeners(signal);

  // 加载数据
  initializeData();

  return () => cleanupBattleGroup1Page(bindAbort);
}

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用；组件实例的 cleanup 由 front/plugin.js 收集后调用）
 * ================================================================= */
function cleanupBattleGroup1Page(bindAbort) {
  // signal 登记的静态骨架监听（按钮/选手卡/window beforeunload）统一解绑
  if (bindAbort) bindAbort.abort();

  // 自动保存定时器
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }

  // 服务端存档的延迟写 DOM 定时器（原实现未跟踪，避免重渲染后写入失效节点）
  if (restoreDelayTimer) {
    clearTimeout(restoreDelayTimer);
    restoreDelayTimer = null;
  }

  // 一次性收尾定时器（toast/播报自动移除、抖动移除、清缓存后的 reload 等）：清空在飞任务，
  // 否则 teardown 后回调仍在飞、提示/播报节点会永久留在 body
  timers.dispose();
  clearBattleShake();
  for (const node of document.querySelectorAll(
    ".winner-announcement, .info-toast, .success-toast, .warning-toast, .error-toast"
  )) {
    node.remove();
  }

  // 音乐播放/比赛模式的清理（body 类、document 级监听、#music-player 的 onended/暂停）
  // 由 music-player 组件的 cleanup 负责（front/plugin.js 收集后逐个调用），页面侧不再重复。
}
