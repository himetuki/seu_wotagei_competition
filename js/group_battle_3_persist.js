/**
 * 团体赛 - 第三大轮（决赛）
 * 撤消 + 重置 + 持久化
 */

// ==================== 撤消 ====================
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

// ==================== 重置 & 持久化 ====================
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
