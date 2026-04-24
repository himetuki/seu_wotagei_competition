/**
 * 团体赛 - 第一大轮（初赛）
 * 人工分组 + 技池限制 + 复活 + 曲库自动匹配
 */

const GBState = {
  phase: "assigning",
  round: 1,
  allPlayers: [], oldPlayers: [], newPlayers: [],
  unassigned: [], selectedMember: null,
  groups: [
    { id: "A", members: [], eliminated: [], wins: 0, losses: 0, status: "active" },
    { id: "B", members: [], eliminated: [], wins: 0, losses: 0, status: "active" },
    { id: "C", members: [], eliminated: [], wins: 0, losses: 0, status: "active" },
    { id: "D", members: [], eliminated: [], wins: 0, losses: 0, status: "active" },
  ],
  currentMatch: { group1Idx: null, group2Idx: null, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null, nextChallengerGroupIdx: null, firstTrickLocked: false, selectedTrick: null },
  bracket: { pendingMatches: [], completedMatches: [] },
  undoStack: [],
  trickPool: [],
  musicListNew: [], musicListOld: [],
  revivalUsed: {},
};

const DOM = {};
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
      if (GBState.phase === "assigning" && GBState.allPlayers.length > 0 && GBState.unassigned.length === 0) {
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
  document.getElementById("reset-game-btn").addEventListener("click", handleReset);
  document.getElementById("home-btn").addEventListener("click", () => { window.location.href = "../html/index.html"; });
  DOM.unassignedPool.addEventListener("click", handleUnassignedClick);
  DOM.groupsGrid.addEventListener("click", handleGroupSectionClick);
  DOM.arenaPlayer1.addEventListener("click", () => selectArenaWinner(0));
  DOM.arenaPlayer2.addEventListener("click", () => selectArenaWinner(1));
  document.addEventListener("click", handleBattleModeClick);
  document.addEventListener("dblclick", handleDoubleClick);
  window.addEventListener("beforeunload", saveState);
}

function loadPlayers() {
  return Promise.all([
    fetch("../resource/json/player1.json").then((r) => r.json()),
    fetch("../resource/json/player2.json").then((r) => r.json()),
  ]).then(([oldData, newData]) => {
    GBState.oldPlayers = oldData.map((p) => p.name);
    GBState.newPlayers = newData.map((p) => p.name);
    GBState.allPlayers = [...GBState.oldPlayers, ...GBState.newPlayers];
    if (GBState.phase === "assigning" && GBState.unassigned.length === 0) {
      GBState.unassigned = [...GBState.allPlayers];
    }
    return true;
  }).catch((err) => { console.error(err); showToast("选手数据加载失败", "error"); return false; });
}

function loadTricks() {
  return fetch("../resource/json/tricks.json").then((r) => r.json())
    .then((data) => { GBState.trickPool = data.map((t) => t.name); return true; })
    .catch(() => { GBState.trickPool = []; return false; });
}

function loadMusic() {
  return Promise.all([
    fetch("../resource/json/musics_list.json").then((r) => r.json()).catch(() => []),
    fetch("../resource/json/musics_list_2.json").then((r) => r.json()).catch(() => []),
  ]).then(([newList, oldList]) => {
    GBState.musicListNew = newList;
    GBState.musicListOld = oldList;
    return true;
  });
}

// ==================== 人工分配 ====================
function handleUnassignedClick(e) {
  if (GBState.phase !== "assigning") return;
  const chip = e.target.closest(".member-chip");
  if (!chip) return;
  const name = chip.textContent;
  if (GBState.selectedMember === name) { GBState.selectedMember = null; renderAll(); return; }
  GBState.selectedMember = name; renderAll();
  showToast("已选中 " + name + "，请点击一个组", "info");
}

function handleGroupSectionClick(e) {
  const card = e.target.closest(".group-card");
  if (!card) return;
  const idx = parseInt(card.dataset.groupIdx);
  if (GBState.phase === "assigning") { handleAssignToGroup(idx, e); return; }
  if (GBState.phase === "selecting_groups") { handleSelectGroup(idx); return; }
}

function handleAssignToGroup(groupIdx, e) {
  const memberEl = e.target.closest(".member-name");
  if (memberEl) {
    const name = memberEl.textContent;
    const group = GBState.groups[groupIdx];
    if (group.members.includes(name)) {
      group.members = group.members.filter((m) => m !== name);
      GBState.unassigned.push(name);
      saveState(); renderAll();
      showToast(name + " 已回归未分配席", "info");
      return;
    }
  }
  if (!GBState.selectedMember) { showToast("请先从上方选择一名成员", "warning"); return; }
  if (GBState.groups[groupIdx].members.length >= 3) { showToast("该组已满", "warning"); return; }
  GBState.groups[groupIdx].members.push(GBState.selectedMember);
  GBState.unassigned = GBState.unassigned.filter((m) => m !== GBState.selectedMember);
  GBState.selectedMember = null;
  if (GBState.unassigned.length === 0) showToast("分配完成！点击「随机匹配对战组」", "success");
  saveState(); renderAll();
}

// ==================== 随机匹配对战组 ====================
let selectedGroupIdxs = [];
function handleMatchGroups() {
  if (GBState.phase !== "assigning") return;
  for (const g of GBState.groups) { if (g.members.length !== 3) { showToast("请确保每组都有3人", "warning"); return; } }
  const idxs = shuffle([0, 1, 2, 3]);
  GBState.bracket.pendingMatches = [
    { g1: idxs[0], g2: idxs[1], played: false },
    { g1: idxs[2], g2: idxs[3], played: false },
  ];
  GBState.phase = "selecting_groups";
  saveState(); renderAll();
  showToast("对战组已匹配！请选择对战的两个组", "success");
}

function handleSelectGroup(idx) {
  if (GBState.phase !== "selecting_groups") return;
  const group = GBState.groups[idx];
  if (group.status !== "active") return;
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
  GBState.currentMatch = { group1Idx: idx1, group2Idx: idx2, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null, nextChallengerGroupIdx: null, firstTrickLocked: true, selectedTrick: null };
  GBState.phase = "selecting_players";
  selectedGroupIdxs = [];
  determineMusicLibrary();
  saveState(); renderAll();
  showToast("请从两组中各选1名出战选手", "info");
}

// ==================== 曲库自动匹配 ====================
function determineMusicLibrary() {
  // 第一轮/第二轮：新vs新用 musics_list.json，其他用 musics_list_2.json
  // 在 confirmGroupSelection 时无法确定出战选手，所以根据组来判断
  // 简化：如果两组都包含新人，则使用新人曲库
  const match = GBState.currentMatch;
  const g1HasNew = GBState.groups[match.group1Idx].members.some((m) => GBState.newPlayers.includes(m));
  const g2HasNew = GBState.groups[match.group2Idx].members.some((m) => GBState.newPlayers.includes(m));
  // 实际上用户说"新vs新"，指出战选手都是新人时。但团体赛中我们不知道谁出战。
  // 简化处理：如果两组都包含新人，标注为可能使用新人曲库
  // 实际曲库在抽取音乐时根据当前出战选手判断
}

function getCurrentMusicLibrary() {
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return GBState.musicListOld;
  const dIsNew = GBState.newPlayers.includes(match.defender.playerName);
  const cIsNew = GBState.newPlayers.includes(match.challenger.playerName);
  return (dIsNew && cIsNew) ? GBState.musicListNew : GBState.musicListOld;
}

function getMusicLibName() {
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return "1年+曲库";
  const dIsNew = GBState.newPlayers.includes(match.defender.playerName);
  const cIsNew = GBState.newPlayers.includes(match.challenger.playerName);
  return (dIsNew && cIsNew) ? "新人赛曲库" : "1年+曲库";
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
      // 两名选手都已选定，自动进入 ready_to_battle 阶段
      GBState.phase = "ready_to_battle";
      saveState(); renderAll();
      showToast("选手已就位，请抽取音乐", "success");
      return;
    }
    if (match.challenger === null && groupIdx === match.defender.groupIdx) {
      showToast("请选择另一组的成员", "warning"); return;
    }
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
    DOM.currentMusicLib.style.color = "#fbbf24"; // 闪现时为黄色
    
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
      DOM.currentMusicLib.style.color = "#10b981"; // 最终结果为绿色
      
      saveState(); renderAll();
      DOM.drawMusicBtn.disabled = false;
      showToast("已抽取音乐：" + finalMusic + "  曲库：" + getMusicLibName(), "success");
    }
  }, flashInterval);
}

// ==================== 开始比赛 ====================
let battleStartTimer = null;

function handleStartBattle() {
  if (GBState.phase !== "music_drawn") return;

  document.body.classList.add("battle-mode");
  DOM.battleStartOverlay.classList.remove("hidden");
  DOM.battleStartText.classList.remove("hidden");

  // 播放battle start音效
  playBattleStartSound();

  const text = "BATTLE START";
  let current = "", i = 0;
  const interval = setInterval(() => {
    if (i < text.length) { current += text[i]; DOM.battleStartText.textContent = current; i++; }
    else { clearInterval(interval); }
  }, 130);

  setTimeout(() => { DOM.clickToStop.classList.remove("hidden"); }, 1500);
  battleStartTimer = setTimeout(() => { endBattleStart(); }, 4500);
}

function playBattleStartSound() {
  // 检查音效是否启用
  const soundEnabled = localStorage.getItem("battleStartSoundEnabled");
  if (soundEnabled === "false") return;
  
  // 创建音效播放器
  const soundPlayer = document.getElementById("battle-start-sound") || createBattleStartSound();
  if (soundPlayer) {
    soundPlayer.currentTime = 0;
    soundPlayer.play().catch(err => console.log("音效播放失败:", err));
  }
}

function createBattleStartSound() {
  const audio = document.createElement("audio");
  audio.id = "battle-start-sound";
  audio.src = "../resource/sounds/battle_start.mp3";
  audio.volume = 0.5;
  document.body.appendChild(audio);
  return audio;
}

function endBattleStart() {
  // 防止 race condition：如果 battle-mode 已经被移除了，直接返回
  if (!document.body.classList.contains("battle-mode")) return;
  
  // 隐藏动画元素，但保持 battle-mode 以显示背景
  DOM.battleStartOverlay.classList.add("hidden");
  DOM.battleStartText.classList.add("hidden");
  DOM.clickToStop.classList.add("hidden");
  DOM.battleStartText.textContent = "";

  // 播放音乐并隐藏所有元素
  const player = document.getElementById("music-player");
  if (player.src) {
    player.play().catch(err => {
      console.error("音乐播放失败:", err);
      showToast("音乐播放失败，请检查文件", "error");
    });
    GBState.phase = "music_playing";
    saveState(); renderAll();
    showToast("双击屏幕退出播放", "info");
    
    // 监听音乐播放完毕事件
    player.onended = () => {
      console.log("音乐播放完毕");
      stopMusicPlaying();
    };
  } else {
    document.body.classList.remove("battle-mode");
    GBState.phase = "battling";
    saveState(); renderAll();
    showToast("对战开始！请点击胜者", "info");
  }
}

function stopMusicPlaying() {
  const player = document.getElementById("music-player");
  player.pause();
  player.currentTime = 0;
  document.body.classList.remove("battle-mode");
  GBState.phase = "battling";
  saveState(); renderAll();
  showToast("对战开始！请点击胜者", "info");
}

function handleBattleModeClick(e) {
  if (!document.body.classList.contains("battle-mode")) return;
  if (battleStartTimer) { clearTimeout(battleStartTimer); battleStartTimer = null; }
  // 只有在 Battle Start 动画阶段才直接结束动画
  if (GBState.phase === "music_drawn" || GBState.phase === "music_playing") {
    endBattleStart();
  }
}

function handleDoubleClick(e) {
  if (GBState.phase !== "music_playing") return;
  stopMusicPlaying();
}

// 音乐播放器错误处理
document.addEventListener("DOMContentLoaded", () => {
  const player = document.getElementById("music-player");
  if (player) {
    player.addEventListener("error", (e) => {
      console.error("音频加载错误:", e);
      showToast("音频文件加载失败", "error");
    });
  }
});

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
  if (!loserGroup.eliminated.includes(loser.playerName)) {
    loserGroup.eliminated.push(loser.playerName);
  }
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

// ==================== 赛后检查 ====================
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
  GBState.bracket.completedMatches.push({ round: 1, stage: "initial", group1: winnerGroupIdx, group2: loserGroupIdx, winner: winnerGroupIdx, duelHistory: [...match.duelHistory] });
  pushUndo({ type: "finish_match", winnerGroupIdx, loserGroupIdx });
  GBState.phase = "match_end";
  saveState(); renderAll();
  showToast(GBState.groups[winnerGroupIdx].id + "组 获胜！", "success");
}

// ==================== 复活功能 ====================
function handleRevive(groupIdx, playerName) {
  if (!canRevive(playerName)) { showToast("该选手无法复活", "warning"); return; }
  const group = GBState.groups[groupIdx];
  group.eliminated = group.eliminated.filter((n) => n !== playerName);
  GBState.revivalUsed[playerName] = true;
  pushUndo({ type: "revive", groupIdx, playerName });
  saveState(); renderAll();
  showToast(playerName + " 已复活！", "success");
}

// ==================== 进入下一场 / 下一大轮 ====================
function handleResetMatch() {
  if (!confirm("确定要重置当前对战吗？分组结果和已完成场次将保留。")) return;
  const match = GBState.currentMatch;
  // 恢复当前对战中被淘汰的成员
  // 1. 恢复当前 loser
  if (match.loser) {
    const g = GBState.groups[match.loser.groupIdx];
    g.eliminated = g.eliminated.filter((n) => n !== match.loser.playerName);
  }
  // 2. 恢复 duelHistory 中的所有 loser
  match.duelHistory.forEach((d) => {
    if (d.loser) {
      const g = GBState.groups[d.loser.groupIdx];
      g.eliminated = g.eliminated.filter((n) => n !== d.loser.playerName);
    }
  });
  // 3. 清空当前 match（保留 group1Idx 和 group2Idx）
  const g1 = match.group1Idx;
  const g2 = match.group2Idx;
  GBState.currentMatch = {
    group1Idx: g1, group2Idx: g2,
    defender: null, challenger: null, winner: null, loser: null,
    duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null,
    nextChallengerGroupIdx: null, firstTrickLocked: true, selectedTrick: null,
  };
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
    // 还有下一场初赛
    GBState.currentMatch = { group1Idx: null, group2Idx: null, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null, nextChallengerGroupIdx: null, firstTrickLocked: true, selectedTrick: null };
    GBState.phase = "selecting_groups";
    selectedGroupIdxs = [];
    saveState(); renderAll();
    showToast("请进行下一场对战", "info");
  } else {
    // 初赛全部结束，显示进入第二大轮按钮
    showToast("初赛全部结束！请点击「进入第二大轮」", "success");
    DOM.nextMatchBtn.classList.add("hidden");
    DOM.nextRoundBtn.classList.remove("hidden");
  }
}

function handleNextRound() {
  // 保存第一轮结果，跳转到第二大轮
  const round1Result = {
    round: 1,
    groups: GBState.groups.map((g) => ({ id: g.id, wins: g.wins, losses: g.losses, status: g.status, members: g.members })),
    completedMatches: GBState.bracket.completedMatches,
    revivalUsed: GBState.revivalUsed,
  };
  localStorage.setItem("groupBattleRound1", JSON.stringify(round1Result));
  fetch("http://localhost:3000/api/group-battle-process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ round1Result, currentState: GBState }),
  }).catch((err) => console.error("保存第一轮结果失败:", err));
  window.location.href = "../html/group_battle_2.html";
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
  renderUnassigned();
  renderGroups();
  renderTrickPool();
  renderArena();
  renderActions();
  renderHistory();
}

function renderVisibility() {
  const p = GBState.phase;
  DOM.unassignedSection.classList.toggle("hidden", p !== "assigning");
  DOM.trickPoolSection.classList.toggle("hidden", p === "assigning" || p === "selecting_groups" || p === "finished" || !GBState.currentMatch.firstTrickLocked);
  DOM.musicInfoSection.classList.toggle("hidden", p === "assigning" || p === "selecting_groups");
  DOM.battleArena.classList.toggle("hidden", p !== "selecting_players" && p !== "ready_to_battle" && p !== "music_drawn" && p !== "battling" && p !== "selecting_winner_anim" && p !== "selecting_next_challenger" && p !== "match_end" && p !== "music_playing");
}

function renderStatus() {
  DOM.bracketStatus.textContent = "第一大轮 - 初赛";
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  const match = GBState.currentMatch;
  let hint = "";
  switch (GBState.phase) {
    case "assigning": hint = "请将12名成员分配到4个组中（每组3人）"; break;
    case "selecting_groups": hint = "请选择对战的两个组" + (pending ? "（" + GBState.groups[pending.g1].id + "组 vs " + GBState.groups[pending.g2].id + "组）" : ""); break;
    case "selecting_players": 
      hint = "请从两组中各选1名出战选手（再次点击可回归）"; 
      break;
    case "ready_to_battle": 
      if (match.defender && match.challenger) {
        hint = "选手已就位，可继续更改选手或点击「抽取音乐」";
      } else {
        hint = "请从两组中各选1名出战选手";
      }
      break;
    case "music_drawn": 
      hint = "已抽取音乐，可更改选手（将重新抽取）或点击「开始比赛」"; 
      break;
    case "music_playing": hint = "音乐播放中… 双击屏幕结束播放"; break;
    case "battling": hint = "对战开始！请点击胜者  当前曲库：" + getMusicLibName(); break;
    case "selecting_winner_anim": hint = "结果确认中..."; break;
    case "selecting_next_challenger": hint = GBState.groups[GBState.currentMatch.nextChallengerGroupIdx].id + "组 请派出下一位挑战者"; break;
    case "match_end": hint = "本场结束！"; break;
    default: hint = "...";
  }
  DOM.systemHint.textContent = hint;
  
  // 更新当前曲库显示
  if (match.defender && match.challenger) {
    const musicLibName = getMusicLibName();
    const drawnMusic = match.drawnMusic || "-";
    DOM.currentMusicLib.textContent = musicLibName + " | " + drawnMusic;
  } else {
    DOM.currentMusicLib.textContent = "-";
  }
}

function renderUnassigned() {
  DOM.unassignedPool.innerHTML = "";
  GBState.unassigned.forEach((name) => {
    const el = document.createElement("div");
    el.className = "member-chip";
    if (GBState.selectedMember === name) el.classList.add("selected");
    el.textContent = name;
    DOM.unassignedPool.appendChild(el);
  });
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

    // 只显示当前对战的组（匹配后）
    if (GBState.phase !== "assigning" && activeIdxs.length > 0 && !activeIdxs.includes(idx)) {
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
        // 复活按钮（新人且未使用过复活）
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
      if (isRecommendedGroup(idx)) card.classList.add("recommended");
      if (selectedGroupIdxs.includes(idx)) card.classList.add("selected-group");
    }
    if (GBState.phase === "assigning") {
      card.classList.add("selectable-group");
    }

    DOM.groupsGrid.appendChild(card);
  });
}

function renderTrickPool() {
  DOM.trickPool.innerHTML = "";
  if (GBState.phase === "assigning" || GBState.phase === "selecting_groups" || GBState.phase === "finished") return;
  const match = GBState.currentMatch;
  if (!match.firstTrickLocked) return;

  const info = document.createElement("p");
  info.style.color = "#888";
  info.style.fontSize = "0.85rem";
  info.style.marginBottom = "8px";
  info.textContent = "请从技池中点击选择一个技作为首个技";
  DOM.trickPool.appendChild(info);

  GBState.trickPool.forEach((trick) => {
    const el = document.createElement("span");
    el.className = "trick-chip";
    el.textContent = trick;
    if (match.selectedTrick === trick) {
      el.classList.add("selected-trick");
    }
    el.addEventListener("click", () => {
      match.selectedTrick = trick;
      saveState(); renderAll();
      showToast("已选择首个技：" + trick, "success");
    });
    DOM.trickPool.appendChild(el);
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
  
  // 允许在选择选手、准备对战、已抽取音乐阶段选择选手
  if (GBState.phase === "selecting_players" || GBState.phase === "ready_to_battle" || GBState.phase === "music_drawn") {
    if (match.defender === null) return true;
    if (match.challenger === null) return groupIdx !== match.defender.groupIdx;
    return false;
  }
  if (GBState.phase === "selecting_next_challenger") {
    return groupIdx === match.nextChallengerGroupIdx;
  }
  return false;
}

function canSelectGroup(idx) {
  if (GBState.phase !== "selecting_groups") return false;
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (!pending) return false;
  return idx === pending.g1 || idx === pending.g2;
}
function isRecommendedGroup(idx) { const pending = GBState.bracket.pendingMatches.find((m) => !m.played); return pending ? (idx === pending.g1 || idx === pending.g2) : false; }

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
  DOM.matchGroupsBtn.classList.toggle("hidden", p !== "assigning" || GBState.unassigned.length > 0);
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
    item.textContent = g1 + "组 vs " + g2 + "组 -> " + winner + "组胜 (" + m.duelHistory.length + "场单挑)";
    DOM.matchHistory.appendChild(item);
  });
}

// ==================== 重置 & 持久化 ====================
function handleReset() {
  if (!confirm("确定要重置团体赛吗？所有进度将丢失。")) return;
  GBState.phase = "assigning";
  GBState.unassigned = [...GBState.allPlayers];
  GBState.selectedMember = null;
  GBState.groups.forEach((g) => { g.members = []; g.eliminated = []; g.wins = 0; g.losses = 0; g.status = "active"; });
  GBState.currentMatch = { group1Idx: null, group2Idx: null, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null, nextChallengerGroupIdx: null, firstTrickLocked: true, selectedTrick: null };
  GBState.bracket = { pendingMatches: [], completedMatches: [] };
  GBState.undoStack = [];
  GBState.revivalUsed = {};
  selectedGroupIdxs = [];
  localStorage.removeItem("groupBattleState");
  fetch("http://localhost:3000/api/clear-group-battle-process", { method: "POST" }).catch(() => {});
  renderAll();
  showToast("已重置", "success");
}

function saveState() {
  try { localStorage.setItem("groupBattleState", JSON.stringify(GBState)); } catch (e) {}
  fetch("http://localhost:3000/api/group-battle-process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(GBState) }).catch(() => {});
}

function loadState() {
  try { const s = localStorage.getItem("groupBattleState"); if (s) Object.assign(GBState, JSON.parse(s)); } catch (e) {}
}

function loadStateFromServer() {
  return fetch("http://localhost:3000/api/group-battle-process").then((r) => r.json())
    .then((data) => { if (data && data.currentState) { Object.assign(GBState, data.currentState); return true; } return false; })
    .catch(() => false);
}

function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function showToast(message, type) {
  const toast = document.createElement("div");
  toast.className = "toast " + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2500);
}
