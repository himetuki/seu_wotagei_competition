/**
 * 团体赛 - 第三大轮（决赛）
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

function loadRound2Data() {
  return new Promise((resolve) => {
    const local = localStorage.getItem("groupBattleRound2");
    if (local) { try { GBState.round2Data = JSON.parse(local); resolve(); return; } catch (e) {} }
    fetch("http://localhost:3000/api/group-battle-process")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.currentState) {
          const gs = data.currentState.groups;
          const completed = data.currentState.bracket ? data.currentState.bracket.completedMatches : [];
          if (completed.length >= 2) {
            GBState.round2Data = { groups: gs, completedMatches: completed };
          }
        }
        resolve();
      })
      .catch(() => resolve());
  });
}

function setupRound3() {
  const r2 = GBState.round2Data;
  GBState.groups = r2.groups.map((g) => ({ ...g, eliminated: [], members: g.members }));
  Promise.all([
    fetch("../resource/json/player1.json").then((r) => r.json()),
    fetch("../resource/json/player2.json").then((r) => r.json()),
    fetch("../resource/json/musics_list.json").then((r) => r.json()).catch(() => []),
    fetch("../resource/json/musics_list_ex.json").then((r) => r.json()).catch(() => []),
  ]).then(([oldData, newData, newList, exList]) => {
    GBState.oldPlayers = oldData.map((p) => p.name);
    GBState.newPlayers = newData.map((p) => p.name);
    GBState.allPlayers = [...GBState.oldPlayers, ...GBState.newPlayers];
    GBState.musicListNew = newList;
    GBState.musicListEx = exList;

    // 按胜场排序，确定名次
    const sorted = [...GBState.groups].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    const ranks = sorted.map((g) => GBState.groups.indexOf(g));
    // 季军赛：第3 vs 第4
    // 冠亚军赛：第1 vs 第2
    const matches = [];
    if (ranks.length >= 4) {
      matches.push({ g1: ranks[2], g2: ranks[3], played: false, label: "季军赛" });
      matches.push({ g1: ranks[0], g2: ranks[1], played: false, label: "冠亚军赛" });
    } else if (ranks.length >= 2) {
      matches.push({ g1: ranks[0], g2: ranks[1], played: false, label: "冠亚军赛" });
    }
    GBState.bracket.pendingMatches = matches;
    GBState.phase = matches.length > 0 ? "selecting_groups" : "finished";
    renderAll();
  });
}

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
  GBState.currentMatch = { group1Idx: idx1, group2Idx: idx2, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null };
  GBState.phase = "selecting_players";
  selectedGroupIdxs = [];
  saveState(); renderAll();
  showToast("请从两组中各选1名出战选手", "info");
}

function handleMemberClick(groupIdx, playerName, e) {
  e.stopPropagation();
  const match = GBState.currentMatch;
  // 回归功能
  if (match.defender && match.defender.groupIdx === groupIdx && match.defender.playerName === playerName) {
    match.defender = null; pushUndo({ type: "return_defender", groupIdx, playerName }); saveState(); renderAll(); return;
  }
  if (match.challenger && match.challenger.groupIdx === groupIdx && match.challenger.playerName === playerName) {
    match.challenger = null; pushUndo({ type: "return_challenger", groupIdx, playerName }); saveState(); renderAll(); return;
  }
  if (GBState.phase === "selecting_players") {
    if (match.defender === null) {
      match.defender = { groupIdx, playerName, role: "defender" };
      pushUndo({ type: "select_defender", groupIdx, playerName });
      saveState(); renderAll();
      if (match.challenger !== null) enterReadyPhase();
      return;
    }
    if (match.challenger === null && groupIdx !== match.defender.groupIdx) {
      match.challenger = { groupIdx, playerName, role: "challenger" };
      pushUndo({ type: "select_challenger", groupIdx, playerName });
      saveState(); renderAll();
      if (match.defender !== null) enterReadyPhase();
      return;
    }
    if (match.challenger === null && groupIdx === match.defender.groupIdx) { showToast("请选择另一组的成员", "warning"); return; }
  }
}

function enterReadyPhase() {
  GBState.phase = "ready_to_battle";
  saveState(); renderAll();
  showToast("选手已就位！请先抽取音乐", "info");
}

function getMusicLibName() {
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return "4强赛曲库";
  const dIsNew = GBState.newPlayers.includes(match.defender.playerName);
  const cIsNew = GBState.newPlayers.includes(match.challenger.playerName);
  return (dIsNew && cIsNew) ? "新人赛曲库" : "4强赛曲库";
}

function getCurrentMusicLibrary() {
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return GBState.musicListEx;
  const dIsNew = GBState.newPlayers.includes(match.defender.playerName);
  const cIsNew = GBState.newPlayers.includes(match.challenger.playerName);
  return (dIsNew && cIsNew) ? GBState.musicListNew : GBState.musicListEx;
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
      player.src = "../resource/musics/1yearplus/" + finalMusic;
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

// ==================== 选胜者（1v1单轮决胜） ====================
function selectArenaWinner(arenaIdx) {
  if (GBState.phase !== "battling") return;
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return;
  const p1IsDefender = DOM.arenaRole1.textContent === "守擂者";
  let winner, loser;
  if (arenaIdx === 0) { winner = p1IsDefender ? match.defender : match.challenger; loser = p1IsDefender ? match.challenger : match.defender; }
  else { winner = p1IsDefender ? match.challenger : match.defender; loser = p1IsDefender ? match.defender : match.challenger; }
  match.winner = winner; match.loser = loser;
  pushUndo({ type: "select_winner", winner, loser });
  GBState.phase = "selecting_winner_anim";
  saveState(); renderAll();
  playResultAnimations(winner, loser, () => { finishMatch(winner.groupIdx, loser.groupIdx); });
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

function finishMatch(winnerGroupIdx, loserGroupIdx) {
  const match = GBState.currentMatch;
  match.duelHistory.push({ defender: { ...match.defender }, challenger: { ...match.challenger }, winner: { ...match.winner }, loser: { ...match.loser } });
  GBState.groups[winnerGroupIdx].wins++;
  GBState.groups[loserGroupIdx].losses++;
  match.matchWinnerGroupIdx = winnerGroupIdx;
  match.matchLoserGroupIdx = loserGroupIdx;
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (pending) { pending.played = true; pending.winner = winnerGroupIdx; pending.loser = loserGroupIdx; }
  GBState.bracket.completedMatches.push({ round: 3, stage: "final", group1: winnerGroupIdx, group2: loserGroupIdx, winner: winnerGroupIdx, duelHistory: [...match.duelHistory], label: pending ? pending.label : "" });
  pushUndo({ type: "finish_match", winnerGroupIdx, loserGroupIdx });
  GBState.phase = "match_end";
  saveState(); renderAll();
  showToast(GBState.groups[winnerGroupIdx].id + "组 获胜！", "success");
}

function handleResetMatch() {
  if (!confirm("确定要重置当前对战吗？已完成场次将保留。")) return;
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
  GBState.currentMatch = { group1Idx: g1, group2Idx: g2, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null };
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
    GBState.currentMatch = { group1Idx: null, group2Idx: null, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null };
    GBState.phase = "selecting_groups";
    selectedGroupIdxs = [];
    saveState(); renderAll();
    showToast("请进行下一场对战", "info");
  } else {
    DOM.nextMatchBtn.classList.add("hidden");
    DOM.finishBtn.classList.remove("hidden");
    showToast("全部比赛结束！请点击「比赛结束」查看结果", "success");
  }
}

function handleFinish() {
  const sorted = [...GBState.groups].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  const ranks = sorted.map((g) => g.id);
  
  // 保存最终结果
  const finalResult = { 
    round: 3, 
    groups: GBState.groups.map((g) => ({ id: g.id, wins: g.wins, losses: g.losses })), 
    completedMatches: GBState.bracket.completedMatches, 
    finalRank: ranks 
  };
  
  // 保存到 localStorage
  localStorage.setItem("groupBattleFinal", JSON.stringify(finalResult));
  
  // 保存到服务器
  fetch("http://localhost:3000/api/group-battle-process", {
    method: "POST", 
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ finalResult, currentState: GBState }),
  }).catch(() => {});
  
  // 跳转到排名展示页面
  window.location.href = "../html/team_rank.html";
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
    case "select_winner":
      match.winner = null; match.loser = null;
      GBState.phase = "battling"; break;
    case "finish_match":
      GBState.groups[action.winnerGroupIdx].wins--;
      GBState.groups[action.loserGroupIdx].losses--;
      { const last = GBState.bracket.completedMatches.pop(); if (last) { const p = GBState.bracket.pendingMatches.find((m) => m.played); if (p) p.played = false; } }
      match.matchWinnerGroupIdx = null; match.matchLoserGroupIdx = null;
      GBState.phase = "match_end"; break;
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
  DOM.battleArena.classList.toggle("hidden", p !== "selecting_players" && p !== "ready_to_battle" && p !== "music_drawn" && p !== "battling" && p !== "selecting_winner_anim" && p !== "match_end" && p !== "music_playing");
  DOM.musicInfoSection.classList.toggle("hidden", p === "selecting_groups" || p === "loading");
}
function renderStatus() {
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  DOM.bracketStatus.textContent = pending ? "第三大轮 - " + pending.label : "第三大轮 - 结束";
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
  const match = GBState.currentMatch;
  // 回归功能：已在对战席的成员允许点击回归
  if (match.defender && match.defender.groupIdx === groupIdx && match.defender.playerName === playerName) return true;
  if (match.challenger && match.challenger.groupIdx === groupIdx && match.challenger.playerName === playerName) return true;
  if (GBState.phase === "selecting_players") {
    if (match.defender === null) return true;
    if (match.challenger === null) return groupIdx !== match.defender.groupIdx;
    return false;
  }
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
    DOM.arenaRole1.textContent = "选手1";
    DOM.arenaPlayer1.classList.add("filled");
  } else { DOM.arenaPlayer1Name.textContent = "?"; DOM.arenaGroup1Label.textContent = "-"; DOM.arenaRole1.textContent = "-"; }
  if (match.challenger) {
    DOM.arenaPlayer2Name.textContent = match.challenger.playerName;
    DOM.arenaGroup2Label.textContent = GBState.groups[match.challenger.groupIdx].id + "组";
    DOM.arenaRole2.textContent = "选手2";
    DOM.arenaPlayer2.classList.add("filled");
  } else { DOM.arenaPlayer2Name.textContent = "?"; DOM.arenaGroup2Label.textContent = "-"; DOM.arenaRole2.textContent = "-"; }
}

function renderActions() {
  const p = GBState.phase;
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  DOM.drawMusicBtn.classList.toggle("hidden", p !== "ready_to_battle" && p !== "music_drawn");
  DOM.startBattleBtn.classList.toggle("hidden", p !== "music_drawn");
  DOM.clearWinnerBtn.disabled = p !== "battling" && p !== "match_end" && p !== "ready_to_battle" && p !== "music_playing";
  DOM.resetMatchBtn.classList.toggle("hidden", p !== "selecting_players" && p !== "ready_to_battle" && p !== "battling" && p !== "match_end" && p !== "music_drawn" && p !== "music_playing");
  DOM.nextMatchBtn.classList.toggle("hidden", p !== "match_end" || !pending);
  DOM.finishBtn.classList.toggle("hidden", p !== "match_end" || !!pending);
}

function renderHistory() {
  DOM.matchHistory.innerHTML = "";
  GBState.bracket.completedMatches.forEach((m) => {
    const item = document.createElement("div");
    item.className = "history-item";
    const g1 = GBState.groups[m.group1].id;
    const g2 = GBState.groups[m.group2].id;
    const winner = GBState.groups[m.winner].id;
    item.textContent = (m.label || "") + " " + g1 + "组 vs " + g2 + "组 -> " + winner + "组胜";
    DOM.matchHistory.appendChild(item);
  });
}

function handleReset() {
  if (!confirm("确定要重置第三大轮吗？")) return;
  localStorage.removeItem("groupBattleRound2");
  setupRound3();
  renderAll();
  showToast("已重置", "success");
}

function saveState() {
  try { localStorage.setItem("groupBattleStateR3", JSON.stringify(GBState)); } catch (e) {}
}

function showToast(message, type) {
  const toast = document.createElement("div");
  toast.className = "toast " + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2500);
}
