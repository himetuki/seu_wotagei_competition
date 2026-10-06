/**
 * 一年加组对战第二章节（battle-group1-2）— 页面 flow（P11-B3「积木拼装」迁移后）
 *
 * 分层（P11 §2.1）：本文件 = L4 页面专属 flow（双败赛程推进、赛程图渲染、胜者选择与记录、
 * 章节冠军保存、数据加载与存档编排）。跨页同构能力已抽走，本文件不再各写一份：
 *   · 抽音乐闪现动画 + 播放 + 比赛模式 → 组件 component-draw-machine / component-music-player
 *     （注册名 "draw-machine" / "music-player"，装配见 front/plugin.js 与 web/front.json 的 compose）
 *   · 洗牌 / 随机抽取              → /web/lib/random.mjs（pickN，Fisher–Yates）
 *   · 存档双写 / 恢复 / 重置        → /web/lib/persist.mjs（createPersistence）
 *
 * 有意行为变更（仅以下四类，其余逐行保留语义）：
 *   1. 洗牌由 `[...].sort(() => Math.random() - 0.5)`（有偏）改为 Fisher–Yates（等概率）——
 *      用户拍板统一修正（P11 §1.2 ③），只影响「随机匹配」的配对分布。
 *   2. body 类名 `music-playing-mode` → `battle-mode`（组件规范类名，style.css 同步改名）。
 *   3. 点击提示文案「双击任意位置停止」→「单击任意位置停止」：手势本就是单击
 *      （组件的 exitOnClick，与迁移前 handleDocumentClick 同语义），仅文案与行为对齐。
 *   4. 选手/获胜者数据加载容错统一（见「数据模块」段注释）：winners 数据缺失/格式不符
 *      不再 throw，降级为默认选手并继续（修复用户实际遇到的红色报错）。
 *
 * 迁移前 → 迁移后 对照：
 *   handleDrawMusic（15×80ms 闪现 + #fbbf24/#10b981 内联色）→ component-draw-machine
 *   startMusicMode / stopMusicMode / handleDocumentClick / handlePlayMusic / playBattleStartAnimation
 *     （遮罩/逐字动画/4500ms 待播/单击退出/audio onended） → component-music-player
 *   saveGameState / initializeGameState 的服务端与本地恢复链 / clearCacheAndResetGame
 *     → createPersistence（key "battleGroup1-2State" 与端点逐字保留）
 *   已删除的死代码：playBattleStartAnimation、clearCache（均无调用点，且后者的清缓存语义
 *   已由 clearCacheAndResetGame + persist.reset 覆盖）
 *   双败赛程推进、赛程图、胜者记录、章节冠军 → 原样保留
 *
 * 组件降级：组件未注册/被 enabled:false 禁用时插槽留空，页面其余部分照常工作
 * （原内联实现已删除，不做"回退到旧实现"的双路径——双路径会让禁用开关形同虚设）。
 *
 * 缺陷修复（本轮）：
 *   · 比赛模式抖动：接组件新增的 onOverlayShown 钩子（进入模式、遮罩显示、打字动画开始前），
 *     还原迁移前的两个时机——body 抖动（50ms 后加类、500ms 后移除）与 BATTLE START 文字抖动
 *     （逐字动画走完的 1300ms）。原来误挂在 onStarted → 要等 readyMs=4500ms 才抖。
 *   · 抖动定时器并入 timers 注册表/later()（原先单个 shakeTimer 句柄），cleanup 统一清句柄 + 摘 body 类。
 */

import { icon, iconEl } from "/web/icons.mjs";
import { pickN } from "/web/lib/random.mjs";
import { createPersistence } from "/web/lib/persist.mjs";
import { createTimerRegistry } from "/web/lib/timers.mjs";

/* 自动保存定时器句柄（原代码未记录，cleanup 需要清理） */
let autoSaveTimer = null;
/* 初始化收尾的选手名补写定时器（原 500ms 延迟，未记录句柄） */
let playerNameRetryTimer = null;
/* 存档代数守卫：resetGame 递增；页面装配时采样当前代数，恢复回包落地前代数已变
 * （期间发生过重置）则丢弃本次恢复，防在途存档覆写重置结果 */
let restoreGeneration = 0;
/* 本次页面装配采样的代数（battleGroup12Component 入口赋值） */
let loadGeneration = 0;
/* 一次性收尾定时器（播报/toast 自动移除、清缓存后的 reload、比赛模式抖动）——
 * P12 起经 /web/lib/timers.mjs 注册表统一登记（替代原 pageTimers + later() 样板） */
const timers = createTimerRegistry();
/** 登记一次性定时器（cleanup 统一清理，避免 teardown 后回调仍在飞；别名保调用点零改动） */
const later = (fn, ms) => timers.later(fn, ms);
/* 存档控制器（组件入口创建：需要 ctx.api；键/端点逐字保留存档契约） */
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
 * 迁移前 startMusicMode 的两个时机逐字保留：
 *   · body 加 .shake（进入模式 50ms 后），500ms 后移除 → 整屏抖动
 *   · BATTLE START 文字在逐字动画走完（1300ms）时加 .shake，抖动一次
 */
function shakeBattleOverlay({ text } = {}) {
  clearBattleShake();
  later(() => {
    document.body.classList.add("shake");
    later(() => document.body.classList.remove("shake"), 500);
  }, 50);
  if (!text) return;
  later(() => {
    text.classList.add("shake");
    later(() => text.classList.remove("shake"), 500);
  }, 1300);
}

/**
 * 一年加组对战系统 - 第二章节（核心模块）
 * 包含全局状态管理和基础初始化函数
 */

// =============== 全局状态管理 ===============
const BattleState = {
  // 基础数据
  players: [],
  musicList: [],

  // 对战状态
  currentRound: 1,
  totalRounds: 5, // 双败赛制需要5轮比赛（胜者组2轮、败者组2轮、决赛1-2轮）
  currentBracket: "winner", // winner, loser, final
  currentMatchIndex: 0,
  currentWinner: null,

  // 排名信息
  champion: null, // 冠军
  runnerUp: null, // 亚军
  thirdPlace: null, // 季军
  fourthPlace: null, // 殿军

  // 比赛记录
  matches: [], // 存储所有比赛的结果
  playerStats: {}, // 存储选手战绩

  // 双败赛制的赛程安排
  bracket: {
    winner: [], // 胜者组比赛
    loser: [], // 败者组比赛
    final: [], // 决赛
  },

  // 加载状态
  playersLoaded: false,
  musicLoaded: false,
};

// =============== DOM 元素引用缓存 ===============
const DOM = {};

// =============== 初始化函数 ===============
// 主入口函数 - 页面加载完成时执行
// （原 DOMContentLoaded 初始化已移至文件末尾组件入口）

// 缓存DOM元素引用
function cacheDOMReferences() {
  // 章节和轮次
  DOM.chapterNumber = document.getElementById("chapter-number");
  DOM.roundNumber = document.getElementById("round-number");
  DOM.tournamentStatus = document.getElementById("tournament-status");

  // 选手区域
  DOM.player1 = document.getElementById("player1");
  DOM.player2 = document.getElementById("player2");
  DOM.player1Name = document.getElementById("player1-name");
  DOM.player2Name = document.getElementById("player2-name");
  DOM.player1Wins = document.getElementById("player1-wins");
  DOM.player1Losses = document.getElementById("player1-losses");
  DOM.player2Wins = document.getElementById("player2-wins");
  DOM.player2Losses = document.getElementById("player2-losses");

  // 赛程图
  DOM.bracketDisplay = document.getElementById("bracket-display");

  // 功能按钮
  DOM.drawMusicBtn = document.getElementById("draw-music-btn");
  DOM.playMusicBtn = document.getElementById("play-music-btn");
  DOM.nextMatchBtn = document.getElementById("next-match-btn");
  DOM.resetGameBtn = document.getElementById("reset-game-btn");
  DOM.clearCacheBtn = document.getElementById("clear-cache-btn");
  DOM.randomMatchBtn = document.getElementById("random-match-btn");

  // 音乐曲名展示节点（#music-player 音频本体由 music-player 组件按 id 复用，页面不再直取）
  DOM.musicName = document.getElementById("music-name");
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

// 初始化数据
function initializeData() {
  // 显示加载提示
  showToast("正在加载数据...", "info");

  // 并行加载所有数据
  Promise.all([loadPlayers(), loadMusic()])
    .then(() => {
      console.log("所有数据加载完成");
      showToast("数据加载完成", "success");

      // 初始化游戏
      initializeGameState();
    })
    .catch((error) => {
      console.error("数据加载失败:", error);
      showToast("数据加载失败，请刷新页面重试", "error");
    });
}

/**
 * 一年加组对战系统 - 第二章节（数据模块）
 * 包含数据加载和状态管理函数
 *
 * ★ 选手（胜者）数据容错（B3 统一）：
 *   加载链 localStorage `chapter1Winners` → `/resource/json/winners.json` → 默认数据，
 *   任何一级「数据缺失 / 格式不符 / 网络失败」都**降级为默认选手并继续**，绝不 throw。
 *   背景：winners.json 文件缺失时，静态路由 /resource/json/:jsonfile 会回退查询同名
 *   SQLite 库 `winners`（battle-group1 的「重置」会把它清成 {}），返回 200 {}；
 *   迁移前此处的 `throw` 会打断整条链、弹红色报错 —— 现已改为 warn + 「使用默认数据」提示。
 */

/** winners 名单 → 选手对象数组（字段与迁移前逐字一致） */
function playersFromWinners(winners) {
  return winners.map((name) => ({ name, wins: 0, losses: 0 }));
}

/** 不足 4 名时补默认选手（winners.json 路径的原内联补位逻辑，提取为两条加载路径共用） */
function padDefaultPlayers(winners) {
  const padded = [...winners];
  while (padded.length < 4) {
    padded.push(`默认选手${padded.length + 1}`);
  }
  return padded;
}

/**
 * 一级数据源：localStorage `chapter1Winners`（键逐字保留）。
 * @returns {string[]|null} 合法获胜者名单；无记录 / JSON 损坏 / 空数组 → null（不抛错）
 */
function readChapter1Winners() {
  let raw = null;
  try {
    raw = localStorage.getItem("chapter1Winners");
  } catch (e) {
    console.warn("[battle-group1-2] 读取 chapter1Winners 失败，忽略该级数据:", e);
    return null;
  }
  console.log("localStorage中的chapter1Winners数据:", raw);
  if (!raw) return null;
  try {
    const winnersData = JSON.parse(raw);
    console.log("解析后的winners数据:", winnersData);
    if (
      winnersData &&
      Array.isArray(winnersData.winners) &&
      winnersData.winners.length > 0
    ) {
      return winnersData.winners;
    }
    return null;
  } catch (e) {
    console.warn("[battle-group1-2] chapter1Winners 解析失败，忽略该级数据:", e);
    return null;
  }
}

/**
 * 二级数据源：winners.json 应答 → 第 1 章 1-4 轮胜者。
 * 数据缺失 / 格式不符（含 `{}`、缺 chapter1、章节非对象）→ []（**不抛错**，由调用方降级）。
 */
function extractChapter1Winners(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  if (!data.chapter1 || typeof data.chapter1 !== "object") return [];

  // 从各轮次获取胜者
  const winners = [];
  for (let i = 1; i <= 4; i++) {
    const roundKey = `round${i}`;
    if (data.chapter1[roundKey]) {
      winners.push(data.chapter1[roundKey]);
      console.log(`找到第${i}轮获胜者:`, data.chapter1[roundKey]);
    } else {
      console.warn(`未找到第${i}轮获胜者`);
    }
  }
  return winners;
}

// 加载选手数据（localStorage chapter1Winners → winners.json → 默认数据）
function loadPlayers() {
  console.log("加载选手数据...");

  // 一级：上一章节遗留的获胜者名单
  const localWinners = readChapter1Winners();
  if (localWinners) {
    // 与 winners.json 路径对称：第一章提前收章（不足 4 人）时补默认选手，
    // 否则 initializeNewGame 会因「选手数据不足」卡死、需清缓存自救
    const padded = padDefaultPlayers(localWinners);
    if (padded.length !== localWinners.length) {
      console.warn(
        `localStorage 获胜者仅 ${localWinners.length} 名，已补默认选手至 4 名`
      );
    }
    const players = playersFromWinners(padded);
    BattleState.players = players;
    BattleState.playersLoaded = true;
    console.log("成功从localStorage加载第一章节获胜者作为选手:", players);
    return Promise.resolve();
  }

  // 二级：winners.json（文件缺失时静态路由回退同名数据库，可能返回 {}）
  console.log("从localStorage加载失败，尝试从winners.json加载选手数据...");
  return fetch("/resource/json/winners.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`获取winners.json失败 (HTTP ${response.status})`);
      }
      return response.json();
    })
    .then((data) => {
      console.log("从winners.json获取的原始数据:", data);

      const winners = extractChapter1Winners(data);
      if (winners.length === 0) {
        // ★ 容错：不再 throw（原实现 throw 会打断加载链并弹红色报错），降级为默认数据
        console.warn(
          "[battle-group1-2] winners 数据不可用（缺少 chapter1 或为空），将使用默认数据:",
          data
        );
        showToast("获胜者数据不可用，将使用默认数据", "warning");
      } else if (winners.length < 4) {
        console.warn(
          `获胜者数据不足，只找到${winners.length}名获胜者，需要4名`
        );
      }

      // 不足 4 名时补默认选手（原内联逻辑提取为 padDefaultPlayers，行为逐字保留）
      const padded = padDefaultPlayers(winners);
      console.log("添加默认选手后的列表:", padded);

      // 转换为选手对象数组
      const players = playersFromWinners(padded);
      BattleState.players = players;
      BattleState.playersLoaded = true;

      // 保存到 battle-group1-2-process，以确保一致性
      return updateBattleProcessOnServer(players);
    })
    .catch((error) => {
      // 网络/解析失败：同样降级为默认数据，不阻断流程
      console.warn("[battle-group1-2] 加载选手数据失败，将使用默认数据:", error);
      showToast("加载选手数据失败，将使用默认数据", "warning");

      // 创建默认选手
      const defaultPlayers = [
        { name: "选手1", wins: 0, losses: 0 },
        { name: "选手2", wins: 0, losses: 0 },
        { name: "选手3", wins: 0, losses: 0 },
        { name: "选手4", wins: 0, losses: 0 },
      ];
      BattleState.players = defaultPlayers;
      BattleState.playersLoaded = true;

      return updateBattleProcessOnServer(defaultPlayers);
    });
}

// 向服务器更新battle-group1-2-process中的选手数据
function updateBattleProcessOnServer(players) {
  return fetch("/api/update-battle-group1-2-players", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ players }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("更新battle-group1-2-process中的选手数据失败");
      }
      console.log("成功更新battle-group1-2-process中的选手数据");
      return response.text();
    })
    .catch((error) => {
      console.error("更新选手数据到服务器失败:", error);
      return Promise.resolve(); // 继续流程
    });
}

// 加载音乐数据（从musics_list_ex.json；曲库目录 1yearplus_ex 由组件的 folder prop 承担）
function loadMusic() {
  console.log("加载音乐数据...");

  return fetch("/resource/json/musics_list_ex.json")
    .then((response) => {
      if (!response.ok) throw new Error("音乐数据加载失败");
      return response.json();
    })
    .then((data) => {
      BattleState.musicList = Array.isArray(data) ? data : [];
      BattleState.musicLoaded = true;
      console.log(`成功加载 ${BattleState.musicList.length} 首音乐`);
      return BattleState.musicList;
    })
    .catch((error) => {
      console.error("音乐数据加载失败:", error);
      showToast("音乐数据加载失败", "error");
      return [];
    });
}

// 初始化游戏状态
async function initializeGameState() {
  console.log("初始化游戏状态...");

  // 先显示加载提示
  showToast("正在加载游戏状态...", "info");

  // 恢复链（P11-B3：createPersistence，等价于迁移前的
  // `fetch(GET /api/battle-group1-2-process)` → `.catch` 回退 localStorage 链）：
  //   键 "battleGroup1-2State" 与端点 /api/battle-group1-2-process 逐字保留（老存档兼容）。
  //   isValid 采「非 null 即算已应答」，从而 GET 成功但内容为空壳时按原实现走 initializeNewGame，
  //   而不是被缺省判定误判为「无存档」再去读本地。
  const { data, source } = await persist.load();

  // 代数守卫：等待恢复回包期间若发生过重置，丢弃本次恢复并收敛到重置后状态
  // （initializeNewGame 对"选手已加载/未加载"两种时序都能正确重建赛程）
  if (loadGeneration !== restoreGeneration) {
    console.info("[battle-group1-2] 存档恢复落地前检测到重置，丢弃本次恢复");
    initializeNewGame();
    updateBracketDisplay();
    updateRoundDisplay();
    showToast("游戏状态加载完成", "success");
    return;
  }

  if (source === "server") {
    if (data && Object.keys(data).length > 0 && hasRestorableSave(data)) {
      // 恢复当前状态
      restoreGameState(data);
      console.log("游戏状态已从服务器恢复:", data);
    } else {
      console.log("未找到保存的进度，初始化新游戏");
      // 初始化新游戏
      initializeNewGame();
    }
  } else if (source === "local") {
    restoreGameState(data);
    console.log("游戏状态已从本地存储恢复:", data);
  } else {
    console.log("本地也没有保存的进度，初始化新游戏");
    initializeNewGame();
  }

  // 显示当前比赛（原 .finally 块，逐行保留）
  updateBracketDisplay();
  updateRoundDisplay();

  console.log("检查当前比赛...");
  const currentMatch = getCurrentMatch();
  console.log("当前比赛:", currentMatch);

  // 强制显示选手，即使没有当前比赛
  if (currentMatch) {
    console.log("显示当前比赛选手");
    displayCurrentMatch();
  } else if (BattleState.players && BattleState.players.length >= 2) {
    // 如果没有当前比赛但有选手，显示第一对选手
    console.log("没有当前比赛，但有选手数据，显示初始对阵");
    DOM.player1Name.innerText = BattleState.players[0].name;
    DOM.player2Name.innerText = BattleState.players[1].name;
    updatePlayerStatsDisplay();
  }

  // 确保选手名称已经正确设置（原 500ms 延迟补写；句柄已登记，cleanup 清理）
  playerNameRetryTimer = setTimeout(() => {
    playerNameRetryTimer = null;
    if (!DOM.player1Name.innerText || !DOM.player2Name.innerText) {
      console.log("选手名称为空，尝试重新设置");
      if (BattleState.players && BattleState.players.length >= 2) {
        DOM.player1Name.innerText = BattleState.players[0].name;
        DOM.player2Name.innerText = BattleState.players[1].name;
        updatePlayerStatsDisplay();
      }
    }
  }, 500);

  // 显示加载完成提示
  showToast("游戏状态加载完成", "success");
}

/**
 * 空壳档案判定：clear 端点写回的是「键齐全但无选手、无赛程」的默认形，且
 * loadPlayers 尾部的 updateBattleProcessOnServer 会在恢复 GET 之前把 players 字段
 * 补成 4 人 —— 单看 players 分不出空壳与真存档。故以「有有效选手**且**赛程图
 * 已建立（bracket 至少一轮）」为可恢复存档，否则按"无进度"走 initializeNewGame；
 * 有真实数据的存档（对局中 bracket 恒非空）行为不变。
 */
function hasRestorableSave(data) {
  if (!Array.isArray(data.players) || !data.players.some((p) => p && p.name)) {
    return false;
  }
  const b = data.bracket;
  return !!(
    b &&
    ((Array.isArray(b.winner) && b.winner.length > 0) ||
      (Array.isArray(b.loser) && b.loser.length > 0) ||
      (Array.isArray(b.final) && b.final.length > 0))
  );
}

// 恢复游戏状态
function restoreGameState(state) {
  // 恢复基本状态
  BattleState.currentRound = state.currentRound || 1;
  BattleState.currentBracket = state.currentBracket || "winner";
  BattleState.currentMatchIndex = state.currentMatchIndex || 0;
  BattleState.currentWinner = state.currentWinner || null;

  // 恢复比赛数据
  if (state.matches && Array.isArray(state.matches)) {
    BattleState.matches = state.matches;
  }

  // 恢复选手统计
  if (state.playerStats) {
    BattleState.playerStats = state.playerStats;
  }

  // 恢复赛程数据
  if (state.bracket) {
    BattleState.bracket = state.bracket;
  }

  // 恢复选手数据（如果没有从winners.json加载）
  if (state.players && state.players.length === 4) {
    BattleState.players = state.players;
    BattleState.playersLoaded = true;
  }
}

// 初始化新游戏
function initializeNewGame() {
  console.log("初始化新游戏...");

  // 确保至少有4名选手
  if (!BattleState.playersLoaded || BattleState.players.length < 4) {
    console.error("选手数据不足，无法初始化比赛");
    showToast("选手数据不足，请检查上一章节获胜者数据", "error");
    return;
  }

  // 清除上一局的终局标志与排名（终局后重置再开局时不清，会让 handleNextMatch
  // 因 tournamentCompleted 恒真而每次早退报「比赛已完成，但无法确定获胜者」；
  // resetGame 亦经此处重置，不必重复清）
  BattleState.tournamentCompleted = false;
  BattleState.champion = null;
  BattleState.runnerUp = null;
  BattleState.thirdPlace = null;
  BattleState.fourthPlace = null;

  // 初始化选手统计
  BattleState.playerStats = {};
  BattleState.players.forEach((player) => {
    BattleState.playerStats[player.name] = { wins: 0, losses: 0 };
  });

  // 初始化比赛安排
  initializeTournamentBracket();

  // 设置初始轮次和赛程
  BattleState.currentRound = 1;
  BattleState.currentBracket = "winner";
  BattleState.currentMatchIndex = 0;
  BattleState.matches = [];

  // 保存状态
  saveGameState();
}

// 初始化双败赛制赛程表
function initializeTournamentBracket() {
  const players = BattleState.players;

  // 确保有4名选手
  if (players.length !== 4) {
    console.error(`选手数量不正确: ${players.length}，需要4名选手`);
    showToast("选手数量不正确，无法创建赛程", "error");
    return;
  }

  // 胜者组第一轮（2场比赛）
  BattleState.bracket.winner = [
    {
      round: 1,
      matches: [
        {
          player1: players[0].name,
          player2: players[1].name,
          winner: null,
          loser: null,
        },
        {
          player1: players[2].name,
          player2: players[3].name,
          winner: null,
          loser: null,
        },
      ],
    },
    // 胜者组第二轮（1场比赛）
    {
      round: 2,
      matches: [{ player1: "TBD", player2: "TBD", winner: null, loser: null }],
    },
  ];

  // 败者组（2场比赛）
  BattleState.bracket.loser = [
    {
      round: 1,
      matches: [{ player1: "TBD", player2: "TBD", winner: null, loser: null }],
    },
    {
      round: 2,
      matches: [{ player1: "TBD", player2: "TBD", winner: null, loser: null }],
    },
  ];

  // 决赛（只有1轮）
  BattleState.bracket.final = [
    {
      round: 1,
      matches: [
        {
          player1: "TBD",
          player2: "TBD",
          winner: null,
          loser: null,
          isFinal: true,
        },
      ],
    },
  ];
}

/** 存档载荷（原 saveGameState 的 state 字面量，字段与顺序逐字保留） */
function getPersisted() {
  return {
    currentRound: BattleState.currentRound,
    currentBracket: BattleState.currentBracket,
    currentMatchIndex: BattleState.currentMatchIndex,
    currentWinner: BattleState.currentWinner,
    players: BattleState.players,
    playerStats: BattleState.playerStats,
    matches: BattleState.matches,
    bracket: BattleState.bracket,
    chapter: 2, // 明确指定章节
    lastUpdate: new Date().toISOString(),
  };
}

// 保存游戏状态（双写：localStorage + POST；键与端点逐字保留，失败提示同迁移前）
function saveGameState() {
  if (!persist) return;
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
  } else {
    console.warn("[battle-group1-2] 存档读写失败:", phase, error);
  }
}

// 保存第二章节获胜者
function saveChapter2Winner(winnerName) {
  // 保存到localStorage，包括前三名
  localStorage.setItem(
    "chapter2Winner",
    JSON.stringify({
      winner: winnerName,
      runnerUp: BattleState.runnerUp || null,
      thirdPlace: BattleState.thirdPlace || null,
    })
  );

  // 保存到服务器
  const winnerData = {
    chapter2: {
      winner: winnerName,
      runnerUp: BattleState.runnerUp || null,
      thirdPlace: BattleState.thirdPlace || null,
    },
  };

  fetch("/api/winners", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(winnerData),
  })
    .then((response) => {
      if (!response.ok) throw new Error("保存获胜者失败");
      console.log("成功保存第二章节获胜者数据");
    })
    .catch((error) => {
      console.error("保存获胜者数据失败:", error);
      showToast("保存获胜者数据失败，但已保存到本地", "warning");
    });
}

/**
 * 一年加组对战系统 - 第二章节（UI模块）
 * 包含UI和显示相关函数
 */

// 更新选手战绩显示
function updatePlayerStatsDisplay() {
  // 获取选手名称
  const player1Name = DOM.player1Name.innerText;
  const player2Name = DOM.player2Name.innerText;

  // 获取或初始化选手战绩
  const player1Stats = BattleState.playerStats[player1Name] || {
    wins: 0,
    losses: 0,
  };
  const player2Stats = BattleState.playerStats[player2Name] || {
    wins: 0,
    losses: 0,
  };

  // 更新显示
  DOM.player1Wins.innerText = player1Stats.wins;
  DOM.player1Losses.innerText = player1Stats.losses;
  DOM.player2Wins.innerText = player2Stats.wins;
  DOM.player2Losses.innerText = player2Stats.losses;
}

// 更新轮次和赛程状态显示
function updateRoundDisplay() {
  // 更新轮次显示 - 双败赛制正确为5轮（有可能会有6场比赛，但总轮数是5）
  DOM.roundNumber.innerText = `${BattleState.currentRound}/5`;

  // 更新比赛类型状态显示
  let statusText = "";
  let statusClass = "";

  switch (BattleState.currentBracket) {
    case "winner":
      statusText = "胜者组";
      statusClass = "winner-bracket";
      break;
    case "loser":
      statusText = "败者组";
      statusClass = "loser-bracket";
      break;
    case "final":
      statusText = BattleState.currentRound === 2 ? "冠军决定战" : "决赛";
      statusClass = "final";
      break;
  }

  DOM.tournamentStatus.innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
}

// 更新赛程图显示
function updateBracketDisplay() {
  if (!DOM.bracketDisplay) return;

  DOM.bracketDisplay.innerHTML = "";

  // 创建胜者组赛程
  createBracketSection("winner", "胜者组");

  // 创建败者组赛程
  createBracketSection("loser", "败者组");

  // 创建决赛赛程
  createBracketSection("final", "决赛");
}

// 创建赛程图的一个部分 (胜者组/败者组/决赛)
function createBracketSection(bracketType, title) {
  const bracketData = BattleState.bracket[bracketType];
  if (!bracketData || bracketData.length === 0) return;

  // 创建包含整个部分的容器
  const sectionContainer = document.createElement("div");
  sectionContainer.className = `bracket-section ${bracketType}-section`;

  // 创建组标题
  const sectionTitle = document.createElement("div");
  sectionTitle.className = `bracket-section-title ${bracketType}-title`;
  sectionTitle.innerText = title;
  sectionContainer.appendChild(sectionTitle);

  // 创建轮次容器
  bracketData.forEach((roundData, roundIndex) => {
    const roundDiv = document.createElement("div");
    roundDiv.className = "bracket-round";

    // 创建轮次标题
    const roundTitle = document.createElement("div");
    roundTitle.className = "bracket-round-title";
    roundTitle.innerText = `第${roundData.round}轮`;
    roundDiv.appendChild(roundTitle);

    // 创建比赛卡片
    roundData.matches.forEach((match, matchIndex) => {
      const matchCard = createMatchCard(
        match,
        bracketType,
        roundData.round,
        matchIndex
      );
      roundDiv.appendChild(matchCard);
    });

    sectionContainer.appendChild(roundDiv);
  });

  DOM.bracketDisplay.appendChild(sectionContainer);
}

/**
 * 对阵卡选手状态图标（原 CSS 伪元素 emoji 的 DOM 化替代）：
 *   .winner → 奖杯（旧 .winner::before）+ 对勾（旧 .bracket-player.winner::after）
 *   .loser  → 叉号（旧 .bracket-player.loser::after）
 * 依据已判定的 winner/loser 类注入，不改判定逻辑；图标 aria-hidden（装饰性，
 * 胜负语义已由类名样式与文字承载）。
 */
function appendBracketMarks(el) {
  if (!el) return;
  const marks = el.classList.contains("winner")
    ? [["trophy", 24, "winner-badge"], ["check", 16, "bracket-mark"]]
    : el.classList.contains("loser")
      ? [["x", 16, "bracket-mark"]]
      : [];
  for (const [name, size, cls] of marks) {
    const svg = iconEl(name, { size, class: cls });
    if (svg) el.appendChild(svg);
  }
}

// 创建单场比赛卡片
function createMatchCard(match, bracketType, round, matchIndex) {
  const card = document.createElement("div");
  card.className = "bracket-match";

  // 添加特定的比赛顺序标识类
  card.classList.add(`${bracketType}-r${round}-m${matchIndex}`);

  // 如果是当前比赛，添加样式
  if (
    BattleState.currentBracket === bracketType &&
    BattleState.currentRound === round + 1 &&
    BattleState.currentMatchIndex === matchIndex
  ) {
    card.classList.add("current");

    // 根据赛区添加不同样式
    if (bracketType === "loser") {
      card.classList.add("loser-bracket");
    } else if (bracketType === "final") {
      card.classList.add("final");
    }
  }

  // 创建选手1元素
  const player1 = document.createElement("div");
  player1.className = "bracket-player";
  if (match.player1 === match.winner) {
    player1.classList.add("winner");
  } else if (match.winner && match.player1 !== match.winner) {
    player1.classList.add("loser");
  }
  player1.innerText = match.player1 === "TBD" ? "待定" : match.player1;
  appendBracketMarks(player1);
  card.appendChild(player1);

  // 创建选手2元素
  const player2 = document.createElement("div");
  player2.className = "bracket-player";
  if (match.player2 === match.winner) {
    player2.classList.add("winner");
  } else if (match.winner && match.player2 !== match.winner) {
    player2.classList.add("loser");
  }
  player2.innerText = match.player2 === "TBD" ? "待定" : match.player2;
  appendBracketMarks(player2);
  card.appendChild(player2);

  // 如果是决赛，添加特殊标记
  if (match.isFinal) {
    const badge = document.createElement("div");
    badge.className = "final-badge";
    badge.innerText = "冠军赛";
    card.appendChild(badge);
  }

  return card;
}

// 显示获胜提示
function showWinnerAnnouncement(winnerName) {
  const announcement = document.createElement("div");
  announcement.classList.add("winner-announcement");
  announcement.innerText = `${winnerName} 获胜!`;
  document.body.appendChild(announcement);

  // 自动移除
  later(() => {
    if (document.body.contains(announcement)) {
      document.body.removeChild(announcement);
    }
  }, 3000);
}

// 显示最终获胜者提示
function showFinalWinnerAnnouncement(winnerName) {
  const announcement = document.createElement("div");
  announcement.classList.add("winner-announcement");
  announcement.style.backgroundColor = "rgba(30, 30, 30, 0.95)";
  announcement.style.border = "4px solid #ffd700";
  announcement.style.padding = "30px 50px";
  announcement.style.fontSize = "36px";
  announcement.innerHTML = `${icon("trophy", { size: 36 })} 恭喜 <strong>${winnerName}</strong> 成为第二章节冠军! ${icon("trophy", { size: 36 })}<br><small>5秒后自动跳转到排名页面</small>`;
  document.body.appendChild(announcement);

  // 5秒后跳转到排名页面
  later(() => {
    window.location.href = "/m/rank";
  }, 5000);
}

// 显示提示信息
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `${type}-toast`;
  toast.innerText = message;
  document.body.appendChild(toast);

  // 自动移除
  later(() => {
    if (document.body.contains(toast)) {
      document.body.removeChild(toast);
    }
  }, 3000);
}

/**
 * 一年加组对战系统 - 第二章节（比赛模块）
 * 包含比赛流程和赛程管理
 */

// 获取当前比赛
function getCurrentMatch() {
  // 检查是否有比赛数据
  if (!BattleState.bracket) return null;

  const bracketType = BattleState.currentBracket;
  const roundIndex = BattleState.currentRound - 1;
  const matchIndex = BattleState.currentMatchIndex;

  // 检查数组边界
  if (
    !BattleState.bracket[bracketType] ||
    !BattleState.bracket[bracketType][roundIndex] ||
    !BattleState.bracket[bracketType][roundIndex].matches ||
    !BattleState.bracket[bracketType][roundIndex].matches[matchIndex]
  ) {
    return null;
  }

  return BattleState.bracket[bracketType][roundIndex].matches[matchIndex];
}

// 更新选手战绩
function updatePlayerStats(winnerName, loserName) {
  // 确保选手统计对象存在
  if (!BattleState.playerStats[winnerName]) {
    BattleState.playerStats[winnerName] = { wins: 0, losses: 0 };
  }
  if (!BattleState.playerStats[loserName]) {
    BattleState.playerStats[loserName] = { wins: 0, losses: 0 };
  }

  // 更新胜败次数
  BattleState.playerStats[winnerName].wins += 1;
  BattleState.playerStats[loserName].losses += 1;

  // 更新显示
  updatePlayerStatsDisplay();
}

// 更新赛程进展
function updateTournamentProgress() {
  // 获取当前比赛信息
  const currentMatch = getCurrentMatch();
  if (!currentMatch || !currentMatch.winner) return;

  // 根据当前赛程阶段，确定下一场比赛
  if (
    BattleState.currentBracket === "winner" &&
    BattleState.currentRound === 1
  ) {
    // 胜者组第一轮，将胜者晋级到胜者组第二轮，败者进入败者组
    if (BattleState.currentMatchIndex === 0) {
      // 第一场比赛(比赛一)，胜者为胜者组第二轮选手1，败者进入败者组第一轮
      BattleState.bracket.winner[1].matches[0].player1 = currentMatch.winner;
      BattleState.bracket.loser[0].matches[0].player1 = currentMatch.loser;

      // 移至胜者组第一轮第二场(比赛二)
      BattleState.currentMatchIndex = 1;
    } else {
      // 第二场比赛(比赛二)，胜者为胜者组第二轮选手2，败者进入败者组
      BattleState.bracket.winner[1].matches[0].player2 = currentMatch.winner;
      BattleState.bracket.loser[0].matches[0].player2 = currentMatch.loser;

      // 移至败者组第一轮(比赛三) - 两组败者的对决
      BattleState.currentBracket = "loser";
      BattleState.currentRound = 1;
      BattleState.currentMatchIndex = 0;
    }
  } else if (
    BattleState.currentBracket === "loser" &&
    BattleState.currentRound === 1
  ) {
    // 败者组第一轮结束(比赛三)，胜者进入败者组第二轮
    BattleState.bracket.loser[1].matches[0].player1 = currentMatch.winner;

    // 记录比赛三的败者为第四名
    BattleState.fourthPlace = currentMatch.loser;

    // 移至胜者组第二轮(比赛四) - 两组胜者的对决
    BattleState.currentBracket = "winner";
    BattleState.currentRound = 2;
    BattleState.currentMatchIndex = 0;
  } else if (
    BattleState.currentBracket === "winner" &&
    BattleState.currentRound === 2
  ) {
    // 胜者组第二轮结束(比赛四)，胜者直接进入决赛，败者进入败者组第二轮
    BattleState.bracket.final[0].matches[0].player1 = currentMatch.winner;
    BattleState.bracket.loser[1].matches[0].player2 = currentMatch.loser;

    // 移至败者组第二轮(比赛五) - 比赛三的胜者与比赛四的败者对决
    BattleState.currentBracket = "loser";
    BattleState.currentRound = 2;
    BattleState.currentMatchIndex = 0;
  } else if (
    BattleState.currentBracket === "loser" &&
    BattleState.currentRound === 2
  ) {
    // 败者组第二轮结束(比赛五)，胜者进入决赛，败者为季军
    BattleState.bracket.final[0].matches[0].player2 = currentMatch.winner;

    // 记录比赛五的败者为季军
    BattleState.thirdPlace = currentMatch.loser;

    // 移至决赛(比赛六) - 比赛四的胜者与比赛五的胜者对决
    BattleState.currentBracket = "final";
    BattleState.currentRound = 1;
    BattleState.currentMatchIndex = 0;
  } else if (
    BattleState.currentBracket === "final" &&
    BattleState.currentRound === 1
  ) {
    // 双败赛制 bracket-reset：胜者组晋级选手（决赛 player1，进入决赛时 0 败）输掉
    // 决赛第一轮仅一败，须打冠军决定战（决赛第二轮）而非直接定亚军
    if (currentMatch.loser === currentMatch.player1) {
      // 决赛第二轮 = 决赛第一轮的同样两位选手再战一场（轮次对象结构对齐 final[0]）
      BattleState.bracket.final[1] = {
        round: 2,
        matches: [
          {
            player1: currentMatch.player1,
            player2: currentMatch.player2,
            winner: null,
            loser: null,
            isFinal: true,
          },
        ],
      };

      // 移至冠军决定战（不置 tournamentCompleted、不定排名；对局显示与存档由调用方
      // handleNextMatch 在本函数返回后统一刷新，与其它推进分支一致）
      BattleState.currentRound = 2;
      BattleState.currentMatchIndex = 0;
    } else {
      // 败者组选手输掉决赛第一轮（两败淘汰），决赛结束，记录冠军和亚军
      BattleState.champion = currentMatch.winner;
      BattleState.runnerUp = currentMatch.loser;

      // 比赛完全结束
      BattleState.tournamentCompleted = true;
    }
  } else if (
    BattleState.currentBracket === "final" &&
    BattleState.currentRound === 2
  ) {
    // 冠军决定战结束（决赛第二轮），胜者为冠军、败者为亚军，比赛完全结束
    BattleState.champion = currentMatch.winner;
    BattleState.runnerUp = currentMatch.loser;
    BattleState.tournamentCompleted = true;
  }
}

// 确定赛事最终获胜者
function determineTournamentWinner() {
  if (BattleState.tournamentCompleted) {
    // 如果比赛在决赛第一轮结束，且胜者组选手获胜
    if (
      BattleState.currentBracket === "final" &&
      BattleState.currentRound === 1
    ) {
      const finalMatch = BattleState.bracket.final[0].matches[0];
      return finalMatch.winner;
    }
    // 如果比赛在决赛第二轮结束 - 直接返回第二轮的获胜者
    else if (
      BattleState.currentBracket === "final" &&
      BattleState.currentRound === 2 &&
      BattleState.bracket.final[1] &&
      BattleState.bracket.final[1].matches[0]
    ) {
      return BattleState.bracket.final[1].matches[0].winner;
    }
  }
  return null;
}

// 更新对战信息描述
function updateMatchDescription() {
  const currentMatch = getCurrentMatch();
  if (!currentMatch) return;

  const bracketNames = {
    winner: "胜者组",
    loser: "败者组",
    final: "决赛",
  };

  const matchNames = {
    1: "比赛一",
    2: "比赛二",
    3: "比赛三",
    4: "比赛四",
    5: "比赛五",
    6: "决赛",
  };

  let description = "";
  const matchNumber = currentMatch.matchNumber || getMatchNumberFromState();

  if (matchNumber) {
    description = matchNames[matchNumber] || "";
  } else {
    description = `${bracketNames[BattleState.currentBracket] || ""} 第${
      BattleState.currentRound
    }轮`;
  }

  if (DOM.tournamentStatus) {
    // 先清空
    DOM.tournamentStatus.innerHTML = "";

    // 添加赛程说明
    const badge = document.createElement("span");
    badge.className = "status-badge";
    if (BattleState.currentBracket === "loser") {
      badge.classList.add("loser-bracket");
    } else if (BattleState.currentBracket === "final") {
      badge.classList.add("final");
    }
    badge.textContent = description;
    DOM.tournamentStatus.appendChild(badge);

    // 如果有必要，添加额外说明
    if (matchNumber === 3) {
      const hint = document.createElement("div");
      hint.className = "match-hint";
      hint.textContent = "两场比赛的败者对决";
      DOM.tournamentStatus.appendChild(hint);
    } else if (matchNumber === 4) {
      const hint = document.createElement("div");
      hint.className = "match-hint";
      hint.textContent = "两场比赛的胜者对决";
      DOM.tournamentStatus.appendChild(hint);
    } else if (matchNumber === 5) {
      const hint = document.createElement("div");
      hint.className = "match-hint";
      hint.textContent = "比赛四的败者与比赛三的胜者对决";
      DOM.tournamentStatus.appendChild(hint);
    } else if (matchNumber === 6) {
      const hint = document.createElement("div");
      hint.className = "match-hint";
      hint.textContent = "比赛四的胜者与比赛五的胜者对决";
      DOM.tournamentStatus.appendChild(hint);
    }
  }
}

// 根据当前状态推断比赛编号
function getMatchNumberFromState() {
  if (
    BattleState.currentBracket === "winner" &&
    BattleState.currentRound === 1
  ) {
    return BattleState.currentMatchIndex === 0 ? 1 : 2;
  } else if (
    BattleState.currentBracket === "loser" &&
    BattleState.currentRound === 1
  ) {
    return 3;
  } else if (
    BattleState.currentBracket === "winner" &&
    BattleState.currentRound === 2
  ) {
    return 4;
  } else if (
    BattleState.currentBracket === "loser" &&
    BattleState.currentRound === 2
  ) {
    return 5;
  } else if (BattleState.currentBracket === "final") {
    return 6;
  }
  return null;
}

// 显示当前比赛
function displayCurrentMatch() {
  const currentMatch = getCurrentMatch();
  if (!currentMatch) {
    console.log("没有找到当前比赛");
    return;
  }

  console.log("显示当前比赛:", currentMatch);

  // 更新选手名称显示
  if (DOM.player1Name && DOM.player2Name) {
    DOM.player1Name.innerText =
      currentMatch.player1 === "TBD" ? "待定" : currentMatch.player1;
    DOM.player2Name.innerText =
      currentMatch.player2 === "TBD" ? "待定" : currentMatch.player2;
  }

  // 如果已有结果，显示胜负
  if (currentMatch.winner) {
    if (DOM.player1 && DOM.player2) {
      DOM.player1.classList.remove("winner", "loser");
      DOM.player2.classList.remove("winner", "loser");

      if (currentMatch.winner === currentMatch.player1) {
        DOM.player1.classList.add("winner");
        DOM.player2.classList.add("loser");
      } else {
        DOM.player1.classList.add("loser");
        DOM.player2.classList.add("winner");
      }
    }
  }

  // 更新比赛描述
  updateMatchDescription();

  // 更新选手战绩显示
  updatePlayerStatsDisplay();
}

/**
 * 一年加组对战系统 - 第二章节（事件模块）
 * 包含事件监听和处理函数
 */

// 设置事件监听器
function setupEventListeners(signal) {
  // 随机匹配按钮
  if (DOM.randomMatchBtn) {
    DOM.randomMatchBtn.addEventListener("click", randomizeMatches, { signal });
  }

  // 抽取音乐 / 播放音乐 两个按钮由组件绑定（draw-machine 的 trigger / music-player 的
  // startTrigger），页面侧不再重复绑定，避免单击双跑

  // 下一场按钮
  if (DOM.nextMatchBtn) {
    DOM.nextMatchBtn.addEventListener("click", handleNextMatch, { signal });
  }

  // 重置游戏按钮（只清本地存档 + 重建赛程，不碰服务端；与迁移前一致）
  if (DOM.resetGameBtn) {
    DOM.resetGameBtn.addEventListener("click", resetGame, { signal });
  }

  // 清除缓存按钮（清两端存档 + 重载选手数据 + 刷新页面）
  if (DOM.clearCacheBtn) {
    DOM.clearCacheBtn.addEventListener("click", clearCacheAndResetGame, { signal });
  }

  // 回到主页面按钮（插件化迁移补配：此前 index.html 有按钮但从未绑定，点击无响应）
  const homeBtn = document.getElementById("home-btn");
  if (homeBtn) {
    homeBtn.addEventListener("click", () => {
      window.location.href = "/m/home";
    }, { signal });
  }

  // 添加自动保存功能
  setupAutoSave();
}

// 随机匹配选手处理函数
function randomizeMatches() {
  console.log("执行随机匹配");

  if (!BattleState.playersLoaded || BattleState.players.length < 4) {
    showToast("选手数据不足，无法随机匹配", "warning");
    return;
  }

  // 比赛开始前判定：除轮次/索引外，当前场次已定胜负（winner 已写入、战绩已计）时
  // 不得重建赛程——重建会静默抹掉赛果，再定胜者会把战绩双计。守卫须在改写
  // BattleState.players 之前：拒绝时不留任何状态变更
  const currentMatch = getCurrentMatch();
  if (
    !(
      BattleState.currentRound === 1 &&
      BattleState.currentBracket === "winner" &&
      BattleState.currentMatchIndex === 0
    ) ||
    currentMatch?.winner
  ) {
    showToast(
      currentMatch?.winner
        ? "当前场次已定胜负，无法重新随机匹配"
        : "只能在比赛开始前随机匹配选手",
      "warning"
    );
    return;
  }

  // 获取当前的四名选手
  const currentPlayers = BattleState.players.slice(0, 4);

  // ★ 有意变更：原 `[...currentPlayers].sort(() => Math.random() - 0.5)` 是有偏洗牌，
  //   改为 /web/lib/random.mjs 的 Fisher–Yates 等概率抽取（用户拍板统一修正）。
  const shuffledPlayers = pickN(currentPlayers, 4);

  // 更新玩家数组
  for (let i = 0; i < 4 && i < shuffledPlayers.length; i++) {
    BattleState.players[i] = shuffledPlayers[i];
  }

  // 走到这里必然是胜者组第一轮第一场且未定胜负，重新初始化比赛安排
  initializeTournamentBracket();

  // 刷新比赛显示
  displayCurrentMatch();
  updateBracketDisplay();

  showToast("选手已随机匹配", "success");
}

// 处理下一场比赛
function handleNextMatch() {
  console.log("执行下一场比赛");

  // 检查当前比赛是否已完成
  const currentMatch = getCurrentMatch();
  if (!currentMatch || !currentMatch.winner) {
    showToast("请先通过点击选手确定本场比赛的获胜者", "warning");
    return;
  }

  // 更新赛程
  updateTournamentProgress();

  // 检查比赛是否已全部完成
  if (BattleState.tournamentCompleted) {
    // 比赛已全部完成
    const winner = determineTournamentWinner();
    if (winner) {
      showToast(`双败赛制比赛已全部完成，最终获胜者是 ${winner}！`, "success");

      // 保存最终获胜者
      saveChapter2Winner(winner);

      // 显示最终获胜提示
      showFinalWinnerAnnouncement(winner);
    } else {
      showToast("比赛已完成，但无法确定获胜者", "error");
    }
    return;
  }

  // 检查是否进入决赛第二轮
  if (
    BattleState.currentBracket === "final" &&
    BattleState.currentRound === 2
  ) {
    showToast("进入冠军决定战！胜者组选手需再输一场才会被淘汰", "info");
  }

  // 获取新的当前比赛
  const nextMatch = getCurrentMatch();
  if (!nextMatch) {
    showToast("没有下一场比赛了", "warning");
    return;
  }

  // 重置选手区域
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");
  BattleState.currentWinner = null;

  // 显示新的比赛（displayCurrentMatch 必须最后调用：#tournament-status 有两个写入者，
  // updateRoundDisplay 的笼统轮次徽标不得覆盖 updateMatchDescription 的比赛说明文案）
  updateBracketDisplay();
  updateRoundDisplay();
  displayCurrentMatch();

  // 保存状态
  saveGameState();
}

// 重置游戏（只清本地存档并重建赛程；服务端存档与页面均不动，与迁移前一致）
function resetGame() {
  // 代数守卫：使在途存档恢复失效（重置结果不被恢复回包覆盖）
  restoreGeneration++;

  // 清除本地存档（key "battleGroup1-2State" 逐字保留；随后 saveGameState 会写回新状态）
  localStorage.removeItem("battleGroup1-2State");

  // 清上一局残留的当前胜者标记（须在 initializeNewGame 之前：其内部的
  // saveGameState 会把 currentWinner 一并落盘）
  BattleState.currentWinner = null;

  // 初始化新游戏
  initializeNewGame();

  // 重置选手区域（旧值先清空兜底；正常路径由随后的 displayCurrentMatch 重写当前场次
  // 选手名——对齐 bg1 的 resetGame 重置后立即重显选手，否则选手卡空白、
  // setWinner 会把空名写进赛果与战绩）
  DOM.player1Name.innerText = "";
  DOM.player2Name.innerText = "";
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");
  updatePlayerStatsDisplay();

  // 更新UI（displayCurrentMatch 最后调用：比赛说明须晚于 updateRoundDisplay 写入，
  // 否则轮次徽标会覆盖说明文案，同 handleNextMatch）
  updateBracketDisplay();
  updateRoundDisplay();
  displayCurrentMatch();

  // 重置音乐（音乐展示/播放状态归 music-player 组件）
  if (apis.music) apis.music.clearItem();
  if (DOM.musicName) DOM.musicName.innerText = "音乐名称";

  showToast("游戏已重置", "success");
}

// 新增合并功能：清除缓存并重置游戏
function clearCacheAndResetGame() {
  try {
    // 清除本地存储（battleGroup1-2State 由 persist.reset 清）
    localStorage.removeItem("chapter1Winners");
    localStorage.removeItem("chapter2Winner");

    // 显示处理中提示
    showToast("正在重置比赛并清除缓存...", "info");

    // persist.reset：清 localStorage + POST /api/clear-battle-group1-2-process（端点逐字保留）
    persist.reset().then(({ remote }) => {
      if (!remote) {
        console.error("清除服务器缓存失败");
        showToast("清除服务器缓存失败", "error");
        return;
      }

      // 重新加载选手数据（容错链：localStorage → winners.json → 默认数据）
      loadPlayers().then(() => {
        // 初始化新游戏
        initializeNewGame();

        // 更新UI
        updateBracketDisplay();
        updateRoundDisplay();

        // 重置选手区域
        DOM.player1Name.innerText = "";
        DOM.player2Name.innerText = "";
        DOM.player1.classList.remove("winner", "loser");
        DOM.player2.classList.remove("winner", "loser");
        updatePlayerStatsDisplay();

        // 重置音乐（音乐展示/播放状态归 music-player 组件）
        if (apis.music) apis.music.clearItem();
        if (DOM.musicName) DOM.musicName.innerText = "音乐名称";

        showToast("比赛已完全重置，使用最新数据", "success");

        // 刷新页面以确保所有状态都是最新的
        later(() => location.reload(), 1500);
      });
    });
  } catch (error) {
    console.error("重置失败:", error);
    showToast("重置失败: " + error.message, "error");
  }
}

// 设置获胜者（原 HTML 内联 onclick 调用，P4 改为组件入口 signal 绑定）
function setWinner(playerId) {
  // 检查当前比赛是否存在
  const currentMatch = getCurrentMatch();
  if (!currentMatch) {
    showToast("没有正在进行的比赛", "error");
    return;
  }

  // 如果比赛已有获胜者，提示已完成
  if (currentMatch.winner) {
    showToast("当前比赛已经有获胜者，请进入下一场比赛", "warning");
    return;
  }

  // 移除先前样式
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");

  // 获取选手名称
  const player1Name = DOM.player1Name.innerText;
  const player2Name = DOM.player2Name.innerText;

  // 设置获胜者
  const winnerElement = document.getElementById(playerId);
  const loserElement = document.getElementById(
    playerId === "player1" ? "player2" : "player1"
  );

  // 获取胜者和败者名称
  const winnerName = playerId === "player1" ? player1Name : player2Name;
  const loserName = playerId === "player1" ? player2Name : player1Name;

  // 空名守卫：选手卡尚未显示有效名字（空串/纯空白）时不得记录——
  // 否则空名会写进 currentMatch.winner 与 playerStats
  if (!winnerName || !winnerName.trim() || !loserName || !loserName.trim()) {
    showToast("选手名称无效，无法记录比赛结果", "error");
    return;
  }

  // 保存结果到当前比赛
  currentMatch.winner = winnerName;
  currentMatch.loser = loserName;

  // 更新选手战绩
  updatePlayerStats(winnerName, loserName);

  // 添加样式
  winnerElement.classList.add("winner");
  loserElement.classList.add("loser");

  // 记录当前获胜者
  BattleState.currentWinner = winnerName;

  // 显示提示
  showWinnerAnnouncement(winnerName);

  // 保存游戏状态
  saveGameState();

  // 更新赛程图
  updateBracketDisplay();
}

// 添加自动保存定时器
function setupAutoSave() {
  // 每60秒自动保存一次
  autoSaveTimer = setInterval(saveGameState, 60000);
}

/* =================================================================
 *  组件装配（P11-B3）：页面侧只声明"运行时 props"，
 *  静态 props（时序/颜色/文案）在 web/front.json 的 battle-group1-2 config.components
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
      trigger: null, // 显式钉空：抽取归 draw-machine，组件不自建默认按钮
      startTrigger: "#play-music-btn",
      onReady: (api) => {
        bridge.music = api;
      },
      // 未抽到音乐即点播放（迁移前提示文案逐字保留）
      onEmpty: () => showToast("请先抽取音乐", "warning"),
      // 比赛模式抖动：组件在"进入模式、遮罩显示、逐字动画开始前"回调 ——
      // 迁移前抖动发生在进入模式瞬间（body）与逐字动画走完时（文字），而非真正开播的 4500ms
      onOverlayShown: shakeBattleOverlay,
      onExited: () => {
        document.body.classList.remove("shake");
      },
      onError: () => showToast("音乐播放失败，请重试", "error"),
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
 *  组件入口（原 b-g1-2-core.js DOMContentLoaded 初始化，kernel render 时执行）
 * ================================================================= */
export function battleGroup12Component(el, meta, ctx, bridge) {
  // cleanup 契约：静态骨架节点的全部监听经 signal 登记，重渲染时 abort 统一解绑，
  // 防止不刷新页面的重复 render 造成双绑双触发
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

  // 组件实例 API（front/plugin.js 的 onReady 回填；组件缺失时保持 null）
  apis = bridge || { music: null, draw: null };

  // 代数采样：此后任何 resetGame 都会使在途存档恢复失效（见 initializeGameState）
  loadGeneration = restoreGeneration;

  // 存档控制器（键/端点逐字保留；远端失败经 onError 上报，与迁移前文案一致）
  persist = createPersistence({
    key: "battleGroup1-2State",
    endpoint: "/api/battle-group1-2-process",
    clearEndpoint: "/api/clear-battle-group1-2-process",
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

  // 选手卡点击（原 HTML 内联 onclick="setWinner(...)"）
  DOM.player1.addEventListener("click", () => setWinner("player1"), { signal });
  DOM.player2.addEventListener("click", () => setWinner("player2"), { signal });

  // 绑定事件监听器
  setupEventListeners(signal);

  // 加载数据
  initializeData();

  return () => cleanupBattleGroup12Page(bindAbort);
}

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用；组件实例的 cleanup 由 front/plugin.js 收集后调用）
 * ================================================================= */
function cleanupBattleGroup12Page(bindAbort) {
  // signal 登记的静态骨架监听（按钮/选手卡）统一解绑
  if (bindAbort) bindAbort.abort();

  // 自动保存定时器
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }

  // 初始化收尾的选手名补写定时器
  if (playerNameRetryTimer) {
    clearTimeout(playerNameRetryTimer);
    playerNameRetryTimer = null;
  }

  // 一次性收尾定时器（播报/toast 自动移除、清缓存后的 reload、抖动移除）：清空在飞任务，
  // 否则 teardown 后回调仍在飞、播报/toast 节点会永久留在 body
  timers.dispose();

  // 比赛模式抖动类兜底移除（body + 遮罩文字）
  clearBattleShake();

  for (const node of document.querySelectorAll(
    ".winner-announcement, .info-toast, .success-toast, .warning-toast, .error-toast"
  )) {
    node.remove();
  }

  // 音乐播放/比赛模式的清理（body 类、document 级监听、#music-player 的 onended/暂停）
  // 由 music-player 组件的 cleanup 负责（front/plugin.js 收集后逐个调用），页面侧不再重复。
}
