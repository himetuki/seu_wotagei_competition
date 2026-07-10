/**
 * 团体赛 - 第三大轮（决赛）
 * 主入口：状态定义、DOM缓存、初始化、事件绑定
 * 1v1赛制，单轮决胜，无复活
 */

const GBState = {
  phase: "loading",
  round: 3,
  allPlayers: [], oldPlayers: [], newPlayers: [],
  groups: [],
  currentMatch: { group1Idx: null, group2Idx: null, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null },
  bracket: { pendingMatches: [], completedMatches: [] },
  undoStack: [],
  musicListNew: [], musicListEx: [],
  round2Data: null,
  grandFinalSeedGroupIdx: null,
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
  DOM.finishBtn = document.getElementById("finish-btn");
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
  loadRound2Data().then(() => {
    if (!GBState.round2Data) {
      showToast("未找到第二大轮数据，请返回第二大轮", "error");
      DOM.systemHint.textContent = "请先完成第二大轮";
      return;
    }
    setupRound3();
    renderAll();
  });
});

function bindEvents() {
  DOM.startBattleBtn.addEventListener("click", handleStartBattle);
  DOM.drawMusicBtn.addEventListener("click", handleDrawMusic);
  DOM.clearWinnerBtn.addEventListener("click", handleUndo);
  DOM.nextMatchBtn.addEventListener("click", handleNextMatch);
  DOM.finishBtn.addEventListener("click", handleFinish);
  DOM.resetMatchBtn.addEventListener("click", handleResetMatch);
  DOM.prevRoundBtn.addEventListener("click", () => { window.location.href = "../html/group_battle_2.html"; });
  document.getElementById("reset-game-btn").addEventListener("click", handleReset);
  document.getElementById("home-btn").addEventListener("click", () => { window.location.href = "../html/index.html"; });
  DOM.groupsGrid.addEventListener("click", handleGroupSectionClick);
  DOM.arenaPlayer1.addEventListener("click", () => selectArenaWinner(0));
  DOM.arenaPlayer2.addEventListener("click", () => selectArenaWinner(1));
  document.addEventListener("click", handleBattleModeClick);
  document.addEventListener("dblclick", handleDoubleClick);
}
