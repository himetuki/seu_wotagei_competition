/**
 * 一年加组对战系统 - 第二章节（比赛模块）
 * 包含比赛流程和赛程管理
 */

// 获取当前比赛
function getCurrentMatch() {
  // 检查是否有比赛数据
  if (!BattleState.bracket) return null;

  const bracketType = BattleState.currentBracket;
  const roundIndex = BattleState.currentRound - 1;
  const matchIndex = BattleState.currentMatchIndex;

  // 检查数组边界
  if (
    !BattleState.bracket[bracketType] ||
    !BattleState.bracket[bracketType][roundIndex] ||
    !BattleState.bracket[bracketType][roundIndex].matches ||
    !BattleState.bracket[bracketType][roundIndex].matches[matchIndex]
  ) {
    return null;
  }

  return BattleState.bracket[bracketType][roundIndex].matches[matchIndex];
}

// 更新选手战绩
function updatePlayerStats(winnerName, loserName) {
  // 确保选手统计对象存在
  if (!BattleState.playerStats[winnerName]) {
    BattleState.playerStats[winnerName] = { wins: 0, losses: 0 };
  }
  if (!BattleState.playerStats[loserName]) {
    BattleState.playerStats[loserName] = { wins: 0, losses: 0 };
  }

  // 更新胜败次数
  BattleState.playerStats[winnerName].wins += 1;
  BattleState.playerStats[loserName].losses += 1;

  // 更新显示
  updatePlayerStatsDisplay();
}

// 更新赛程进展
function updateTournamentProgress() {
  // 获取当前比赛信息
  const currentMatch = getCurrentMatch();
  if (!currentMatch || !currentMatch.winner) return;

  // 根据当前赛程阶段，确定下一场比赛
  if (
    BattleState.currentBracket === "winner" &&
    BattleState.currentRound === 1
  ) {
    // 胜者组第一轮，将胜者晋级到胜者组第二轮，败者进入败者组
    if (BattleState.currentMatchIndex === 0) {
      // 第一场比赛(比赛一)，胜者为胜者组第二轮选手1，败者进入败者组第一轮
      BattleState.bracket.winner[1].matches[0].player1 = currentMatch.winner;
      BattleState.bracket.loser[0].matches[0].player1 = currentMatch.loser;

      // 移至胜者组第一轮第二场(比赛二)
      BattleState.currentMatchIndex = 1;
    } else {
      // 第二场比赛(比赛二)，胜者为胜者组第二轮选手2，败者进入败者组
      BattleState.bracket.winner[1].matches[0].player2 = currentMatch.winner;
      BattleState.bracket.loser[0].matches[0].player2 = currentMatch.loser;

      // 移至败者组第一轮(比赛三) - 两组败者的对决
      BattleState.currentBracket = "loser";
      BattleState.currentRound = 1;
      BattleState.currentMatchIndex = 0;
    }
  } else if (
    BattleState.currentBracket === "loser" &&
    BattleState.currentRound === 1
  ) {
    // 败者组第一轮结束(比赛三)，胜者进入败者组第二轮
    BattleState.bracket.loser[1].matches[0].player1 = currentMatch.winner;

    // 记录比赛三的败者为第四名
    BattleState.fourthPlace = currentMatch.loser;

    // 移至胜者组第二轮(比赛四) - 两组胜者的对决
    BattleState.currentBracket = "winner";
    BattleState.currentRound = 2;
    BattleState.currentMatchIndex = 0;
  } else if (
    BattleState.currentBracket === "winner" &&
    BattleState.currentRound === 2
  ) {
    // 胜者组第二轮结束(比赛四)，胜者直接进入决赛，败者进入败者组第二轮
    BattleState.bracket.final[0].matches[0].player1 = currentMatch.winner;
    BattleState.bracket.loser[1].matches[0].player2 = currentMatch.loser;

    // 移至败者组第二轮(比赛五) - 比赛三的胜者与比赛四的败者对决
    BattleState.currentBracket = "loser";
    BattleState.currentRound = 2;
    BattleState.currentMatchIndex = 0;
  } else if (
    BattleState.currentBracket === "loser" &&
    BattleState.currentRound === 2
  ) {
    // 败者组第二轮结束(比赛五)，胜者进入决赛，败者为季军
    BattleState.bracket.final[0].matches[0].player2 = currentMatch.winner;

    // 记录比赛五的败者为季军
    BattleState.thirdPlace = currentMatch.loser;

    // 移至决赛(比赛六) - 比赛四的胜者与比赛五的胜者对决
    BattleState.currentBracket = "final";
    BattleState.currentRound = 1;
    BattleState.currentMatchIndex = 0;
  } else if (
    BattleState.currentBracket === "final" &&
    BattleState.currentRound === 1
  ) {
    // 决赛结束，记录冠军和亚军
    BattleState.champion = currentMatch.winner;
    BattleState.runnerUp = currentMatch.loser;

    // 比赛完全结束
    BattleState.tournamentCompleted = true;
  }
}

// 确定赛事最终获胜者
function determineTournamentWinner() {
  if (BattleState.tournamentCompleted) {
    // 如果比赛在决赛第一轮结束，且胜者组选手获胜
    if (
      BattleState.currentBracket === "final" &&
      BattleState.currentRound === 1
    ) {
      const finalMatch = BattleState.bracket.final[0].matches[0];
      return finalMatch.winner;
    }
    // 如果比赛在决赛第二轮结束 - 直接返回第二轮的获胜者
    else if (
      BattleState.currentBracket === "final" &&
      BattleState.currentRound === 2 &&
      BattleState.bracket.final[1] &&
      BattleState.bracket.final[1].matches[0]
    ) {
      return BattleState.bracket.final[1].matches[0].winner;
    }
  }
  return null;
}

// 更新对战信息描述
function updateMatchDescription() {
  const currentMatch = getCurrentMatch();
  if (!currentMatch) return;

  const bracketNames = {
    winner: "胜者组",
    loser: "败者组",
    final: "决赛",
  };

  const matchNames = {
    1: "比赛一",
    2: "比赛二",
    3: "比赛三",
    4: "比赛四",
    5: "比赛五",
    6: "决赛",
  };

  let description = "";
  const matchNumber = currentMatch.matchNumber || getMatchNumberFromState();

  if (matchNumber) {
    description = matchNames[matchNumber] || "";
  } else {
    description = `${bracketNames[BattleState.currentBracket] || ""} 第${
      BattleState.currentRound
    }轮`;
  }

  if (DOM.tournamentStatus) {
    // 先清空
    DOM.tournamentStatus.innerHTML = "";

    // 添加赛程说明
    const badge = document.createElement("span");
    badge.className = "status-badge";
    if (BattleState.currentBracket === "loser") {
      badge.classList.add("loser-bracket");
    } else if (BattleState.currentBracket === "final") {
      badge.classList.add("final");
    }
    badge.textContent = description;
    DOM.tournamentStatus.appendChild(badge);

    // 如果有必要，添加额外说明
    if (matchNumber === 3) {
      const hint = document.createElement("div");
      hint.className = "match-hint";
      hint.textContent = "两场比赛的败者对决";
      DOM.tournamentStatus.appendChild(hint);
    } else if (matchNumber === 4) {
      const hint = document.createElement("div");
      hint.className = "match-hint";
      hint.textContent = "两场比赛的胜者对决";
      DOM.tournamentStatus.appendChild(hint);
    } else if (matchNumber === 5) {
      const hint = document.createElement("div");
      hint.className = "match-hint";
      hint.textContent = "比赛四的败者与比赛三的胜者对决";
      DOM.tournamentStatus.appendChild(hint);
    } else if (matchNumber === 6) {
      const hint = document.createElement("div");
      hint.className = "match-hint";
      hint.textContent = "比赛四的胜者与比赛五的胜者对决";
      DOM.tournamentStatus.appendChild(hint);
    }
  }
}

// 根据当前状态推断比赛编号
function getMatchNumberFromState() {
  if (
    BattleState.currentBracket === "winner" &&
    BattleState.currentRound === 1
  ) {
    return BattleState.currentMatchIndex === 0 ? 1 : 2;
  } else if (
    BattleState.currentBracket === "loser" &&
    BattleState.currentRound === 1
  ) {
    return 3;
  } else if (
    BattleState.currentBracket === "winner" &&
    BattleState.currentRound === 2
  ) {
    return 4;
  } else if (
    BattleState.currentBracket === "loser" &&
    BattleState.currentRound === 2
  ) {
    return 5;
  } else if (BattleState.currentBracket === "final") {
    return 6;
  }
  return null;
}

// 显示当前比赛
function displayCurrentMatch() {
  const currentMatch = getCurrentMatch();
  if (!currentMatch) {
    console.log("没有找到当前比赛");
    return;
  }

  console.log("显示当前比赛:", currentMatch);

  // 更新选手名称显示
  if (DOM.player1Name && DOM.player2Name) {
    DOM.player1Name.innerText =
      currentMatch.player1 === "TBD" ? "待定" : currentMatch.player1;
    DOM.player2Name.innerText =
      currentMatch.player2 === "TBD" ? "待定" : currentMatch.player2;
  }

  // 如果已有结果，显示胜负
  if (currentMatch.winner) {
    if (DOM.player1 && DOM.player2) {
      DOM.player1.classList.remove("winner", "loser");
      DOM.player2.classList.remove("winner", "loser");

      if (currentMatch.winner === currentMatch.player1) {
        DOM.player1.classList.add("winner");
        DOM.player2.classList.add("loser");
      } else {
        DOM.player1.classList.add("loser");
        DOM.player2.classList.add("winner");
      }
    }
  }

  // 更新比赛描述
  updateMatchDescription();

  // 更新选手战绩显示
  updatePlayerStatsDisplay();
}
