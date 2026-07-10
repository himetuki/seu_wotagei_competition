/**
 * 团体赛 - 第一大轮（初赛）
 * 撤消 + 重置 + 持久化
 */

// ==================== 撤消 ====================
function handleUndo() {
  if (GBState.undoStack.length === 0) {
    showToast("没有可撤销的操作", "info");
    return;
  }
  const action = GBState.undoStack.pop();
  const match = GBState.currentMatch;
  switch (action.type) {
    case "select_defender":
      match.defender = null;
      GBState.phase = "selecting_players";
      break;
    case "select_challenger":
      match.challenger = null;
      GBState.phase = "selecting_players";
      break;
    case "return_defender":
      match.defender = {
        groupIdx: action.groupIdx,
        playerName: action.playerName,
        role: "defender",
      };
      break;
    case "return_challenger":
      match.challenger = {
        groupIdx: action.groupIdx,
        playerName: action.playerName,
        role: "challenger",
      };
      break;
    case "select_next_challenger":
      if (match.duelHistory.length > 0) {
        const last = match.duelHistory.pop();
        match.defender = last.defender;
        match.challenger = last.challenger;
        match.winner = last.winner;
        match.loser = last.loser;
      }
      GBState.phase = "selecting_next_challenger";
      break;
    case "select_winner":
      {
        const g = GBState.groups[action.loser.groupIdx];
        g.eliminated = g.eliminated.filter(
          (n) => n !== action.loser.playerName,
        );
        match.winner = null;
        match.loser = null;
      }
      GBState.phase = "battling";
      break;
    case "finish_match":
      GBState.groups[action.winnerGroupIdx].wins--;
      GBState.groups[action.loserGroupIdx].losses--;
      if (GBState.groups[action.loserGroupIdx].losses < 2)
        GBState.groups[action.loserGroupIdx].status = "active";
      {
        const last = GBState.bracket.completedMatches.pop();
        if (last) {
          const p = GBState.bracket.pendingMatches.find((m) => m.played);
          if (p) p.played = false;
        }
      }
      match.matchWinnerGroupIdx = null;
      match.matchLoserGroupIdx = null;
      GBState.phase = "match_end";
      break;
    case "revive":
      {
        const g = GBState.groups[action.groupIdx];
        if (!g.eliminated.includes(action.playerName))
          g.eliminated.push(action.playerName);
        GBState.revivalUsed[action.playerName] = false;
        refreshGroupStatus(action.groupIdx);
        if (action.reopenedMatch && action.completedSnapshot) {
          GBState.bracket.completedMatches.push(action.completedSnapshot);
          const pending = [...GBState.bracket.pendingMatches]
            .reverse()
            .find((m) => !m.played);
          if (pending) {
            pending.played = true;
            pending.winner = action.completedSnapshot.group1;
            pending.loser = action.completedSnapshot.group2;
          }
          GBState.groups[action.completedSnapshot.group1].wins++;
          GBState.groups[action.completedSnapshot.group2].losses++;
          if (GBState.groups[action.completedSnapshot.group2].losses >= 2) {
            GBState.groups[action.completedSnapshot.group2].status =
              "eliminated";
          }
          GBState.currentMatch = action.matchSnapshot || GBState.currentMatch;
          GBState.phase = "match_end";
        }
      }
      break;
  }
  saveState();
  renderAll();
  showToast("已撤销上一步操作", "success");
}

// ==================== 重置 & 持久化 ====================
function handleReset() {
  if (!confirm("确定要重置团体赛吗？所有进度将丢失。")) return;
  GBState.phase = "assigning";
  GBState.unassigned = [...GBState.allPlayers];
  GBState.selectedMember = null;
  GBState.groups.forEach((g) => {
    g.members = [];
    g.eliminated = [];
    g.wins = 0;
    g.losses = 0;
    g.status = "active";
  });
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
  GBState.bracket = { pendingMatches: [], completedMatches: [] };
  GBState.undoStack = [];
  GBState.revivalUsed = {};
  selectedGroupIdxs = [];
  localStorage.removeItem("groupBattleState");
  fetch("http://localhost:3000/api/clear-group-battle-process", {
    method: "POST",
  }).catch(() => {});
  renderAll();
  showToast("已重置", "success");
}

function getPersistedState() {
  const persisted = { ...GBState };
  delete persisted.oldPlayers;
  delete persisted.newPlayers;
  delete persisted.allPlayers;
  return persisted;
}

function saveState() {
  const persisted = getPersistedState();
  try {
    localStorage.setItem("groupBattleState", JSON.stringify(persisted));
  } catch (e) {}
  fetch("http://localhost:3000/api/group-battle-process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(persisted),
  }).catch(() => {});
}

function loadState() {
  try {
    const s = localStorage.getItem("groupBattleState");
    if (!s) return;
    const parsed = JSON.parse(s);
    delete parsed.musicListNew;
    delete parsed.musicListOld;
    delete parsed.musicListEx;
    delete parsed.oldPlayers;
    delete parsed.newPlayers;
    delete parsed.allPlayers;
    Object.assign(GBState, parsed);
  } catch (e) {}
}

function loadStateFromServer() {
  return fetch("http://localhost:3000/api/group-battle-process")
    .then((r) => r.json())
    .then((data) => {
      if (!data || !data.currentState) return false;
      const state = { ...data.currentState };
      delete state.musicListNew;
      delete state.musicListOld;
      delete state.musicListEx;
      delete state.oldPlayers;
      delete state.newPlayers;
      delete state.allPlayers;
      Object.assign(GBState, state);
      return true;
    })
    .catch(() => false);
}
