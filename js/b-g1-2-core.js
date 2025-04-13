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
document.addEventListener("DOMContentLoaded", function () {
  console.log("页面加载完成，初始化系统...");

  // 缓存DOM元素引用
  cacheDOMReferences();

  // 绑定事件监听器
  setupEventListeners();

  // 加载数据
  initializeData();

  // 等待DOM加载完成后添加按钮
  setTimeout(addRandomMatchButton, 1000);
});

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
