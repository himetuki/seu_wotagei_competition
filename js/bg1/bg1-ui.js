/**
 * 一年加组对战系统 - UI模块
 * 包含UI和显示相关函数
 */

// 更新轮次显示
function updateRoundDisplay() {
  if (!DOM.chapterNumber || !DOM.roundNumber) return;

  DOM.chapterNumber.innerText = BattleState.currentChapter;

  // 计算剩余选手
  const availablePlayers = BattleState.players.filter(
    (player) => !BattleState.participatedPlayers.includes(player.name)
  );

  // 计算总轮次数
  const totalMatches = Math.ceil(BattleState.players.length / 2);

  DOM.roundNumber.innerText = `${BattleState.currentRound}/${totalMatches} (剩余选手: ${availablePlayers.length})`;
}

// 显示技能对决
function displayTrickMatch(player1Trick, player2Trick) {
  const container = document.createElement("div");
  container.className = "random-tricks-container";

  const tech1 = document.createElement("span");
  tech1.innerText = player1Trick;
  tech1.className = "tech-highlight";

  const vsText = document.createElement("span");
  vsText.innerText = "VS";
  vsText.className = "vs-text";

  const tech2 = document.createElement("span");
  tech2.innerText = player2Trick;
  tech2.className = "tech-highlight player2";

  container.appendChild(tech1);
  container.appendChild(vsText);
  container.appendChild(tech2);

  DOM.randomTricksDisplay.innerHTML = "";
  DOM.randomTricksDisplay.appendChild(container);
}

// 切换技能划线状态
function toggleCross(element) {
  element.classList.toggle("crossed");
  element.classList.add("animate");

  // 如果是技名高亮元素，特殊处理
  if (element.classList.contains("tech-highlight")) {
    if (element.classList.contains("crossed")) {
      element.style.animation = "none";
    } else {
      // 恢复动画
      const isPlayer2 = element.classList.contains("player2");
      if (isPlayer2) {
        element.style.animation =
          "techname-glow-orange 2s infinite, techname-color-orange 8s infinite, float 3s ease-in-out infinite";
      } else {
        element.style.animation =
          "techname-glow 2s infinite, techname-color 8s infinite, float 3s ease-in-out infinite";
      }
    }
  }

  setTimeout(() => element.classList.remove("animate"), 500);
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

// 重置获胜者显示
function resetWinnerDisplay() {
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");
  BattleState.currentWinner = null;
}

// 显示提示
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

// 添加自动保存定时器
function setupAutoSave() {
  // 每30秒自动保存一次
  setInterval(saveGameState, 30000);
}
