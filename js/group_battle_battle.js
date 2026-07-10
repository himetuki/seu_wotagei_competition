/**
 * 团体赛 - 第一大轮（初赛）
 * 抽取音乐 + 开始比赛 + 选胜者 + 赛后检查 + 进入下一场/下一大轮
 */

// ==================== 抽取音乐 ====================
function handleDrawMusic() {
  // 在 battling / music_playing 阶段先停止当前音乐再重新抽取
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
  if (lib.length === 0) {
    showToast("音乐列表为空", "error");
    return;
  }

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
      const musicFolder = getMusicFolder();
      player.src = "../resource/musics/" + musicFolder + "/" + finalMusic;
      GBState.currentMatch.drawnMusic = finalMusic;
      GBState.phase = "music_drawn";

      updateMusicInfo(finalMusic, getMusicLibName());

      saveState();
      renderAll();
      DOM.drawMusicBtn.disabled = false;
      showToast(
        "已抽取音乐：" + finalMusic + "  曲库：" + getMusicLibName(),
        "success",
      );
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

  playBattleStartSound();

  const text = "BATTLE START";
  let current = "",
    i = 0;
  const interval = setInterval(() => {
    if (i < text.length) {
      current += text[i];
      DOM.battleStartText.textContent = current;
      i++;
    } else {
      clearInterval(interval);
    }
  }, 130);

  setTimeout(() => {
    DOM.clickToStop.classList.remove("hidden");
  }, 1500);
  battleStartTimer = setTimeout(() => {
    endBattleStart();
  }, 4500);
}

function playBattleStartSound() {
  const soundEnabled = localStorage.getItem("battleStartSoundEnabled");
  if (soundEnabled === "false") return;

  const soundPlayer =
    document.getElementById("battle-start-sound") || createBattleStartSound();
  if (soundPlayer) {
    soundPlayer.currentTime = 0;
    soundPlayer.play().catch((err) => console.log("音效播放失败:", err));
  }
}

function createBattleStartSound() {
  console.log("battle_start 音效文件不存在，跳过播放");
  return null;
}

function endBattleStart() {
  if (!document.body.classList.contains("battle-mode")) return;

  DOM.battleStartOverlay.classList.add("hidden");
  DOM.battleStartText.classList.add("hidden");
  DOM.clickToStop.classList.add("hidden");
  DOM.battleStartText.textContent = "";

  const player = document.getElementById("music-player");
  if (player.src) {
    player.play().catch((err) => {
      console.error("音乐播放失败:", err);
      showToast("音乐播放失败，已跳过音频播放", "warning");
      stopMusicPlaying();
    });
    GBState.phase = "battling";
    saveState();
    renderAll();
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
    saveState();
    renderAll();
    showToast("对战开始！请点击胜者", "info");
  }
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
  saveState();
  renderAll();
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
  saveState();
  renderAll();
  if (returnToMusicDrawn) {
    showToast("已退出播放，可重新抽取音乐或开始比赛", "info");
  } else {
    showToast("对战开始！请点击胜者", "info");
  }
}

function handleBattleModeClick(e) {
  if (!document.body.classList.contains("battle-mode")) return;
  if (battleStartTimer) {
    clearTimeout(battleStartTimer);
    battleStartTimer = null;
  }
  if (GBState.phase === "music_drawn") {
    endBattleStart();
  }
}

function handleDoubleClick(e) {
  if (GBState.phase !== "battling") return;
  if (!document.body.classList.contains("battle-mode")) return;
  stopMusicPlaying();
}

// 音乐播放器错误处理
document.addEventListener("DOMContentLoaded", () => {
  const player = document.getElementById("music-player");
  if (player) {
    player.addEventListener("error", (e) => {
      console.error("音频加载错误:", e);
      showToast("音频文件加载失败，请重新抽取音乐", "error");
    });
  }
});

// ==================== 选胜者 ====================
function selectArenaWinner(arenaIdx) {
  if (GBState.phase !== "battling" && GBState.phase !== "music_playing") return;
  if (GBState.phase === "music_playing") {
    const player = document.getElementById("music-player");
    player.pause();
    player.currentTime = 0;
    player.onended = null;
    document.body.classList.remove("battle-mode");
    GBState.phase = "battling";
  }
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return;

  const p1IsDefender = DOM.arenaRole1.textContent === "守擂者";
  let winner, loser;
  if (arenaIdx === 0) {
    winner = p1IsDefender ? match.defender : match.challenger;
    loser = p1IsDefender ? match.challenger : match.defender;
  } else {
    winner = p1IsDefender ? match.challenger : match.defender;
    loser = p1IsDefender ? match.defender : match.challenger;
  }

  match.winner = winner;
  match.loser = loser;
  const loserGroup = GBState.groups[loser.groupIdx];
  if (!loserGroup.eliminated.includes(loser.playerName)) {
    loserGroup.eliminated.push(loser.playerName);
  }
  pushUndo({ type: "select_winner", winner, loser });
  GBState.phase = "selecting_winner_anim";
  saveState();
  renderAll();
  playResultAnimations(winner, loser, () => {
    handleMatchEndCheck();
  });
}

// ==================== 赛后检查 ====================
function handleMatchEndCheck() {
  const match = GBState.currentMatch;
  const loserGroup = GBState.groups[match.loser.groupIdx];
  const remaining = loserGroup.members.filter(
    (m) => !loserGroup.eliminated.includes(m),
  );

  if (remaining.length === 0) {
    finishGroupMatch(match.winner.groupIdx, match.loser.groupIdx);
  } else {
    match.duelHistory.push({
      defender: { ...match.defender },
      challenger: { ...match.challenger },
      winner: { ...match.winner },
      loser: { ...match.loser },
    });
    match.defender = { ...match.winner, role: "defender" };
    match.nextChallengerGroupIdx = match.loser.groupIdx;
    match.challenger = null;
    match.winner = null;
    match.loser = null;
    GBState.phase = "selecting_next_challenger";
    saveState();
    renderAll();
    showToast(
      loserGroup.id + "组还有 " + remaining.length + " 人，请派出下一位挑战者",
      "info",
    );
  }
}

function finishGroupMatch(winnerGroupIdx, loserGroupIdx) {
  const match = GBState.currentMatch;
  match.duelHistory.push({
    defender: { ...match.defender },
    challenger: { ...match.challenger },
    winner: { ...match.winner },
    loser: { ...match.loser },
  });
  GBState.groups[winnerGroupIdx].wins++;
  GBState.groups[loserGroupIdx].losses++;
  match.matchWinnerGroupIdx = winnerGroupIdx;
  match.matchLoserGroupIdx = loserGroupIdx;
  if (GBState.groups[loserGroupIdx].losses >= 2)
    GBState.groups[loserGroupIdx].status = "eliminated";
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (pending) {
    pending.played = true;
    pending.winner = winnerGroupIdx;
    pending.loser = loserGroupIdx;
  }
  GBState.bracket.completedMatches.push({
    round: 1,
    stage: "initial",
    group1: winnerGroupIdx,
    group2: loserGroupIdx,
    winner: winnerGroupIdx,
    duelHistory: [...match.duelHistory],
  });
  pushUndo({ type: "finish_match", winnerGroupIdx, loserGroupIdx });
  GBState.phase = "match_end";
  saveState();
  renderAll();
  showToast(GBState.groups[winnerGroupIdx].id + "组获胜！", "success");
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
  GBState.currentMatch = {
    group1Idx: g1,
    group2Idx: g2,
    defender: null,
    challenger: null,
    winner: null,
    loser: null,
    duelHistory: [],
    matchWinnerGroupIdx: null,
    matchLoserGroupIdx: null,
    nextChallengerGroupIdx: null,
    firstTrickLocked: true,
    selectedTrick: null,
  };
  GBState.phase = "selecting_players";
  const player = document.getElementById("music-player");
  player.pause();
  player.currentTime = 0;
  player.src = "";
  saveState();
  renderAll();
  showToast("当前对战已重置，请重新选择出战选手", "success");
}

function handleNextMatch() {
  if (GBState.phase !== "match_end") {
    showToast("请先完成当前场次", "warning");
    return;
  }
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (pending) {
    GBState.currentMatch = {
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
      firstTrickLocked: true,
      selectedTrick: null,
    };
    GBState.phase = "selecting_groups";
    selectedGroupIdxs = [];
    saveState();
    renderAll();
    showToast("请进行下一场对战", "info");
  } else {
    showToast("初赛全部结束！请点击「进入第二大轮」", "success");
    DOM.nextMatchBtn.classList.add("hidden");
    DOM.nextRoundBtn.classList.remove("hidden");
    setTimeout(() => {
      if (GBState.phase === "match_end") handleNextRound();
    }, 900);
  }
}

function handleNextRound() {
  const round1Result = {
    round: 1,
    groups: GBState.groups.map((g) => ({
      id: g.id,
      wins: g.wins,
      losses: g.losses,
      status: g.status,
      members: g.members,
    })),
    completedMatches: GBState.bracket.completedMatches,
    revivalUsed: GBState.revivalUsed,
  };
  localStorage.setItem("groupBattleRound1", JSON.stringify(round1Result));
  fetch("http://localhost:3000/api/group-battle-process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ round1Result, currentState: getPersistedState() }),
  }).catch((err) => console.error("保存第一轮结果失败", err));
  window.location.href = "../html/group_battle_2.html";
}
