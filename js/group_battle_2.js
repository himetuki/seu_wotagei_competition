/**
 * 团体赛 - 第二大轮（胜者组/败者组）
 */
const GBState = {
  phase: "loading",
  round: 2,
  allPlayers: [], oldPlayers: [], newPlayers: [],
  groups: [],
  currentMatch: { group1Idx: null, group2Idx: null, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null, nextChallengerGroupIdx: null },
  bracket: { pendingMatches: [], completedMatches: [] },
  undoStack: [],
  musicListNew: [], musicListOld: [],
  revivalUsed: {},
  round1Data: null,
};
const DOM = {};
function cacheDOM() {
  DOM.statusSection = document.getElementById("status-section");
  DOM.bracketStatus = document.getElementById("bracket-status");
  DOM.systemHint = document.getElementById("system-hint");
  DOM.groupsGrid = document.getElementById("groups-grid");
  DOM.musicInfoSection = document.getElementById("music-info-section");
  DOM.currentMusicLib = document.getElementById("current-music-lib");
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
  DOM.prevRoundBtn.addEventListener("click", () => { window.location.href = "../html/group_battle.html"; });
  document.getElementById("reset-game-btn").addEventListener("click", handleReset);
  document.getElementById("home-btn").addEventListener("click", () => { window.location.href = "../html/index.html"; });
  DOM.groupsGrid.addEventListener("click", handleGroupSectionClick);
  DOM.arenaPlayer1.addEventListener("click", () => selectArenaWinner(0));
  DOM.arenaPlayer2.addEventListener("click", () => selectArenaWinner(1));
  document.addEventListener("click", handleBattleModeClick);
  document.addEventListener("dblclick", handleDoubleClick);
}

function loadRound1Data() {
  return new Promise((resolve) => {
    const local = localStorage.getItem("groupBattleRound1");
    if (local) {
      try { GBState.round1Data = JSON.parse(local); resolve(); return; } catch (e) {}
    }
    fetch("http://localhost:3000/api/group-battle-process")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.currentState && data.currentState.bracket && data.currentState.bracket.completedMatches.length > 0) {
          const gs = data.currentState.groups;
          const completed = data.currentState.bracket.completedMatches;
          GBState.round1Data = { groups: gs, completedMatches: completed, revivalUsed: data.currentState.revivalUsed || {} };
        }
        resolve();
      })
      .catch(() => resolve());
  });
}

function setupRound2() {
  const r1 = GBState.round1Data;
  GBState.groups = r1.groups.map((g) => ({ ...g, eliminated: [], wins: g.wins, losses: g.losses, status: g.status }));
  GBState.revivalUsed = r1.revivalUsed || {};

  Promise.all([
    fetch("../resource/json/player1.json").then((r) => r.json()),
    fetch("../resource/json/player2.json").then((r) => r.json()),
    fetch("../resource/json/musics_list.json").then((r) => r.json()).catch(() => []),
    fetch("../resource/json/musics_list_2.json").then((r) => r.json()).catch(() => []),
  ]).then(([oldData, newData, newList, oldList]) => {
    GBState.oldPlayers = oldData.map((p) => p.name);
    GBState.newPlayers = newData.map((p) => p.name);
    GBState.allPlayers = [...GBState.oldPlayers, ...GBState.newPlayers];
    GBState.musicListNew = newList;
    GBState.musicListOld = oldList;

    // 构建第二轮对阵：胜者组 + 败者组
    const winners = GBState.groups.filter((g) => g.wins >= 1).sort((a, b) => b.wins - a.wins);
    const losers = GBState.groups.filter((g) => g.losses >= 1 && g.status !== "eliminated").sort((a, b) => a.losses - b.losses);
    const matches = [];
    if (winners.length >= 2) matches.push({ g1: GBState.groups.indexOf(winners[0]), g2: GBState.groups.indexOf(winners[1]), played: false, label: "胜者组" });
    if (losers.length >= 2) matches.push({ g1: GBState.groups.indexOf(losers[0]), g2: GBState.groups.indexOf(losers[1]), played: false, label: "败者组" });
    GBState.bracket.pendingMatches = matches;
    GBState.phase = matches.length > 0 ? "selecting_groups" : "finished";
    renderAll();
  });
}

// ==================== 选组 ====================
let selectedGroupIdxs = [];
function handleGroupSectionClick(e) {
  const card = e.target.closest(".group-card");
  if (!card) return;
  const idx = parseInt(card.dataset.groupIdx);
  if (GBState.phase === "selecting_groups") { handleSelectGroup(idx); return; }
}

function handleSelectGroup(idx) {
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (!pending) return;
  if (idx !== pending.g1 && idx !== pending.g2) { showToast("请按赛程选择指定的组", "warning"); return; }
  const card = document.getElementById("group-card-" + idx);
  if (selectedGroupIdxs.includes(idx)) {
    selectedGroupIdxs = selectedGroupIdxs.filter((i) => i !== idx);
    if (card) card.classList.remove("selected-group");
  } else {
    if (selectedGroupIdxs.length >= 2) {
      const first = selectedGroupIdxs.shift();
      const firstCard = document.getElementById("group-card-" + first);
      if (firstCard) firstCard.classList.remove("selected-group");
    }
    selectedGroupIdxs.push(idx);
    if (card) card.classList.add("selected-group");
  }
  if (selectedGroupIdxs.length === 2) confirmGroupSelection();
}

function confirmGroupSelection() {
  const [idx1, idx2] = selectedGroupIdxs;
  GBState.currentMatch = { group1Idx: idx1, group2Idx: idx2, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null, nextChallengerGroupIdx: null };
  GBState.phase = "selecting_players";
  selectedGroupIdxs = [];
  saveState(); renderAll();
  showToast("请从两组中各选1名出战选手", "info");
}

// ==================== 选选手（可回归） ====================
function handleMemberClick(groupIdx, playerName, e) {
  e.stopPropagation();
  const group = GBState.groups[groupIdx];
  if (group.eliminated.includes(playerName) && !canRevive(playerName)) return;
  const match = GBState.currentMatch;
  
  // 回归功能：如果该成员已经在对战席，点击回归备战席
  if (match.defender && match.defender.groupIdx === groupIdx && match.defender.playerName === playerName) {
    match.defender = null;
    // 如果已经抽取了音乐，重置音乐状态
    if (GBState.phase === "ready_to_battle" || GBState.phase === "music_drawn") {
      GBState.phase = "selecting_players";
      match.drawnMusic = null;
    }
    pushUndo({ type: "return_defender", groupIdx, playerName });
    saveState(); renderAll();
    return;
  }
  if (match.challenger && match.challenger.groupIdx === groupIdx && match.challenger.playerName === playerName) {
    match.challenger = null;
    // 如果已经抽取了音乐，重置音乐状态
    if (GBState.phase === "ready_to_battle" || GBState.phase === "music_drawn") {
      GBState.phase = "selecting_players";
      match.drawnMusic = null;
    }
    pushUndo({ type: "return_challenger", groupIdx, playerName });
    saveState(); renderAll();
    return;
  }
  
  if (GBState.phase === "selecting_players" || GBState.phase === "ready_to_battle" || GBState.phase === "music_drawn") {
    // 允许在选择选手、准备对战、已抽取音乐阶段更改选手
    if (match.defender === null) {
      match.defender = { groupIdx, playerName, role: "defender" };
      pushUndo({ type: "select_defender", groupIdx, playerName });
      saveState(); renderAll();
      return;
    }
    if (match.challenger === null && groupIdx !== match.defender.groupIdx) {
      match.challenger = { groupIdx, playerName, role: "challenger" };
      pushUndo({ type: "select_challenger", groupIdx, playerName });
      saveState(); renderAll();
      return;
    }
    if (match.challenger === null && groupIdx === match.defender.groupIdx) { showToast("请选择另一组的成员", "warning"); return; }
  } else if (GBState.phase === "selecting_next_challenger") {
    if (groupIdx === match.defender.groupIdx) { showToast("请选择败者组的成员", "warning"); return; }
    if (groupIdx !== match.nextChallengerGroupIdx) { showToast("请选择指定组的成员", "warning"); return; }
    match.challenger = { groupIdx, playerName, role: "challenger" };
    match.winner = null; match.loser = null;
    pushUndo({ type: "select_next_challenger", groupIdx, playerName });
    GBState.phase = "ready_to_battle";
    saveState(); renderAll();
  }
}

function canRevive(playerName) {
  return GBState.newPlayers.includes(playerName) && !GBState.revivalUsed[playerName];
}

function handleRevive(groupIdx, playerName) {
  if (!canRevive(playerName)) { showToast("该选手无法复活", "warning"); return; }
  const group = GBState.groups[groupIdx];
  group.eliminated = group.eliminated.filter((n) => n !== playerName);
  GBState.revivalUsed[playerName] = true;
  pushUndo({ type: "revive", groupIdx, playerName });
  saveState(); renderAll();
  showToast(playerName + " 已复活！", "success");
}

function getMusicLibName() {
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return "1年+曲库";
  const dIsNew = GBState.newPlayers.includes(match.defender.playerName);
  const cIsNew = GBState.newPlayers.includes(match.challenger.playerName);
  return (dIsNew && cIsNew) ? "新人赛曲库" : "1年+曲库";
}

function getCurrentMusicLibrary() {
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return GBState.musicListOld;
  const dIsNew = GBState.newPlayers.includes(match.defender.playerName);
  const cIsNew = GBState.newPlayers.includes(match.challenger.playerName);
  return (dIsNew && cIsNew) ? GBState.musicListNew : GBState.musicListOld;
}

// ==================== 抽取音乐 ====================
function handleDrawMusic() {
  if (GBState.phase !== "ready_to_battle" && GBState.phase !== "music_drawn") return;
  const lib = getCurrentMusicLibrary();
  if (lib.length === 0) { showToast("音乐列表为空", "error"); return; }
  
  // 禁用抽取按钮，防止重复点击
  DOM.drawMusicBtn.disabled = true;
  
  // 闪现效果参数
  const flashCount = 15;
  const flashInterval = 80;
  let currentFlash = 0;
  
  // 闪现动画
  const flashTimer = setInterval(() => {
    const randomIdx = Math.floor(Math.random() * lib.length);
    const flashMusic = lib[randomIdx];
    
    // 更新曲库显示（闪现）
    DOM.currentMusicLib.textContent = getMusicLibName() + " | " + flashMusic;
    DOM.currentMusicLib.style.color = "#fbbf24";
    
    currentFlash++;
    
    if (currentFlash >= flashCount) {
      clearInterval(flashTimer);
      
      // 最终随机选择
      const finalIdx = Math.floor(Math.random() * lib.length);
      const finalMusic = lib[finalIdx];
      
      const player = document.getElementById("music-player");
      player.src = "../resource/musics/1yearplus_ex/" + finalMusic;
      GBState.currentMatch.drawnMusic = finalMusic;
      GBState.phase = "music_drawn";
      
      // 更新最终显示
      DOM.currentMusicLib.textContent = getMusicLibName() + " | " + finalMusic;
      DOM.currentMusicLib.style.color = "#fbbf24";
      
      saveState(); renderAll();
      DOM.drawMusicBtn.disabled = false;
      showToast("已抽取音乐：" + finalMusic + "  曲库：" + getMusicLibName(), "success");
    }
  }, flashInterval);
}

// ==================== 开播 ====================
let battleStartTimer = null;

function handleStartBattle() {
  if (GBState.phase !== "music_drawn") return;
  document.body.classList.add("battle-mode");
  DOM.battleStartOverlay.classList.remove("hidden");
  DOM.battleStartText.classList.remove("hidden");
  const text = "BATTLE START"; let current = "", i = 0;
  const interval = setInterval(() => { if (i < text.length) { current += text[i]; DOM.battleStartText.textContent = current; i++; } else { clearInterval(interval); } }, 130);
  setTimeout(() => { DOM.clickToStop.classList.remove("hidden"); }, 1500);
  battleStartTimer = setTimeout(() => { endBattleStart(); }, 4500);
}
function endBattleStart() {
  if (!document.body.classList.contains("battle-mode")) return;
  
  // 隐藏动画元素，但保持 battle-mode 以显示背景
  DOM.battleStartOverlay.classList.add("hidden");
  DOM.battleStartText.classList.add("hidden");
  DOM.clickToStop.classList.add("hidden");
  DOM.battleStartText.textContent = "";
  
  const player = document.getElementById("music-player");
  if (player.src) {
    player.play().catch(err => {
      console.error("音乐播放失败:", err);
      showToast("音乐播放失败，请检查文件", "error");
    });
    GBState.phase = "music_playing";
    saveState(); renderAll();
    showToast("双击屏幕退出播放", "info");
  } else {
    document.body.classList.remove("battle-mode");
    GBState.phase = "battling";
    saveState(); renderAll();
    showToast("对战开始！请点击胜者", "info");
  }
}
function handleBattleModeClick(e) {
  if (!document.body.classList.contains("battle-mode")) return;
  if (battleStartTimer) { clearTimeout(battleStartTimer); battleStartTimer = null; }
  if (GBState.phase === "music_drawn" || GBState.phase === "music_playing") {
    endBattleStart();
  }
}

function handleDoubleClick(e) {
  if (GBState.phase !== "music_playing") return;
  const player = document.getElementById("music-player");
  player.pause();
  player.currentTime = 0;
  document.body.classList.remove("battle-mode");
  GBState.phase = "battling";
  saveState(); renderAll();
  showToast("对战开始！请点击胜者", "info");
}

// ==================== 选胜者 ====================
function selectArenaWinner(arenaIdx) {
  if (GBState.phase !== "battling") return;
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return;
  const p1IsDefender = DOM.arenaRole1.textContent === "守擂者";
  let winner, loser;
  if (arenaIdx === 0) { winner = p1IsDefender ? match.defender : match.challenger; loser = p1IsDefender ? match.challenger : match.defender; }
  else { winner = p1IsDefender ? match.challenger : match.defender; loser = p1IsDefender ? match.defender : match.challenger; }
  match.winner = winner; match.loser = loser;
  const loserGroup = GBState.groups[loser.groupIdx];
  if (!loserGroup.eliminated.includes(loser.playerName)) loserGroup.eliminated.push(loser.playerName);
  pushUndo({ type: "select_winner", winner, loser });
  GBState.phase = "selecting_winner_anim";
  saveState(); renderAll();
  playResultAnimations(winner, loser, () => { handleMatchEndCheck(); });
}

function playResultAnimations(winner, loser, onComplete) {
  const loserArena = getArenaElementForPlayer(loser.groupIdx, loser.playerName);
  if (loserArena) loserArena.classList.add("loser-anim");
  DOM.animOverlay.classList.remove("hidden");
  DOM.animOverlay.classList.add("kill-active");
  document.body.classList.add("screen-shake");
  DOM.killEffect.classList.remove("hidden");
  setTimeout(() => {
    DOM.killEffect.classList.add("hidden");
    DOM.animOverlay.classList.remove("kill-active");
    document.body.classList.remove("screen-shake");
    const winnerArena = getArenaElementForPlayer(winner.groupIdx, winner.playerName);
    if (winnerArena) winnerArena.classList.add("winner-anim");
    DOM.animOverlay.classList.add("win-active");
    DOM.winEffect.classList.remove("hidden");
    setTimeout(() => {
      DOM.winEffect.classList.add("hidden");
      DOM.animOverlay.classList.remove("win-active");
      DOM.animOverlay.classList.add("hidden");
      if (loserArena) loserArena.classList.remove("loser-anim");
      if (winnerArena) winnerArena.classList.remove("winner-anim");
      onComplete();
    }, 1200);
  }, 1200);
}
function getArenaElementForPlayer(groupIdx, playerName) {
  const match = GBState.currentMatch;
  const p1IsDefender = DOM.arenaRole1.textContent === "守擂者";
  if (p1IsDefender) {
    if (match.defender && match.defender.groupIdx === groupIdx && match.defender.playerName === playerName) return DOM.arenaPlayer1;
    if (match.challenger && match.challenger.groupIdx === groupIdx && match.challenger.playerName === playerName) return DOM.arenaPlayer2;
  } else {
    if (match.challenger && match.challenger.groupIdx === groupIdx && match.challenger.playerName === playerName) return DOM.arenaPlayer1;
    if (match.defender && match.defender.groupIdx === groupIdx && match.defender.playerName === playerName) return DOM.arenaPlayer2;
  }
  return null;
}

function handleMatchEndCheck() {
  const match = GBState.currentMatch;
  const loserGroup = GBState.groups[match.loser.groupIdx];
  const remaining = loserGroup.members.filter((m) => !loserGroup.eliminated.includes(m));
  if (remaining.length === 0) {
    finishGroupMatch(match.winner.groupIdx, match.loser.groupIdx);
  } else {
    match.duelHistory.push({ defender: { ...match.defender }, challenger: { ...match.challenger }, winner: { ...match.winner }, loser: { ...match.loser } });
    match.defender = { ...match.winner, role: "defender" };
    match.nextChallengerGroupIdx = match.loser.groupIdx;
    match.challenger = null; match.winner = null; match.loser = null;
    GBState.phase = "selecting_next_challenger";
    saveState(); renderAll();
    showToast(loserGroup.id + "组 还有 " + remaining.length + " 人，请派出下一位挑战者", "info");
  }
}

function finishGroupMatch(winnerGroupIdx, loserGroupIdx) {
  const match = GBState.currentMatch;
  match.duelHistory.push({ defender: { ...match.defender }, challenger: { ...match.challenger }, winner: { ...match.winner }, loser: { ...match.loser } });
  GBState.groups[winnerGroupIdx].wins++;
  GBState.groups[loserGroupIdx].losses++;
  match.matchWinnerGroupIdx = winnerGroupIdx;
  match.matchLoserGroupIdx = loserGroupIdx;
  if (GBState.groups[loserGroupIdx].losses >= 2) GBState.groups[loserGroupIdx].status = "eliminated";
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (pending) { pending.played = true; pending.winner = winnerGroupIdx; pending.loser = loserGroupIdx; }
  GBState.bracket.completedMatches.push({ round: 2, stage: "winners_losers", group1: winnerGroupIdx, group2: loserGroupIdx, winner: winnerGroupIdx, duelHistory: [...match.duelHistory] });
  pushUndo({ type: "finish_match", winnerGroupIdx, loserGroupIdx });
  GBState.phase = "match_end";
  saveState(); renderAll();
  showToast(GBState.groups[winnerGroupIdx].id + "组 获胜！", "success");
}

// ==================== 进入下一场 / 下一大轮 ====================
function handleResetMatch() {
  if (!confirm("确定要重置当前对战吗？分组结果和已完成场次将保留。")) return;
  const match = GBState.currentMatch;
  if (match.loser) {
    const g = GBState.groups[match.loser.groupIdx];
    g.eliminated = g.eliminated.filter((n) => n !== match.loser.playerName);
  }
  match.duelHistory.forEach((d) => {
    if (d.loser) {
      const g = GBState.groups[d.loser.groupIdx];
      g.eliminated = g.eliminated.filter((n) => n !== d.loser.playerName);
    }
  });
  const g1 = match.group1Idx;
  const g2 = match.group2Idx;
  GBState.currentMatch = { group1Idx: g1, group2Idx: g2, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null, nextChallengerGroupIdx: null };
  GBState.phase = "selecting_players";
  const player = document.getElementById("music-player");
  player.pause(); player.currentTime = 0; player.src = "";
  saveState(); renderAll();
  showToast("当前对战已重置，请重新选择出战选手", "success");
}

function handleNextMatch() {
  if (GBState.phase !== "match_end") { showToast("请先完成当前场次", "warning"); return; }
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (pending) {
    GBState.currentMatch = { group1Idx: null, group2Idx: null, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null, nextChallengerGroupIdx: null };
    GBState.phase = "selecting_groups";
    selectedGroupIdxs = [];
    saveState(); renderAll();
    showToast("请进行下一场对战", "info");
  } else {
    DOM.nextMatchBtn.classList.add("hidden");
    DOM.nextRoundBtn.classList.remove("hidden");
    showToast("第二大轮全部结束！请点击「进入第三大轮」", "success");
  }
}

function handleNextRound() {
  const round2Result = {
    round: 2,
    groups: GBState.groups.map((g) => ({ id: g.id, wins: g.wins, losses: g.losses, status: g.status, members: g.members })),
    completedMatches: GBState.bracket.completedMatches,
    revivalUsed: GBState.revivalUsed,
  };
  localStorage.setItem("groupBattleRound2", JSON.stringify(round2Result));
  window.location.href = "../html/group_battle_3.html";
}

// ==================== 撤消 ====================
function pushUndo(action) { GBState.undoStack.push(action); }
function handleUndo() {
  if (GBState.undoStack.length === 0) { showToast("没有可撤消的操作", "info"); return; }
  const action = GBState.undoStack.pop();
  const match = GBState.currentMatch;
  switch (action.type) {
    case "select_defender": match.defender = null; GBState.phase = "selecting_players"; break;
    case "select_challenger": match.challenger = null; GBState.phase = "selecting_players"; break;
    case "return_defender": match.defender = { groupIdx: action.groupIdx, playerName: action.playerName, role: "defender" }; break;
    case "return_challenger": match.challenger = { groupIdx: action.groupIdx, playerName: action.playerName, role: "challenger" }; break;
    case "select_next_challenger":
      if (match.duelHistory.length > 0) { const last = match.duelHistory.pop(); match.defender = last.defender; match.challenger = last.challenger; match.winner = last.winner; match.loser = last.loser; }
      GBState.phase = "selecting_next_challenger"; break;
    case "select_winner":
      { const g = GBState.groups[action.loser.groupIdx]; g.eliminated = g.eliminated.filter((n) => n !== action.loser.playerName); match.winner = null; match.loser = null; }
      GBState.phase = "battling"; break;
    case "finish_match":
      GBState.groups[action.winnerGroupIdx].wins--;
      GBState.groups[action.loserGroupIdx].losses--;
      if (GBState.groups[action.loserGroupIdx].losses < 2) GBState.groups[action.loserGroupIdx].status = "active";
      { const last = GBState.bracket.completedMatches.pop(); if (last) { const p = GBState.bracket.pendingMatches.find((m) => m.played); if (p) p.played = false; } }
      match.matchWinnerGroupIdx = null; match.matchLoserGroupIdx = null;
      GBState.phase = "match_end"; break;
    case "revive":
      { const g = GBState.groups[action.groupIdx]; if (!g.eliminated.includes(action.playerName)) g.eliminated.push(action.playerName); GBState.revivalUsed[action.playerName] = false; }
      break;
  }
  saveState(); renderAll();
  showToast("已撤消上一步操作", "success");
}

// ==================== 渲染 ====================
function renderAll() {
  renderVisibility();
  renderStatus();
  renderGroups();
  renderArena();
  renderActions();
  renderHistory();
}
function renderVisibility() {
  const p = GBState.phase;
  DOM.battleArena.classList.toggle("hidden", p !== "selecting_players" && p !== "ready_to_battle" && p !== "music_drawn" && p !== "battling" && p !== "selecting_winner_anim" && p !== "selecting_next_challenger" && p !== "match_end" && p !== "music_playing");
  DOM.musicInfoSection.classList.toggle("hidden", p === "selecting_groups" || p === "loading");
}
function renderStatus() {
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  DOM.bracketStatus.textContent = pending ? "第二大轮 - " + pending.label : "第二大轮 - 结束";
  let hint = "";
  switch (GBState.phase) {
    case "loading": hint = "加载中..."; break;
    case "selecting_groups": hint = "请选择对战的两个组" + (pending ? "（" + GBState.groups[pending.g1].id + "组 vs " + GBState.groups[pending.g2].id + "组）" : ""); break;
    case "selecting_players": hint = "请从两组中各选1名出战选手（再次点击可回归）"; break;
    case "ready_to_battle": hint = "请点击「抽取音乐」"; break;
    case "music_drawn": hint = "请点击「开始比赛」开始对战"; break;
    case "music_playing": hint = "音乐播放中… 双击屏幕结束播放"; break;
    case "battling": hint = "对战开始！请点击胜者  当前曲库：" + getMusicLibName(); break;
    case "selecting_winner_anim": hint = "结果确认中..."; break;
    case "selecting_next_challenger": hint = GBState.groups[GBState.currentMatch.nextChallengerGroupIdx].id + "组 请派出下一位挑战者"; break;
    case "match_end": hint = "本场结束！"; break;
    default: hint = "...";
  }
  DOM.systemHint.textContent = hint;
  
  // 更新当前曲库显示
  const match = GBState.currentMatch;
  if (match.defender && match.challenger) {
    const musicLibName = getMusicLibName();
    const drawnMusic = match.drawnMusic || "-";
    DOM.currentMusicLib.textContent = musicLibName + " | " + drawnMusic;
  } else {
    DOM.currentMusicLib.textContent = "-";
  }
}

function renderGroups() {
  DOM.groupsGrid.innerHTML = "";
  const match = GBState.currentMatch;
  const activeIdxs = (match.group1Idx !== null && match.group2Idx !== null) ? [match.group1Idx, match.group2Idx] : [];
  GBState.groups.forEach((group, idx) => {
    const card = document.createElement("div");
    card.className = "group-card";
    card.id = "group-card-" + idx;
    card.dataset.groupIdx = idx;
    if (GBState.phase !== "loading" && GBState.phase !== "selecting_groups" && activeIdxs.length > 0 && !activeIdxs.includes(idx)) {
      card.classList.add("hidden");
    }
    if (group.status === "eliminated") card.classList.add("eliminated");
    const title = document.createElement("h3");
    title.className = "group-title";
    title.textContent = "Group " + group.id + " (" + group.wins + "胜" + group.losses + "负)";
    card.appendChild(title);
    const membersDiv = document.createElement("div");
    membersDiv.className = "group-members";
    group.members.forEach((member) => {
      const el = document.createElement("div");
      el.className = "member-name";
      el.textContent = member;
      if (group.eliminated.includes(member)) {
        el.classList.add("eliminated");
        if (canRevive(member)) {
          const reviveBtn = document.createElement("span");
          reviveBtn.textContent = " [复活]";
          reviveBtn.style.color = "#10b981";
          reviveBtn.style.cursor = "pointer";
          reviveBtn.style.marginLeft = "6px";
          reviveBtn.addEventListener("click", (e) => { e.stopPropagation(); handleRevive(idx, member); });
          el.appendChild(reviveBtn);
        }
      }
      if (match.defender && match.defender.groupIdx === idx && match.defender.playerName === member) el.classList.add("active-fighter");
      if (match.challenger && match.challenger.groupIdx === idx && match.challenger.playerName === member) el.classList.add("active-fighter");
      if (canSelectMember(idx, member)) {
        el.classList.add("selectable");
        el.addEventListener("click", (e) => handleMemberClick(idx, member, e));
      }
      membersDiv.appendChild(el);
    });
    card.appendChild(membersDiv);
    if (GBState.phase === "selecting_groups" && canSelectGroup(idx)) {
      card.classList.add("selectable-group");
      if (selectedGroupIdxs.includes(idx)) card.classList.add("selected-group");
    }
    DOM.groupsGrid.appendChild(card);
  });
}

function canSelectMember(groupIdx, playerName) {
  const group = GBState.groups[groupIdx];
  const match = GBState.currentMatch;
  // 回归功能：已在对战席的成员允许点击回归
  if (match.defender && match.defender.groupIdx === groupIdx && match.defender.playerName === playerName) return true;
  if (match.challenger && match.challenger.groupIdx === groupIdx && match.challenger.playerName === playerName) return true;
  // 已被淘汰的成员不可直接选中（需要先复活）
  if (group.eliminated.includes(playerName)) return false;
  if (GBState.phase === "selecting_players") {
    if (match.defender === null) return true;
    if (match.challenger === null) return groupIdx !== match.defender.groupIdx;
    return false;
  }
  if (GBState.phase === "selecting_next_challenger") return groupIdx === match.nextChallengerGroupIdx;
  return false;
}
function canSelectGroup(idx) {
  if (GBState.phase !== "selecting_groups") return false;
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (!pending) return false;
  return idx === pending.g1 || idx === pending.g2;
}

function renderArena() {
  const match = GBState.currentMatch;
  DOM.arenaPlayer1.classList.remove("winner-anim", "loser-anim", "filled");
  DOM.arenaPlayer2.classList.remove("winner-anim", "loser-anim", "filled");
  if (!match.defender && !match.challenger) {
    DOM.arenaPlayer1Name.textContent = "?"; DOM.arenaPlayer2Name.textContent = "?";
    DOM.arenaGroup1Label.textContent = "-"; DOM.arenaGroup2Label.textContent = "-";
    DOM.arenaRole1.textContent = "-"; DOM.arenaRole2.textContent = "-";
    return;
  }
  if (match.defender) {
    DOM.arenaPlayer1Name.textContent = match.defender.playerName;
    DOM.arenaGroup1Label.textContent = GBState.groups[match.defender.groupIdx].id + "组";
    DOM.arenaRole1.textContent = "守擂者";
    DOM.arenaPlayer1.classList.add("filled");
  } else { DOM.arenaPlayer1Name.textContent = "?"; DOM.arenaGroup1Label.textContent = "-"; DOM.arenaRole1.textContent = "-"; }
  if (match.challenger) {
    DOM.arenaPlayer2Name.textContent = match.challenger.playerName;
    DOM.arenaGroup2Label.textContent = GBState.groups[match.challenger.groupIdx].id + "组";
    DOM.arenaRole2.textContent = "挑战者";
    DOM.arenaPlayer2.classList.add("filled");
  } else { DOM.arenaPlayer2Name.textContent = "?"; DOM.arenaGroup2Label.textContent = "-"; DOM.arenaRole2.textContent = "-"; }
}

function renderActions() {
  const p = GBState.phase;
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  DOM.drawMusicBtn.classList.toggle("hidden", p !== "ready_to_battle" && p !== "music_drawn");
  DOM.startBattleBtn.classList.toggle("hidden", p !== "music_drawn");
  DOM.clearWinnerBtn.disabled = p !== "battling" && p !== "selecting_next_challenger" && p !== "match_end" && p !== "ready_to_battle" && p !== "music_playing";
  DOM.resetMatchBtn.classList.toggle("hidden", p !== "selecting_players" && p !== "ready_to_battle" && p !== "battling" && p !== "selecting_next_challenger" && p !== "match_end" && p !== "music_drawn" && p !== "music_playing");
  DOM.nextMatchBtn.classList.toggle("hidden", p !== "match_end" || !pending);
  DOM.nextRoundBtn.classList.toggle("hidden", p !== "match_end" || !!pending);
}

function renderHistory() {
  DOM.matchHistory.innerHTML = "";
  GBState.bracket.completedMatches.forEach((m) => {
    const item = document.createElement("div");
    item.className = "history-item";
    const g1 = GBState.groups[m.group1].id;
    const g2 = GBState.groups[m.group2].id;
    const winner = GBState.groups[m.winner].id;
    item.textContent = (m.label || "") + " " + g1 + "组 vs " + g2 + "组 -> " + winner + "组胜 (" + m.duelHistory.length + "场单挑)";
    DOM.matchHistory.appendChild(item);
  });
}

function handleReset() {
  if (!confirm("确定要重置第二大轮吗？")) return;
  localStorage.removeItem("groupBattleRound2");
  setupRound2();
  renderAll();
  showToast("已重置", "success");
}

function saveState() {
  try { localStorage.setItem("groupBattleStateR2", JSON.stringify(GBState)); } catch (e) {}
}

function showToast(message, type) {
  const toast = document.createElement("div");
  toast.className = "toast " + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2500);
}
