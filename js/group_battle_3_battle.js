/**
 * 团体赛 - 第三大轮（决赛）
 * 选组 + 选手选择 + 抽取音乐 + 开始比赛 + 选胜者 + 赛后处理 + handleFinish
 */

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
  GBState.currentMatch = { group1Idx: idx1, group2Idx: idx2, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null };
  GBState.phase = "selecting_players";
  selectedGroupIdxs = [];
  saveState(); renderAll();
  showToast("请从两组中各1名出战选手", "info");
}

// ==================== 选手选择 ====================
function handleMemberClick(groupIdx, playerName, e) {
  e.stopPropagation();
  const match = GBState.currentMatch;
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

// ==================== 抽取音乐 ====================
function handleDrawMusic() {
  if (GBState.phase === "battling" || GBState.phase === "music_playing") {
    const player = document.getElementById("music-player");
    player.pause();
    player.currentTime = 0;
    player.src = "";
    document.body.classList.remove("battle-mode");
  }
  if (
    GBState.phase !== "ready_to_battle" &&
    GBState.phase !== "music_drawn" &&
    GBState.phase !== "battling" &&
    GBState.phase !== "music_playing"
  )
    return;
  const lib = getCurrentMusicLibrary();
  if (lib.length === 0) { showToast("音乐列表为空", "error"); return; }

  DOM.drawMusicBtn.disabled = true;

  const flashCount = 15;
  const flashInterval = 80;
  let currentFlash = 0;

  const flashTimer = setInterval(() => {
    const randomIdx = Math.floor(Math.random() * lib.length);
    const flashMusic = lib[randomIdx];
    updateMusicInfo(flashMusic, getMusicLibName());

    currentFlash++;

    if (currentFlash >= flashCount) {
      clearInterval(flashTimer);

      const finalIdx = Math.floor(Math.random() * lib.length);
      const finalMusic = lib[finalIdx];

      const player = document.getElementById("music-player");
      player.src = "../resource/musics/" + getMusicFolder() + "/" + finalMusic;
      GBState.currentMatch.drawnMusic = finalMusic;
      GBState.phase = "music_drawn";

      updateMusicInfo(finalMusic, getMusicLibName());

      saveState(); renderAll();
      DOM.drawMusicBtn.disabled = false;
      showToast("已抽取音乐：" + finalMusic + "  曲库：" + getMusicLibName(), "success");
    }
  }, flashInterval);
}

// ==================== 开始比赛 ====================
let battleStartTimer = null;

function handleStartBattle() {
  if (GBState.phase === "battling" || GBState.phase === "music_playing") {
    replayBattleMusic();
    return;
  }
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
  DOM.battleStartOverlay.classList.add("hidden");
  DOM.battleStartText.classList.add("hidden");
  DOM.clickToStop.classList.add("hidden");
  DOM.battleStartText.textContent = "";

  const player = document.getElementById("music-player");
  if (player.src) {
    player.play().catch(err => {
      console.error("音乐播放失败:", err);
      showToast("音乐播放失败，已跳过音频播放", "warning");
      stopMusicPlaying();
    });
    GBState.phase = "battling";
    saveState(); renderAll();
    showToast("音乐播放中，可直接点胜者或双击停止音乐", "info");

    player.onended = () => {
      player.pause();
      player.currentTime = 0;
      document.body.classList.remove("battle-mode");
      showToast("音乐播放完毕，可继续判定胜者或点击开始比赛重新播放", "info");
    };
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
  if (GBState.phase === "music_drawn") {
    endBattleStart();
  }
}

function handleDoubleClick(e) {
  if (GBState.phase !== "battling" && GBState.phase !== "music_playing") return;
  stopMusicPlaying();
}

function replayBattleMusic() {
  const player = document.getElementById("music-player");
  if (!player.src) {
    showToast("请先抽取音乐", "warning");
    return;
  }
  document.body.classList.add("battle-mode");
  player.currentTime = 0;
  player.play().catch((err) => {
    console.error("音乐播放失败:", err);
    showToast("音乐播放失败", "warning");
    document.body.classList.remove("battle-mode");
  });
  GBState.phase = "battling";
  saveState(); renderAll();
  showToast("重新播放中，可直接点胜者或双击停止", "info");

  player.onended = () => {
    player.pause();
    player.currentTime = 0;
    document.body.classList.remove("battle-mode");
    showToast("音乐播放完毕，可继续判定胜者或点击开始比赛重新播放", "info");
  };
}

function stopMusicPlaying(returnToMusicDrawn = false) {
  const player = document.getElementById("music-player");
  player.pause();
  player.currentTime = 0;
  document.body.classList.remove("battle-mode");
  GBState.phase = returnToMusicDrawn ? "music_drawn" : "battling";
  saveState(); renderAll();
  if (returnToMusicDrawn) {
    showToast("已退出播放，可重新抽取音乐或开始比赛", "info");
  } else {
    showToast("音乐已停止，请点击胜者", "info");
  }
}

// ==================== 选胜者（1v1单轮决胜）====================
function selectArenaWinner(arenaIdx) {
  if (GBState.phase !== "battling") return;
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return;
  const p1IsDefender = DOM.arenaRole1.textContent === "选手1";
  let winner, loser;
  if (arenaIdx === 0) { winner = p1IsDefender ? match.defender : match.challenger; loser = p1IsDefender ? match.challenger : match.defender; }
  else { winner = p1IsDefender ? match.challenger : match.defender; loser = p1IsDefender ? match.defender : match.challenger; }
  match.winner = winner; match.loser = loser;
  pushUndo({ type: "select_winner", winner, loser });
  GBState.phase = "selecting_winner_anim";
  saveState(); renderAll();
  playResultAnimations(winner, loser, () => { finishMatch(winner.groupIdx, loser.groupIdx); });
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
  showToast(GBState.groups[winnerGroupIdx].id + "组获胜！", "success");
}

// ==================== 进入下一场 / 比赛结束 ====================
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
    const hasGrandFinal = GBState.bracket.completedMatches.some((m) => m.label === "总决赛");
    if (!hasGrandFinal && GBState.grandFinalSeedGroupIdx !== null) {
      const last = GBState.bracket.completedMatches[GBState.bracket.completedMatches.length - 1];
      if (last) {
        GBState.bracket.pendingMatches.push({
          g1: GBState.grandFinalSeedGroupIdx,
          g2: last.winner,
          played: false,
          label: "总决赛",
        });
        GBState.currentMatch = { group1Idx: null, group2Idx: null, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null };
        GBState.phase = "selecting_groups";
        selectedGroupIdxs = [];
        saveState(); renderAll();
        showToast("败者组决赛结束，进入总决赛", "success");
        return;
      }
    }

    showToast("全部比赛结束！即将自动跳转结果页", "success");
    setTimeout(() => {
      handleFinish();
    }, 1500);
  }
}

function handleFinish() {
  const grand = GBState.bracket.completedMatches.find((m) => m.label === "总决赛");
  const lb = GBState.bracket.completedMatches.find((m) => m.label === "败者组决赛");
  let ranks = [];
  if (grand && lb) {
    const first = GBState.groups[grand.winner].id;
    const secondGroupIdx = grand.group1 === grand.winner ? grand.group2 : grand.group1;
    const second = GBState.groups[secondGroupIdx].id;
    const thirdGroupIdx = lb.group1 === lb.winner ? lb.group2 : lb.group1;
    const third = GBState.groups[thirdGroupIdx].id;
    const rest = GBState.groups.map((g) => g.id).filter((id) => id !== first && id !== second && id !== third);
    ranks = [first, second, third, ...(rest.length ? [rest[0]] : [])];
  } else {
    const sorted = [...GBState.groups].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    ranks = sorted.map((g) => g.id);
  }

  const finalResult = {
    round: 3,
    groups: GBState.groups.map((g) => ({ id: g.id, wins: g.wins, losses: g.losses })),
    completedMatches: GBState.bracket.completedMatches,
    finalRank: ranks
  };

  localStorage.setItem("groupBattleFinal", JSON.stringify(finalResult));

  fetch("http://localhost:3000/api/group-battle-process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ finalResult, currentState: GBState }),
  }).catch(() => {});

  window.location.href = "../html/team_rank.html";
}
