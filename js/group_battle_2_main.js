/**
 * 团体赛 - 第二大轮（胜者组/败者组）
 * 主入口：状态定义、DOM缓存、初始化
 */

const GBState = {
  phase: "loading",
  round: 2,
  allPlayers: [],
  oldPlayers: [],
  newPlayers: [],
  groups: [],
  currentMatch: {
    group1Idx: null,
    group2Idx: null,
    defender: null,
    challenger: null,
    winner: null,
    loser: null,
    duelHistory: [],
    matchWinnerGroupIdx: null,
    matchLoserGroupIdx: null,
    nextChallengerGroupIdx: null,
  },
  bracket: { pendingMatches: [], completedMatches: [] },
  undoStack: [],
  musicListNew: [],
  musicListOld: [],
  revivalUsed: {},
  round1Data: null,
};

const DOM = {};
const PlayerPools = { oldSet: new Set(), newSet: new Set() };

function cacheDOM() {
  DOM.statusSection = document.getElementById("status-section");
  DOM.bracketStatus = document.getElementById("bracket-status");
  DOM.systemHint = document.getElementById("system-hint");
  DOM.groupsGrid = document.getElementById("groups-grid");
  DOM.musicInfoSection = document.getElementById("music-info-section");
  DOM.currentMusicLib = document.getElementById("current-music-lib");
  DOM.currentMusicSource = document.getElementById("current-music-source");
  DOM.battleArena = document.getElementById("battle-arena");
  DOM.arenaPlayer1 = document.getElementById("arena-player1");
  DOM.arenaPlayer2 = document.getElementById("arena-player2");
  DOM.arenaPlayer1Name = document.getElementById("arena-player1-name");
  DOM.arenaPlayer2Name = document.getElementById("arena-player2-name");
  DOM.arenaGroup1Label = document.getElementById("arena-group1-label");
  DOM.arenaGroup2Label = document.getElementById("arena-group2-label");
  DOM.arenaRole1 = document.getElementById("arena-role1");
  DOM.arenaRole2 = document.getElementById("arena-role2");
  DOM.drawMusicBtn = document.getElementById("draw-music-btn");
  DOM.startBattleBtn = document.getElementById("start-battle-btn");
  DOM.clearWinnerBtn = document.getElementById("clear-winner-btn");
  DOM.nextMatchBtn = document.getElementById("next-match-btn");
  DOM.nextRoundBtn = document.getElementById("next-round-btn");
  DOM.resetMatchBtn = document.getElementById("reset-match-btn");
  DOM.prevRoundBtn = document.getElementById("prev-round-btn");
  DOM.matchHistory = document.getElementById("match-history");
  DOM.battleStartOverlay = document.getElementById("battle-start-overlay");
  DOM.battleStartText = document.getElementById("battle-start-text");
  DOM.clickToStop = document.getElementById("click-to-stop");
  DOM.animOverlay = document.getElementById("anim-overlay");
  DOM.killEffect = document.getElementById("kill-effect");
  DOM.winEffect = document.getElementById("win-effect");
}

document.addEventListener("DOMContentLoaded", () => {
  cacheDOM();
  bindEvents();
  loadRound1Data().then(() => {
    if (!GBState.round1Data) {
      showToast("未找到第一大轮数据，请返回第一大轮", "error");
      DOM.systemHint.textContent = "请先完成第一大轮";
      return;
    }
    setupRound2();
    renderAll();
  });
});

function bindEvents() {
  DOM.startBattleBtn.addEventListener("click", handleStartBattle);
  DOM.drawMusicBtn.addEventListener("click", handleDrawMusic);
  DOM.clearWinnerBtn.addEventListener("click", handleUndo);
  DOM.nextMatchBtn.addEventListener("click", handleNextMatch);
  DOM.nextRoundBtn.addEventListener("click", handleNextRound);
  DOM.resetMatchBtn.addEventListener("click", handleResetMatch);
  DOM.prevRoundBtn.addEventListener("click", () => {
    window.location.href = "../html/group_battle.html";
  });
  document
    .getElementById("reset-game-btn")
    .addEventListener("click", handleReset);
  document.getElementById("home-btn").addEventListener("click", () => {
    window.location.href = "../html/index.html";
  });
  DOM.groupsGrid.addEventListener("click", handleGroupSectionClick);
  DOM.arenaPlayer1.addEventListener("click", () => selectArenaWinner(0));
  DOM.arenaPlayer2.addEventListener("click", () => selectArenaWinner(1));
  document.addEventListener("click", handleBattleModeClick);
  document.addEventListener("dblclick", handleDoubleClick);
}
