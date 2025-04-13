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

  // 音乐播放状态
  isMusicPlaying: false,

  // 选中的技能状态
  selectedPlayer1Trick: null,
  selectedPlayer2Trick: null,
};

// =============== DOM 元素引用缓存 ===============
const DOM = {};

// =============== 初始化函数 ===============
// 主入口函数 - 页面加载完成时执行
document.addEventListener("DOMContentLoaded", function () {
  console.log("页面加载完成，初始化系统...");

  // 缓存DOM元素引用
  cacheDOMReferences();

  // 绑定事件监听器
  setupEventListeners();

  // 加载数据
  initializeData();
});

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
  DOM.nextRoundBtn = document.getElementById("next-round-btn");
  DOM.resetGameBtn = document.getElementById("reset-game-btn");
  DOM.homeBtn = document.getElementById("home-btn");
  DOM.clearCacheBtn = document.getElementById("clear-cache-btn");

  // 显示区域
  DOM.musicName = document.getElementById("music-name");
  DOM.musicPlayer = document.getElementById("music-player");
  DOM.randomTricksDisplay = document.getElementById("random-tricks-display");

  // 技池区域
  DOM.tricksPoolPlayer1 = document.getElementById("tricks-pool-list-player1");
  DOM.tricksPoolPlayer2 = document.getElementById("tricks-pool-list-player2");
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
      initializeGameState();
    })
    .catch((error) => {
      console.error("数据加载失败:", error);
      showToast("数据加载失败，请刷新页面重试", "error");
    });
}
