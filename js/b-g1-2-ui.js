/**
 * 一年加组对战系统 - 第二章节（UI模块）
 * 包含UI和显示相关函数
 */

// 显示当前比赛的选手
function displayCurrentMatch() {
  const currentMatch = getCurrentMatch();
  if (!currentMatch) {
    showToast("没有当前比赛可显示", "error");
    return;
  }

  // 更新选手名称
  DOM.player1Name.innerText = currentMatch.player1;
  DOM.player2Name.innerText = currentMatch.player2;

  // 显示选手战绩
  updatePlayerStatsDisplay();
}

// 更新选手战绩显示
function updatePlayerStatsDisplay() {
  // 获取选手名称
  const player1Name = DOM.player1Name.innerText;
  const player2Name = DOM.player2Name.innerText;

  // 获取或初始化选手战绩
  const player1Stats = BattleState.playerStats[player1Name] || {
    wins: 0,
    losses: 0,
  };
  const player2Stats = BattleState.playerStats[player2Name] || {
    wins: 0,
    losses: 0,
  };

  // 更新显示
  DOM.player1Wins.innerText = player1Stats.wins;
  DOM.player1Losses.innerText = player1Stats.losses;
  DOM.player2Wins.innerText = player2Stats.wins;
  DOM.player2Losses.innerText = player2Stats.losses;
}

// 更新轮次和赛程状态显示
function updateRoundDisplay() {
  // 更新轮次显示 - 双败赛制正确为5轮（有可能会有6场比赛，但总轮数是5）
  DOM.roundNumber.innerText = `${BattleState.currentRound}/5`;

  // 更新比赛类型状态显示
  let statusText = "";
  let statusClass = "";

  switch (BattleState.currentBracket) {
    case "winner":
      statusText = "胜者组";
      statusClass = "winner-bracket";
      break;
    case "loser":
      statusText = "败者组";
      statusClass = "loser-bracket";
      break;
    case "final":
      statusText = BattleState.currentRound === 2 ? "冠军决定战" : "决赛";
      statusClass = "final";
      break;
  }

  DOM.tournamentStatus.innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
}

// 更新赛程图显示
function updateBracketDisplay() {
  if (!DOM.bracketDisplay) return;

  DOM.bracketDisplay.innerHTML = "";

  // 创建胜者组赛程
  createBracketSection("winner", "胜者组");

  // 创建败者组赛程
  createBracketSection("loser", "败者组");

  // 创建决赛赛程
  createBracketSection("final", "决赛");
}

// 创建赛程图的一个部分 (胜者组/败者组/决赛)
function createBracketSection(bracketType, title) {
  const bracketData = BattleState.bracket[bracketType];
  if (!bracketData || bracketData.length === 0) return;

  // 创建包含整个部分的容器
  const sectionContainer = document.createElement("div");
  sectionContainer.className = `bracket-section ${bracketType}-section`;

  // 创建组标题
  const sectionTitle = document.createElement("div");
  sectionTitle.className = `bracket-section-title ${bracketType}-title`;
  sectionTitle.innerText = title;
  sectionContainer.appendChild(sectionTitle);

  // 创建轮次容器
  bracketData.forEach((roundData, roundIndex) => {
    const roundDiv = document.createElement("div");
    roundDiv.className = "bracket-round";

    // 创建轮次标题
    const roundTitle = document.createElement("div");
    roundTitle.className = "bracket-round-title";
    roundTitle.innerText = `第${roundData.round}轮`;
    roundDiv.appendChild(roundTitle);

    // 创建比赛卡片
    roundData.matches.forEach((match, matchIndex) => {
      const matchCard = createMatchCard(
        match,
        bracketType,
        roundData.round,
        matchIndex
      );
      roundDiv.appendChild(matchCard);
    });

    sectionContainer.appendChild(roundDiv);
  });

  DOM.bracketDisplay.appendChild(sectionContainer);
}

// 创建单场比赛卡片
function createMatchCard(match, bracketType, round, matchIndex) {
  const card = document.createElement("div");
  card.className = "bracket-match";

  // 添加特定的比赛顺序标识类
  card.classList.add(`${bracketType}-r${round}-m${matchIndex}`);

  // 如果是当前比赛，添加样式
  if (
    BattleState.currentBracket === bracketType &&
    BattleState.currentRound === round + 1 &&
    BattleState.currentMatchIndex === matchIndex
  ) {
    card.classList.add("current");

    // 根据赛区添加不同样式
    if (bracketType === "loser") {
      card.classList.add("loser-bracket");
    } else if (bracketType === "final") {
      card.classList.add("final");
    }
  }

  // 创建选手1元素
  const player1 = document.createElement("div");
  player1.className = "bracket-player";
  if (match.player1 === match.winner) {
    player1.classList.add("winner");
  } else if (match.winner && match.player1 !== match.winner) {
    player1.classList.add("loser");
  }
  player1.innerText = match.player1 === "TBD" ? "待定" : match.player1;
  card.appendChild(player1);

  // 创建选手2元素
  const player2 = document.createElement("div");
  player2.className = "bracket-player";
  if (match.player2 === match.winner) {
    player2.classList.add("winner");
  } else if (match.winner && match.player2 !== match.winner) {
    player2.classList.add("loser");
  }
  player2.innerText = match.player2 === "TBD" ? "待定" : match.player2;
  card.appendChild(player2);

  // 如果是决赛，添加特殊标记
  if (match.isFinal) {
    const badge = document.createElement("div");
    badge.className = "final-badge";
    badge.innerText = "冠军赛";
    card.appendChild(badge);
  }

  return card;
}

// 显示获胜提示
function showWinnerAnnouncement(winnerName) {
  const announcement = document.createElement("div");
  announcement.classList.add("winner-announcement");
  announcement.innerText = `${winnerName} 获胜!`;
  document.body.appendChild(announcement);

  // 自动移除
  setTimeout(() => {
    if (document.body.contains(announcement)) {
      document.body.removeChild(announcement);
    }
  }, 3000);
}

// 显示最终获胜者提示
function showFinalWinnerAnnouncement(winnerName) {
  const announcement = document.createElement("div");
  announcement.classList.add("winner-announcement");
  announcement.style.backgroundColor = "rgba(30, 30, 30, 0.95)";
  announcement.style.border = "4px solid #ffd700";
  announcement.style.padding = "30px 50px";
  announcement.style.fontSize = "36px";
  announcement.innerHTML = `🏆 恭喜 <strong>${winnerName}</strong> 成为第二章节冠军! 🏆<br><small>5秒后自动跳转到排名页面</small>`;
  document.body.appendChild(announcement);

  // 5秒后跳转到排名页面
  setTimeout(() => {
    window.location.href = "rank.html";
  }, 5000);
}

// 播放比赛开始动画
function playBattleStartAnimation() {
  // 添加遮罩
  const overlay = document.createElement("div");
  overlay.classList.add("battle-overlay");
  document.body.appendChild(overlay);

  // 添加震动效果
  document.body.classList.add("shake");
  setTimeout(() => document.body.classList.remove("shake"), 500);

  // 创建 Battle Start 动画
  const battleStart = document.createElement("div");
  battleStart.classList.add("battle-start");
  battleStart.innerText = "BATTLE START";
  document.body.appendChild(battleStart);

  // 3秒后移除动画元素
  setTimeout(() => {
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
    if (document.body.contains(battleStart)) {
      document.body.removeChild(battleStart);
    }
  }, 3000);
}

// 启动音乐播放模式
function startMusicMode() {
  // 立即添加音乐播放模式类以实现透明效果
  document.body.classList.add("music-playing-mode");
  console.log("进入音乐播放模式");

  // 创建全屏遮罩
  const overlay = document.createElement("div");
  overlay.classList.add("battle-overlay");
  document.body.appendChild(overlay);

  // 创建Battle Start效果并立即添加到DOM
  const battleStart = document.createElement("div");
  battleStart.classList.add("battle-start");
  // 先添加到DOM，再设置内容，确保动画效果显示
  document.body.appendChild(battleStart);

  // 添加震动效果
  setTimeout(() => {
    document.body.classList.add("shake");
    setTimeout(() => {
      document.body.classList.remove("shake");
    }, 500);
  }, 50);

  // 分步骤显示文字 - 元素已在DOM中，只需改变内容
  setTimeout(() => {
    battleStart.innerText = "B";
  }, 200);

  setTimeout(() => {
    battleStart.innerText = "BA";
  }, 300);

  setTimeout(() => {
    battleStart.innerText = "BAT";
  }, 400);

  setTimeout(() => {
    battleStart.innerText = "BATT";
  }, 500);

  setTimeout(() => {
    battleStart.innerText = "BATTL";
  }, 600);

  setTimeout(() => {
    battleStart.innerText = "BATTLE";
  }, 700);

  setTimeout(() => {
    battleStart.innerText = "BATTLE ";
  }, 800);

  setTimeout(() => {
    battleStart.innerText = "BATTLE S";
  }, 900);

  setTimeout(() => {
    battleStart.innerText = "BATTLE ST";
  }, 1000);

  setTimeout(() => {
    battleStart.innerText = "BATTLE STA";
  }, 1100);

  setTimeout(() => {
    battleStart.innerText = "BATTLE STAR";
  }, 1200);

  setTimeout(() => {
    battleStart.innerText = "BATTLE START";
    battleStart.classList.add("shake");
  }, 1300);

  // 在动画结束后移除元素并播放音乐 - 延长到4500毫秒
  setTimeout(() => {
    if (document.body.contains(battleStart)) {
      document.body.removeChild(battleStart);

      // 移除遮罩
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }

      // 添加点击任意位置停止的提示
      const clickToStop = document.createElement("div");
      clickToStop.classList.add("click-to-stop");
      clickToStop.innerText = "点击任意位置停止";
      clickToStop.id = "click-to-stop-hint";
      document.body.appendChild(clickToStop);

      // 播放音乐
      DOM.musicPlayer.currentTime = 0;
      DOM.musicPlayer.play();
      DOM.musicPlayer.style.display = "block";

      // 更新状态
      BattleState.isMusicPlaying = true;

      // 添加事件监听
      DOM.musicPlayer.onended = stopMusicMode;
      document.addEventListener("click", handleDocumentClick);
    }
  }, 4500);
}

// 停止音乐播放模式
function stopMusicMode() {
  // 停止音乐
  DOM.musicPlayer.pause();
  DOM.musicPlayer.currentTime = 0;

  // 移除样式
  document.body.classList.remove("music-playing-mode");

  // 移除事件监听
  document.removeEventListener("click", handleDocumentClick);

  // 移除遮罩和提示
  const overlay = document.querySelector(".battle-overlay");
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }

  const hint = document.getElementById("click-to-stop-hint");
  if (hint && hint.parentNode) {
    hint.parentNode.removeChild(hint);
  }

  // 隐藏播放器
  DOM.musicPlayer.style.display = "none";

  // 更新状态
  BattleState.isMusicPlaying = false;

  console.log("音乐播放模式已停止");
}

// 显示提示信息
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `${type}-toast`;
  toast.innerText = message;
  document.body.appendChild(toast);

  // 自动移除
  setTimeout(() => {
    if (document.body.contains(toast)) {
      document.body.removeChild(toast);
    }
  }, 3000);
}
