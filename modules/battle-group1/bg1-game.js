/**
 * 一年加组对战系统 - 游戏模块
 * 包含游戏逻辑和流程控制
 */

// 处理下一轮
function handleNextRound() {
  if (!BattleState.currentWinner) {
    showToast("请先选择本轮胜者", "warning");
    return;
  }

  // 记录当前对战的选手
  const player1 = DOM.player1Name.innerText;
  const player2 = DOM.player2Name.innerText;

  // 添加到已参战列表
  if (!BattleState.participatedPlayers.includes(player1)) {
    BattleState.participatedPlayers.push(player1);
  }
  if (!BattleState.participatedPlayers.includes(player2)) {
    BattleState.participatedPlayers.push(player2);
  }

  // 记录获胜者
  if (!BattleState.chapterWinners.includes(BattleState.currentWinner)) {
    BattleState.chapterWinners.push(BattleState.currentWinner);
  }

  // 保存获胜数据
  saveWinnerData({
    chapter: BattleState.currentChapter,
    round: BattleState.currentRound,
    winner: BattleState.currentWinner,
  });

  // 进入下一轮
  proceedToNextRound();
  saveGameState();
}

// 进入下一轮
function proceedToNextRound() {
  // 更新轮次
  BattleState.currentRound++;

  // 检查是否已完成足够多的轮次，而不是仅仅检查可用选手
  // 第一章节应该至少进行4轮比赛
  const minRequiredRounds = 4;
  const maxRoundsChapter1 = 4;

  if (BattleState.currentRound > minRequiredRounds) {
    // 检查可用选手
    const availablePlayers = BattleState.players.filter(
      (player) => !BattleState.participatedPlayers.includes(player.name)
    );

    if (
      availablePlayers.length < 2 ||
      BattleState.currentRound > maxRoundsChapter1
    ) {
      // 显示提示，但不自动跳转
      showNextChapterPrompt();
      return;
    }
  }

  // 更新显示
  updateRoundDisplay();

  // 重置获胜者状态
  resetWinnerDisplay();

  // 抽取下一轮选手
  drawAvailablePlayers();

  // 保存游戏状态
  saveGameState();
}

// 添加一个新函数，显示下一章节提示，让用户手动决定
function showNextChapterPrompt() {
  // 保存当前状态，但保持在第一章节
  BattleState.currentRound = 4; // 固定在第4轮
  saveGameState();

  // 创建一个提示框
  const promptDiv = document.createElement("div");
  promptDiv.className = "next-chapter-prompt";
  promptDiv.innerHTML = `
    <div class="prompt-content">
      <h3>第一章节已完成</h3>
      <p>您已经完成了第一章节的比赛。</p>
      <div class="prompt-buttons">
        <button id="stay-button">留在当前页面</button>
        <button id="next-chapter-button">进入第二章节</button>
      </div>
    </div>
  `;
  document.body.appendChild(promptDiv);

  // 按钮事件
  document.getElementById("stay-button").addEventListener("click", function () {
    document.body.removeChild(promptDiv);
  });

  document
    .getElementById("next-chapter-button")
    .addEventListener("click", function () {
      // 准备下一章节数据
      const chapterWinnersData = {
        winners: BattleState.chapterWinners,
      };
      localStorage.setItem(
        "chapter1Winners",
        JSON.stringify(chapterWinnersData)
      );

      // 跳转
      window.location.href = "battle-group1-2.html";
    });
}

// 修改开始新章节函数
function startNextChapter() {
  // 如果是第一章节结束，显示提示但不自动跳转
  if (BattleState.currentChapter === 1) {
    // 保存当前状态
    saveGameState();

    // 保存获胜者信息到 localStorage，以便在新页面中恢复
    const chapterWinnersData = {
      winners: BattleState.chapterWinners,
    };
    localStorage.setItem("chapter1Winners", JSON.stringify(chapterWinnersData));

    // 显示提示并让用户选择是否跳转
    showNextChapterPrompt();
    return;
  }

  // 对于其他情况，显示完成信息并跳转到结果页面
  showToast("比赛已结束！", "success");
  setTimeout(() => {
    window.location.href = "rank.html";
  }, 1500);
}

// =============== 辅助功能函数 ===============
// 抽取未参战选手
function drawAvailablePlayers() {
  // 过滤出未参战选手
  const availablePlayers = BattleState.players.filter(
    (player) => !BattleState.participatedPlayers.includes(player.name)
  );

  if (availablePlayers.length < 2) {
    showToast("可用选手不足，将进入下一章节", "warning");
    startNextChapter();
    return;
  }

  // 随机抽取两名未参战选手
  const shuffled = [...availablePlayers].sort(() => Math.random() - 0.5);
  const selectedPlayers = shuffled.slice(0, 2);

  // 更新UI
  DOM.player1Name.innerText = selectedPlayers[0].name;
  DOM.player2Name.innerText = selectedPlayers[1].name;

  // 更新技池
  updateTrickPools();

  // 重置已选中的技能
  BattleState.selectedPlayer1Trick = null;
  BattleState.selectedPlayer2Trick = null;

  console.log(
    `抽取选手: ${selectedPlayers[0].name} vs ${selectedPlayers[1].name}`
  );
}

// 显示选手技能
function displayPlayerTricks(container, player, playerKey) {
  if (!container) return;

  container.innerHTML = "";

  // 如果选手没有技能，分配随机技能
  if (
    !player.tricks ||
    !Array.isArray(player.tricks) ||
    player.tricks.length === 0
  ) {
    player.tricks = generateRandomTricks(5);
  }

  // 判断是哪个选手
  const isPlayer2 = playerKey === "player2";

  // 显示技能
  player.tricks.forEach((trick) => {
    const span = document.createElement("span");
    span.innerText = trick;
    span.classList.add("tech-highlight");
    if (isPlayer2) span.classList.add("player2");

    span.addEventListener("click", () => toggleCross(span));
    container.appendChild(span);
  });
}

// 生成随机技能
function generateRandomTricks(count) {
  if (!BattleState.tricks || BattleState.tricks.length === 0) {
    return Array(count)
      .fill()
      .map((_, i) => `默认技能${i + 1}`);
  }

  const numTricks = Math.min(count, BattleState.tricks.length);
  const shuffled = [...BattleState.tricks].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, numTricks).map((trick) => trick.name);
}

// 更新技池
function updateTrickPools() {
  if (!BattleState.tricksLoaded) {
    // 如果技能数据未加载，延迟更新
    setTimeout(updateTrickPools, 500);
    return;
  }

  if (!DOM.tricksPoolPlayer1 || !DOM.tricksPoolPlayer2) {
    console.error("找不到技池DOM元素");
    return;
  }

  // 清空现有技池
  DOM.tricksPoolPlayer1.innerHTML = "";
  DOM.tricksPoolPlayer2.innerHTML = "";

  // 获取所有技能名称
  const trickNames = BattleState.tricks.map((trick) => trick.name);

  // 显示技池
  trickNames.forEach((trick) => {
    // 选手1技池
    const span1 = document.createElement("span");
    span1.innerText = trick;
    span1.classList.add("trick-item");
    span1.addEventListener("click", () => toggleCross(span1));
    span1.addEventListener("mousedown", handleMiddleClick);
    DOM.tricksPoolPlayer1.appendChild(span1);

    // 选手2技池
    const span2 = document.createElement("span");
    span2.innerText = trick;
    span2.classList.add("trick-item");
    span2.addEventListener("click", () => toggleCross(span2));
    span2.addEventListener("mousedown", handleMiddleClick);
    DOM.tricksPoolPlayer2.appendChild(span2);
  });
}

// 设置获胜者 (全局函数)
window.setWinner = function (playerId) {
  // 移除先前样式
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");

  // 设置获胜者
  const winnerElement = document.getElementById(playerId);
  const loserElement = document.getElementById(
    playerId === "player1" ? "player2" : "player1"
  );

  // 获取赢家名称
  BattleState.currentWinner = document.getElementById(
    `${playerId}-name`
  ).innerText;

  // 添加样式
  winnerElement.classList.add("winner");
  loserElement.classList.add("loser");

  // 显示提示
  showWinnerAnnouncement(BattleState.currentWinner);
  saveGameState();
};
