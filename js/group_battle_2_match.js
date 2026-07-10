/**
 * 团体赛 - 第二大轮（胜者组/败者组）
 * 选组 + 选手选择 + 复活
 */

// ==================== 选组 ====================
let selectedGroupIdxs = [];
function handleGroupSectionClick(e) {
  const card = e.target.closest(".group-card");
  if (!card) return;
  const idx = parseInt(card.dataset.groupIdx);
  if (GBState.phase === "selecting_groups") {
    handleSelectGroup(idx);
    return;
  }
}

function handleSelectGroup(idx) {
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (!pending) return;
  if (idx !== pending.g1 && idx !== pending.g2) {
    showToast("请按赛程选择指定的组", "warning");
    return;
  }
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
  GBState.currentMatch = {
    group1Idx: idx1,
    group2Idx: idx2,
    defender: null,
    challenger: null,
    winner: null,
    loser: null,
    duelHistory: [],
    matchWinnerGroupIdx: null,
    matchLoserGroupIdx: null,
    nextChallengerGroupIdx: null,
  };
  GBState.phase = "selecting_players";
  selectedGroupIdxs = [];
  saveState();
  renderAll();
  showToast("请从两组中各1名出战选手", "info");
}

// ==================== 选选手（可回归）====================
function handleMemberClick(groupIdx, playerName, e) {
  e.stopPropagation();
  const group = GBState.groups[groupIdx];
  if (group.eliminated.includes(playerName) && !canRevive(playerName)) return;
  const match = GBState.currentMatch;

  if (
    match.defender &&
    match.defender.groupIdx === groupIdx &&
    match.defender.playerName === playerName
  ) {
    match.defender = null;
    if (
      GBState.phase === "ready_to_battle" ||
      GBState.phase === "music_drawn"
    ) {
      GBState.phase = "selecting_players";
      match.drawnMusic = null;
    }
    pushUndo({ type: "return_defender", groupIdx, playerName });
    saveState();
    renderAll();
    return;
  }
  if (
    match.challenger &&
    match.challenger.groupIdx === groupIdx &&
    match.challenger.playerName === playerName
  ) {
    match.challenger = null;
    if (
      GBState.phase === "ready_to_battle" ||
      GBState.phase === "music_drawn"
    ) {
      GBState.phase = "selecting_players";
      match.drawnMusic = null;
    }
    pushUndo({ type: "return_challenger", groupIdx, playerName });
    saveState();
    renderAll();
    return;
  }

  if (
    GBState.phase === "selecting_players" ||
    GBState.phase === "ready_to_battle" ||
    GBState.phase === "music_drawn"
  ) {
    if (match.defender === null) {
      match.defender = { groupIdx, playerName, role: "defender" };
      pushUndo({ type: "select_defender", groupIdx, playerName });
      saveState();
      renderAll();
      return;
    }
    if (match.challenger === null && groupIdx !== match.defender.groupIdx) {
      match.challenger = { groupIdx, playerName, role: "challenger" };
      pushUndo({ type: "select_challenger", groupIdx, playerName });
      GBState.phase = "ready_to_battle";
      saveState();
      renderAll();
      showToast("选手已就位，请抽取音乐", "success");
      return;
    }
    if (match.challenger === null && groupIdx === match.defender.groupIdx) {
      showToast("请选择另一组的成员", "warning");
      return;
    }
  } else if (GBState.phase === "selecting_next_challenger") {
    if (groupIdx === match.defender.groupIdx) {
      showToast("请选择败者组的成员", "warning");
      return;
    }
    if (groupIdx !== match.nextChallengerGroupIdx) {
      showToast("请选择指定组的成员", "warning");
      return;
    }
    match.challenger = { groupIdx, playerName, role: "challenger" };
    match.winner = null;
    match.loser = null;
    pushUndo({ type: "select_next_challenger", groupIdx, playerName });
    GBState.phase = "ready_to_battle";
    saveState();
    renderAll();
  }
}

function canRevive(playerName) {
  const normalizedName = normalizePlayerName(playerName);
  return isNewPlayer(normalizedName) && !GBState.revivalUsed[normalizedName];
}

function refreshGroupStatus(groupIdx) {
  const group = GBState.groups[groupIdx];
  if (!group) return;
  group.status = group.members.some(
    (member) => !group.eliminated.includes(member),
  )
    ? "active"
    : "eliminated";
}

function reopenFinishedMatchAfterRevive() {
  const lastCompleted = GBState.bracket.completedMatches.pop();
  if (lastCompleted) {
    const lastPending = [...GBState.bracket.pendingMatches]
      .reverse()
      .find((m) => m.played);
    if (lastPending) {
      lastPending.played = false;
      delete lastPending.winner;
      delete lastPending.loser;
    }
    GBState.groups[lastCompleted.group1].wins--;
    GBState.groups[lastCompleted.group2].losses--;
    if (GBState.groups[lastCompleted.group2].losses < 2) {
      GBState.groups[lastCompleted.group2].status = "active";
    }
  }

  const match = GBState.currentMatch;
  GBState.currentMatch = {
    group1Idx: match.group1Idx,
    group2Idx: match.group2Idx,
    defender: null,
    challenger: null,
    winner: null,
    loser: null,
    duelHistory: [],
    matchWinnerGroupIdx: null,
    matchLoserGroupIdx: null,
    nextChallengerGroupIdx: null,
  };
  const player = document.getElementById("music-player");
  if (player) {
    player.pause();
    player.currentTime = 0;
    player.src = "";
  }
  GBState.phase = "selecting_players";
  selectedGroupIdxs = [];
}

function handleRevive(groupIdx, playerName) {
  if (!canRevive(playerName)) {
    showToast("该选手无法复活", "warning");
    return;
  }
  const normalizedName = normalizePlayerName(playerName);
  const reopenedMatch = GBState.phase === "match_end";
  const matchSnapshot = reopenedMatch
    ? JSON.parse(JSON.stringify(GBState.currentMatch))
    : null;
  const completedSnapshot = reopenedMatch
    ? JSON.parse(
        JSON.stringify(
          GBState.bracket.completedMatches[
            GBState.bracket.completedMatches.length - 1
          ] || null,
        ),
      )
    : null;
  const group = GBState.groups[groupIdx];
  group.eliminated = group.eliminated.filter(
    (n) => normalizePlayerName(n) !== normalizedName,
  );
  refreshGroupStatus(groupIdx);
  GBState.revivalUsed[normalizedName] = true;
  if (GBState.phase === "match_end") {
    reopenFinishedMatchAfterRevive();
  }
  pushUndo({
    type: "revive",
    groupIdx,
    playerName: normalizedName,
    reopenedMatch,
    matchSnapshot,
    completedSnapshot,
  });
  saveState();
  renderAll();
  showToast(normalizedName + " 已复活，可重新进入对局", "success");
}
