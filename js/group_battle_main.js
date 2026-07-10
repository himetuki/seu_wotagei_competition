/**
 * 团体赛 - 第一大轮（初赛）
 * 主入口：状态定义、DOM缓存、初始化
 */

const GBState = {
  phase: "assigning",
  round: 1,
  allPlayers: [],
  oldPlayers: [],
  newPlayers: [],
  unassigned: [],
  selectedMember: null,
  groups: [
    {
      id: "A",
      members: [],
      eliminated: [],
      wins: 0,
      losses: 0,
      status: "active",
    },
    {
      id: "B",
      members: [],
      eliminated: [],
      wins: 0,
      losses: 0,
      status: "active",
    },
    {
      id: "C",
      members: [],
      eliminated: [],
      wins: 0,
      losses: 0,
      status: "active",
    },
    {
      id: "D",
      members: [],
      eliminated: [],
      wins: 0,
      losses: 0,
      status: "active",
    },
  ],
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
    firstTrickLocked: false,
    selectedTrick: null,
  },
  bracket: { pendingMatches: [], completedMatches: [] },
  undoStack: [],
  trickPool: [],
  musicListNew: [],
  musicListOld: [],
  musicListEx: [],
  revivalUsed: {},
};

const DOM = {};
const PlayerPools = { oldSet: new Set(), newSet: new Set() };

function cacheDOM() {
  DOM.statusSection = document.getElementById("status-section");
  DOM.bracketStatus = document.getElementById("bracket-status");
  DOM.systemHint = document.getElementById("system-hint");
  DOM.unassignedSection = document.getElementById("unassigned-section");
  DOM.unassignedPool = document.getElementById("unassigned-pool");
  DOM.groupsSection = document.getElementById("groups-section");
  DOM.groupsGrid = document.getElementById("groups-grid");
  DOM.trickPoolSection = document.getElementById("trick-pool-section");
  DOM.trickPool = document.getElementById("trick-pool");
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
  DOM.matchGroupsBtn = document.getElementById("match-groups-btn");
  DOM.drawMusicBtn = document.getElementById("draw-music-btn");
  DOM.startBattleBtn = document.getElementById("start-battle-btn");
  DOM.clearWinnerBtn = document.getElementById("clear-winner-btn");
  DOM.nextMatchBtn = document.getElementById("next-match-btn");
  DOM.nextRoundBtn = document.getElementById("next-round-btn");
  DOM.resetMatchBtn = document.getElementById("reset-match-btn");
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
  Promise.all([loadPlayers(), loadTricks(), loadMusic()]).then(() => {
    loadStateFromServer().then((ok) => {
      if (!ok) loadState();
      if (
        GBState.phase === "assigning" &&
        GBState.allPlayers.length > 0 &&
        GBState.unassigned.length === 0
      ) {
        GBState.unassigned = [...GBState.allPlayers];
      }
      renderAll();
    });
  });
});

function bindEvents() {
  DOM.matchGroupsBtn.addEventListener("click", handleMatchGroups);
  DOM.drawMusicBtn.addEventListener("click", handleDrawMusic);
  DOM.startBattleBtn.addEventListener("click", handleStartBattle);
  DOM.clearWinnerBtn.addEventListener("click", handleUndo);
  DOM.nextMatchBtn.addEventListener("click", handleNextMatch);
  DOM.nextRoundBtn.addEventListener("click", handleNextRound);
  DOM.resetMatchBtn.addEventListener("click", handleResetMatch);
  document
    .getElementById("reset-game-btn")
    .addEventListener("click", handleReset);
  document.getElementById("home-btn").addEventListener("click", () => {
    window.location.href = "../html/index.html";
  });
  DOM.unassignedPool.addEventListener("click", handleUnassignedClick);
  DOM.groupsGrid.addEventListener("click", handleGroupSectionClick);
  DOM.arenaPlayer1.addEventListener("click", () => selectArenaWinner(0));
  DOM.arenaPlayer2.addEventListener("click", () => selectArenaWinner(1));
  document.addEventListener("click", handleBattleModeClick);
  document.addEventListener("dblclick", handleDoubleClick);
  window.addEventListener("beforeunload", saveState);
}
