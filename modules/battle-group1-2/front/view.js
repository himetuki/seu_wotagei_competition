/**
 * 一年加组对战第二章节（battle-group1-2）— 前端组件（P4 插件化迁移）
 *
 * 由原多脚本按加载顺序并入同一模块闭包（core → data → ui → match → events），
 * 函数体逐行保留；全局函数/变量 → 模块闭包作用域。原 b-g1-2-core.js 的
 * DOMContentLoaded 初始化改为组件体内直接执行（kernel render 时调用）。
 * 原 ui/match 两文件重复定义的 displayCurrentMatch，按脚本加载语义后声明者
 * （match.js）生效；ui.js 的早声明副本在经典脚本中本就被覆盖（死代码），
 * 模块严格模式不允许重复声明，故删除之（行为不变）。
 *
 * 迁移差异（行为零回归前提下）：
 *   1. 原 b-g1-2-events.js 的 window.setWinner（供 HTML 内联 onclick 调用）改为
 *      模块内函数 setWinner，选手卡点击在组件入口以 addEventListener+signal 绑定；
 *   2. 静态骨架监听一律 { signal }（AbortController）登记，cleanup 统一解绑；
 *   3. 原 setupAutoSave 的 setInterval 句柄补记入 autoSaveTimer，cleanup 清理；
 *   4. 跨模块跳转按 P3 约定改 /m/<id>（原 "rank.html" 为平铺 HTML 时代路径，
 *      模块化后 404）。
 *
 * 持久化继续用原生 fetch（/api/battle-group1-2-process 等端点）与原 localStorage
 * key，保持行为零回归；ctx 仅为后续可选用途保留（组件第三参）。
 */

import { icon, iconEl } from "/web/icons.mjs";

/* 自动保存定时器句柄（原代码未记录，cleanup 需要清理） */
let autoSaveTimer = null;
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

  // 音乐播放状态
  isMusicPlaying: false,
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

  // 功能按钮 (移除开始比赛按钮引用)
  DOM.drawMusicBtn = document.getElementById("draw-music-btn");
  DOM.playMusicBtn = document.getElementById("play-music-btn");
  DOM.nextMatchBtn = document.getElementById("next-match-btn");
  DOM.resetGameBtn = document.getElementById("reset-game-btn");
  DOM.clearCacheBtn = document.getElementById("clear-cache-btn");
  DOM.randomMatchBtn = document.getElementById("random-match-btn");

  // 音乐播放器
  DOM.musicName = document.getElementById("music-name");
  DOM.musicPlayer = document.getElementById("music-player");
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
 */

// 加载选手数据（从winners.json）
function loadPlayers() {
  console.log("加载选手数据...");

  // 添加调试信息，查看localStorage是否有chapter1Winners
  const localStorageData = localStorage.getItem("chapter1Winners");
  console.log("localStorage中的chapter1Winners数据:", localStorageData);

  // 尝试从localStorage获取上一章的获胜者数据
  if (localStorageData) {
    try {
      const winnersData = JSON.parse(localStorageData);
      console.log("解析后的winners数据:", winnersData);

      if (
        winnersData &&
        Array.isArray(winnersData.winners) &&
        winnersData.winners.length > 0
      ) {
        // 使用上一章节的获胜者数据
        const players = winnersData.winners.map((name) => ({
          name,
          wins: 0,
          losses: 0,
        }));
        BattleState.players = players;
        BattleState.playersLoaded = true;

        console.log("成功从localStorage加载第一章节获胜者作为选手:", players);
        return Promise.resolve();
      }
    } catch (e) {
      console.error("解析localStorage中的chapter1Winners数据出错:", e);
    }
  }

  // 如果从localStorage加载失败，尝试从winners.json加载
  console.log("从localStorage加载失败，尝试从winners.json加载选手数据...");
  return fetch("/resource/json/winners.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error("获取winners.json失败");
      }
      return response.json();
    })
    .then((data) => {
      console.log("从winners.json获取的原始数据:", data);

      // 从winners.json中提取第一章节的获胜者
      if (!data || !data.chapter1) {
        console.error("winners.json数据格式不正确，缺少chapter1字段:", data);
        throw new Error("获胜者数据格式不正确");
      }

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

      console.log("提取出的获胜者列表:", winners);

      if (winners.length < 4) {
        console.warn(
          `获胜者数据不足，只找到${winners.length}名获胜者，需要4名`
        );

        // 添加默认选手补齐
        while (winners.length < 4) {
          winners.push(`默认选手${winners.length + 1}`);
        }
        console.log("添加默认选手后的列表:", winners);
      }

      // 转换为选手对象数组
      const players = winners.map((name) => ({ name, wins: 0, losses: 0 }));
      BattleState.players = players;
      BattleState.playersLoaded = true;

      // 保存到process.json以确保一致性
      return updateBattleProcessOnServer(players);
    })
    .catch((error) => {
      console.error("加载选手数据失败:", error);
      showToast("加载选手数据失败，将使用默认数据", "error");

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

// 向服务器更新battle-group1-2-process.json中的选手数据
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
        throw new Error("更新battle-group1-2-process.json中的选手数据失败");
      }
      console.log("成功更新battle-group1-2-process.json中的选手数据");
      return response.text();
    })
    .catch((error) => {
      console.error("更新选手数据到服务器失败:", error);
      return Promise.resolve(); // 继续流程
    });
}

// 加载音乐数据（从musics_list_ex.json）
function loadMusic() {
  console.log("加载音乐数据...");

  return fetch("/resource/json/musics_list_ex.json")
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

// 初始化游戏状态
function initializeGameState() {
  console.log("初始化游戏状态...");

  // 先显示加载提示
  showToast("正在加载游戏状态...", "info");

  // 尝试从服务器获取状态
  fetch("/api/battle-group1-2-process")
    .then((response) => response.json())
    .then((data) => {
      if (data && Object.keys(data).length > 0) {
        // 恢复当前状态
        restoreGameState(data);
        console.log("游戏状态已从服务器恢复:", data);
      } else {
        console.log("未找到保存的进度，初始化新游戏");
        // 初始化新游戏
        initializeNewGame();
      }
    })
    .catch((error) => {
      console.error("从服务器恢复状态失败:", error);

      // 从本地存储恢复
      const savedState = localStorage.getItem("battleGroup1-2State");
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          restoreGameState(state);
          console.log("游戏状态已从本地存储恢复:", state);
        } catch (error) {
          console.error("恢复游戏状态失败:", error);
          initializeNewGame();
        }
      } else {
        console.log("本地也没有保存的进度，初始化新游戏");
        initializeNewGame();
      }
    })
    .finally(() => {
      // 显示当前比赛
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

      // 确保选手名称已经正确设置
      setTimeout(() => {
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
    });
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
    showToast("选手数据不足，请检查winners.json", "error");
    return;
  }

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

// 保存游戏状态
function saveGameState() {
  try {
    const state = {
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

    // 保存到本地存储
    localStorage.setItem("battleGroup1-2State", JSON.stringify(state));

    // 保存到服务器
    fetch("/api/battle-group1-2-process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state),
    })
      .then((response) => {
        if (!response.ok) throw new Error("保存进度失败");
        console.log("比赛状态已成功保存到服务器");
      })
      .catch((error) => {
        console.error("服务器保存失败:", error);
      });
  } catch (error) {
    console.error("保存游戏状态失败:", error);
    showToast("自动保存失败", "error");
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
  setTimeout(() => {
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
  setTimeout(() => {
    window.location.href = "/m/rank";
  }, 5000);
}

// 播放比赛开始动画
function playBattleStartAnimation() {
  // 添加遮罩
  const overlay = document.createElement("div");
  overlay.classList.add("battle-overlay");
  document.body.appendChild(overlay);

  // 添加震动效果
  document.body.classList.add("shake");
  setTimeout(() => document.body.classList.remove("shake"), 500);

  // 创建 Battle Start 动画
  const battleStart = document.createElement("div");
  battleStart.classList.add("battle-start");
  battleStart.innerText = "BATTLE START";
  document.body.appendChild(battleStart);

  // 3秒后移除动画元素
  setTimeout(() => {
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
    if (document.body.contains(battleStart)) {
      document.body.removeChild(battleStart);
    }
  }, 3000);
}

// 启动音乐播放模式
function startMusicMode() {
  // 立即添加音乐播放模式类以实现透明效果
  document.body.classList.add("music-playing-mode");
  console.log("进入音乐播放模式");

  // 创建全屏遮罩
  const overlay = document.createElement("div");
  overlay.classList.add("battle-overlay");
  document.body.appendChild(overlay);

  // 创建Battle Start效果并立即添加到DOM
  const battleStart = document.createElement("div");
  battleStart.classList.add("battle-start");
  // 先添加到DOM，再设置内容，确保动画效果显示
  document.body.appendChild(battleStart);

  // 添加震动效果
  setTimeout(() => {
    document.body.classList.add("shake");
    setTimeout(() => {
      document.body.classList.remove("shake");
    }, 500);
  }, 50);

  // 分步骤显示文字 - 元素已在DOM中，只需改变内容
  setTimeout(() => {
    battleStart.innerText = "B";
  }, 200);

  setTimeout(() => {
    battleStart.innerText = "BA";
  }, 300);

  setTimeout(() => {
    battleStart.innerText = "BAT";
  }, 400);

  setTimeout(() => {
    battleStart.innerText = "BATT";
  }, 500);

  setTimeout(() => {
    battleStart.innerText = "BATTL";
  }, 600);

  setTimeout(() => {
    battleStart.innerText = "BATTLE";
  }, 700);

  setTimeout(() => {
    battleStart.innerText = "BATTLE ";
  }, 800);

  setTimeout(() => {
    battleStart.innerText = "BATTLE S";
  }, 900);

  setTimeout(() => {
    battleStart.innerText = "BATTLE ST";
  }, 1000);

  setTimeout(() => {
    battleStart.innerText = "BATTLE STA";
  }, 1100);

  setTimeout(() => {
    battleStart.innerText = "BATTLE STAR";
  }, 1200);

  setTimeout(() => {
    battleStart.innerText = "BATTLE START";
    battleStart.classList.add("shake");
  }, 1300);

  // 在动画结束后移除元素并播放音乐 - 延长到4500毫秒
  setTimeout(() => {
    if (document.body.contains(battleStart)) {
      document.body.removeChild(battleStart);

      // 移除遮罩
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }

      // 添加双击任意位置停止的提示
      const clickToStop = document.createElement("div");
      clickToStop.classList.add("click-to-stop");
      clickToStop.innerText = "双击任意位置停止";
      clickToStop.id = "click-to-stop-hint";
      document.body.appendChild(clickToStop);

      // 播放音乐
      DOM.musicPlayer.currentTime = 0;
      DOM.musicPlayer.play();
      DOM.musicPlayer.style.display = "block";

      // 更新状态
      BattleState.isMusicPlaying = true;

      // 添加事件监听
      DOM.musicPlayer.onended = stopMusicMode;
      document.addEventListener("click", handleDocumentClick);
    }
  }, 4500);
}

// 停止音乐播放模式
function stopMusicMode() {
  // 停止音乐
  DOM.musicPlayer.pause();
  DOM.musicPlayer.currentTime = 0;

  // 移除样式
  document.body.classList.remove("music-playing-mode");

  // 移除事件监听
  document.removeEventListener("click", handleDocumentClick);

  // 移除遮罩和提示
  const overlay = document.querySelector(".battle-overlay");
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }

  const hint = document.getElementById("click-to-stop-hint");
  if (hint && hint.parentNode) {
    hint.parentNode.removeChild(hint);
  }

  // 隐藏播放器
  DOM.musicPlayer.style.display = "none";

  // 更新状态
  BattleState.isMusicPlaying = false;

  console.log("音乐播放模式已停止");
}

// 显示提示信息
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `${type}-toast`;
  toast.innerText = message;
  document.body.appendChild(toast);

  // 自动移除
  setTimeout(() => {
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
    // 决赛结束，记录冠军和亚军
    BattleState.champion = currentMatch.winner;
    BattleState.runnerUp = currentMatch.loser;

    // 比赛完全结束
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

  // 抽取音乐按钮
  if (DOM.drawMusicBtn) {
    DOM.drawMusicBtn.addEventListener("click", handleDrawMusic, { signal });
  }

  // 播放音乐按钮
  if (DOM.playMusicBtn) {
    DOM.playMusicBtn.addEventListener("click", handlePlayMusic, { signal });
  }

  // 下一场按钮
  if (DOM.nextMatchBtn) {
    DOM.nextMatchBtn.addEventListener("click", handleNextMatch, { signal });
  }

  // 重置游戏按钮
  if (DOM.resetGameBtn) {
    DOM.resetGameBtn.addEventListener("click", resetGame, { signal });
  }

  // 清除缓存按钮
  if (DOM.clearCacheBtn) {
    DOM.clearCacheBtn.addEventListener("click", clearCacheAndResetGame, { signal });
  }

  // 添加自动保存功能
  setupAutoSave();
}

// 创建并添加随机匹配按钮
function addRandomMatchButton() {
  if (document.getElementById("random-match-btn")) return; // 避免重复添加

  const actionsContainer = document.querySelector(".actions");
  if (!actionsContainer) return;

  const randomMatchBtn = document.createElement("button");
  randomMatchBtn.id = "random-match-btn";
  randomMatchBtn.innerText = "随机匹配";
  randomMatchBtn.style.borderColor = "#28a745";
  randomMatchBtn.style.boxShadow = "0 0 5px rgba(40, 167, 69, 0.3)";

  // 插入到开始比赛按钮之前
  if (DOM.startMatchBtn && DOM.startMatchBtn.parentNode) {
    actionsContainer.insertBefore(randomMatchBtn, DOM.startMatchBtn);
  } else {
    actionsContainer.appendChild(randomMatchBtn);
  }

  // 更新缓存的DOM引用
  DOM.randomMatchBtn = randomMatchBtn;

  // 添加事件监听
  DOM.randomMatchBtn.addEventListener("click", randomizeMatches);
}

// 随机匹配选手处理函数
function randomizeMatches() {
  console.log("执行随机匹配");

  if (!BattleState.playersLoaded || BattleState.players.length < 4) {
    showToast("选手数据不足，无法随机匹配", "warning");
    return;
  }

  // 获取当前的四名选手
  const currentPlayers = BattleState.players.slice(0, 4);

  // 随机打乱选手顺序
  const shuffledPlayers = [...currentPlayers].sort(() => Math.random() - 0.5);

  // 更新玩家数组
  for (let i = 0; i < 4 && i < shuffledPlayers.length; i++) {
    BattleState.players[i] = shuffledPlayers[i];
  }

  // 如果在第一轮且胜者组第一轮第一场，重新初始化比赛
  if (
    BattleState.currentRound === 1 &&
    BattleState.currentBracket === "winner" &&
    BattleState.currentMatchIndex === 0
  ) {
    // 重新初始化比赛安排
    initializeTournamentBracket();

    // 刷新比赛显示
    displayCurrentMatch();
    updateBracketDisplay();

    showToast("选手已随机匹配", "success");
  } else {
    showToast("只能在比赛开始前随机匹配选手", "warning");
  }
}

// 处理抽取音乐
function handleDrawMusic() {
  console.log("执行抽取音乐");

  if (!BattleState.musicLoaded) {
    showToast("音乐数据正在加载，请稍候", "info");
    return;
  }

  if (BattleState.musicList.length === 0) {
    showToast("音乐列表为空", "error");
    return;
  }

  // 禁用抽取按钮
  DOM.drawMusicBtn.disabled = true;

  // 闪现效果参数
  const flashCount = 15;
  const flashInterval = 80;
  let currentFlash = 0;

  // 闪现动画
  const flashTimer = setInterval(() => {
    const randomIdx = Math.floor(Math.random() * BattleState.musicList.length);
    const flashMusic = BattleState.musicList[randomIdx];

    // 更新UI（闪现）
    DOM.musicName.innerText = flashMusic;
    DOM.musicName.style.color = "#fbbf24";

    currentFlash++;

    if (currentFlash >= flashCount) {
      clearInterval(flashTimer);

      // 最终随机选择
      const finalIdx = Math.floor(Math.random() * BattleState.musicList.length);
      const finalMusic = BattleState.musicList[finalIdx];

      // 更新UI
      DOM.musicName.innerText = finalMusic;
      DOM.musicName.style.color = "#10b981";
      DOM.musicPlayer.src = `/resource/musics/1yearplus_ex/${finalMusic}`;

      DOM.drawMusicBtn.disabled = false;
      showToast(`已抽取音乐: ${finalMusic}`, "success");
    }
  }, flashInterval);
}

// 处理播放音乐
function handlePlayMusic() {
  console.log("执行播放音乐");

  if (!DOM.musicPlayer.src) {
    showToast("请先抽取音乐", "warning");
    return;
  }

  if (DOM.musicPlayer.paused) {
    // 如果已在播放模式，先停止
    if (BattleState.isMusicPlaying) {
      stopMusicMode();
      return;
    }

    // 启动音乐播放模式
    startMusicMode();
  } else {
    // 停止播放
    stopMusicMode();
  }
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

  // 显示新的比赛
  displayCurrentMatch();
  updateBracketDisplay();
  updateRoundDisplay();

  // 保存状态
  saveGameState();
}

// 新增合并功能：清除缓存并重置游戏
function clearCacheAndResetGame() {
  try {
    // 清除本地存储
    localStorage.removeItem("battleGroup1-2State");
    localStorage.removeItem("chapter1Winners");
    localStorage.removeItem("chapter2Winner");

    // 显示处理中提示
    showToast("正在重置比赛并清除缓存...", "info");

    // 清除服务器缓存
    Promise.all([
      // 清除battle-group1-2进度
      fetch("/api/clear-battle-group1-2-process", {
        method: "POST",
      }),
      // 获取最新的winners.json数据
      fetch("/resource/json/winners.json", {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache",
        },
      }).then((response) => response.json()),
    ])
      .then(([clearResponse, winnersData]) => {
        if (!clearResponse.ok) {
          throw new Error("清除服务器缓存失败");
        }

        console.log("缓存已清除，获取到最新获胜者数据:", winnersData);

        // 重新加载选手数据
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

          // 重置音乐
          DOM.musicName.innerText = "音乐名称";
          DOM.musicPlayer.src = "";

          showToast("比赛已完全重置，使用最新数据", "success");

          // 刷新页面以确保所有状态都是最新的
          setTimeout(() => location.reload(), 1500);
        });
      })
      .catch((error) => {
        console.error("重置失败:", error);
        showToast("重置失败: " + error.message, "error");
      });
  } catch (error) {
    console.error("重置失败:", error);
    showToast("重置失败: " + error.message, "error");
  }
}

// 清除缓存 (保留原函数，但在新流程中不再单独使用)
function clearCache() {
  try {
    // 确认对话框
    if (!confirm("确定要清除所有缓存数据吗？此操作将无法恢复。")) {
      return;
    }

    // 清除本地存储
    localStorage.removeItem("battleGroup1-2State");
    localStorage.removeItem("chapter1Winners");
    localStorage.removeItem("chapter2Winner");

    // 清除服务器缓存
    fetch("/api/clear-battle-group1-2-process", {
      method: "POST",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("服务器响应错误");
        }
        return response.text();
      })
      .then(() => {
        console.log("所有缓存已清除");

        // 重置battle-group1-2-process.json文件
        return fetch("/api/reset-battle-process", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chapter: 2,
            confirm: true,
          }),
        });
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error("重置battle-group1-2-process.json失败");
        }
        showToast("缓存已清除", "success");
        // 重置游戏状态
        setTimeout(() => location.reload(), 1000);
      })
      .catch((error) => {
        console.error("清除缓存失败:", error);
        showToast("清除缓存失败: " + error.message, "error");
      });
  } catch (error) {
    console.error("清除缓存失败:", error);
    showToast("清除缓存失败", "error");
  }
}

// 重置游戏 (保留原函数，但在新流程中不再单独使用)
function resetGame() {
  // 清除缓存
  localStorage.removeItem("battleGroup1-2State");

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

  // 重置音乐
  DOM.musicName.innerText = "音乐名称";
  DOM.musicPlayer.src = "";

  showToast("游戏已重置", "success");
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

// 处理页面点击事件 (用于音乐播放模式)
function handleDocumentClick(event) {
  if (BattleState.isMusicPlaying) {
    // 确保不是点击播放器或提示
    if (
      !DOM.musicPlayer.contains(event.target) &&
      event.target.id !== "click-to-stop-hint"
    ) {
      stopMusicMode();
    }
  }
}

// 添加自动保存定时器
function setupAutoSave() {
  // 每60秒自动保存一次
  autoSaveTimer = setInterval(saveGameState, 60000);
}

/* =================================================================
 *  组件入口（原 b-g1-2-core.js DOMContentLoaded 初始化，kernel render 时执行）
 * ================================================================= */
export function battleGroup12Component(el, meta, ctx) {
  // cleanup 契约：静态骨架节点的全部监听经 signal 登记，重渲染时 abort 统一解绑，
  // 防止不刷新页面的重复 render 造成双绑双触发
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

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

  // 等待DOM加载完成后添加按钮
  setTimeout(addRandomMatchButton, 1000);

  return () => cleanupBattleGroup12Page(bindAbort);
}

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用）
 * ================================================================= */
function cleanupBattleGroup12Page(bindAbort) {
  // signal 登记的静态骨架监听（按钮/选手卡）统一解绑
  if (bindAbort) bindAbort.abort();

  // 自动保存定时器
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }

  // 音乐播放模式的 document 级监听与 audio 解绑（P3 定稿约定）
  document.removeEventListener("click", handleDocumentClick);
  BattleState.isMusicPlaying = false;
  document.body.classList.remove("music-playing-mode");

  const player = document.getElementById("music-player");
  if (player) {
    player.onended = null;
    player.pause();
    try { player.currentTime = 0; } catch (e) { /* 未加载媒体时可能抛错，忽略 */ }
  }
}
