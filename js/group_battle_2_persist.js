/**
 * 团体赛 - 第二大轮（胜者组/败者组）
 * 撤消 + 重置 + 持久化
 */

// ==================== 撤消 ====================
function handleUndo() {
  if (GBState.undoStack.length === 0) {
    showToast("没有可撤消的操作", "info");
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
  showToast("已撤消上一步操作", "success");
}

// ==================== 重置 & 持久化 ====================
function handleReset() {
  if (!confirm("确定要重置第二大轮吗？")) return;
  localStorage.removeItem("groupBattleRound2");
  setupRound2();
  renderAll();
  showToast("已重置", "success");
}

function saveState() {
  const persisted = { ...GBState };
  delete persisted.oldPlayers;
  delete persisted.newPlayers;
  delete persisted.allPlayers;
  try {
    localStorage.setItem("groupBattleStateR2", JSON.stringify(persisted));
  } catch (e) {}
}
