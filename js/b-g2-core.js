/**
 * 一年内组比赛界面 - 上半场（核心模块）
 * 包含全局变量和基本初始化
 */

// 全局DOM元素引用
const DOM = {
  playerList: document.getElementById("playerList"),
  trickList: document.getElementById("trickList"),
  currentPlayer: document.getElementById("currentPlayer"),
  currentTrick: document.getElementById("currentTrick"),
  currentMusic: document.getElementById("currentMusic"),
  musicPlayer: document.getElementById("musicPlayer"),
  nextPlayerButton: document.getElementById("nextPlayerButton"),
  playMusicButton: document.getElementById("playMusicButton"),
  shuffleButton: document.getElementById("shuffleButton"),
  drawTrickButton: document.getElementById("drawTrickButton"),
  drawMusicButton: document.getElementById("drawMusicButton"),
  clearCacheButton: document.getElementById("clearCacheButton"),
  homeButton: document.getElementById("homeButton"),
};

// 全局状态
const AppState = {
  players: [],
  tricks: [],
  currentPlayerIndex: 0,
  currentMusicFile: "",
  isMusicPaused: false,
  isMusicPlaying: false,
  originalPlayers: [],
};

// 缓存键名定义
const CACHE_KEY = {
  PLAYERS: "battle_group2_players",
  CURRENT_INDEX: "battle_group2_current_index",
  CURRENT_TRICK: "battle_group2_current_trick",
  CURRENT_MUSIC: "battle_group2_current_music",
  CROSSED_TRICKS: "battle_group2_crossed_tricks",
};

// 主入口函数 - 页面加载完成时执行
document.addEventListener("DOMContentLoaded", () => {
  console.log("初始化一年内组比赛界面");

  // 隐藏音乐播放进度
  DOM.musicPlayer.style.display = "none";

  // 加载数据
  loadData();

  // 设置事件监听器
  setupEventListeners();

  // 添加离开页面前保存
  window.addEventListener("beforeunload", () => {
    saveState();
  });
});
