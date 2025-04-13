/**
 * 一年加组对战系统 - 第二章节（事件模块）
 * 包含事件监听和处理函数
 */

// 设置事件监听器
function setupEventListeners() {
  // 随机匹配按钮
  if (DOM.randomMatchBtn) {
    DOM.randomMatchBtn.addEventListener("click", randomizeMatches);
  }

  // 抽取音乐按钮
  if (DOM.drawMusicBtn) {
    DOM.drawMusicBtn.addEventListener("click", handleDrawMusic);
  }

  // 播放音乐按钮
  if (DOM.playMusicBtn) {
    DOM.playMusicBtn.addEventListener("click", handlePlayMusic);
  }

  // 下一场按钮
  if (DOM.nextMatchBtn) {
    DOM.nextMatchBtn.addEventListener("click", handleNextMatch);
  }

  // 重置游戏按钮
  if (DOM.resetGameBtn) {
    DOM.resetGameBtn.addEventListener("click", resetGame);
  }

  // 清除缓存按钮
  if (DOM.clearCacheBtn) {
    DOM.clearCacheBtn.addEventListener("click", clearCacheAndResetGame);
  }

  // 添加自动保存功能
  setupAutoSave();
}

// 创建并添加随机匹配按钮
function addRandomMatchButton() {
  if (document.getElementById("random-match-btn")) return; // 避免重复添加

  const actionsContainer = document.querySelector(".actions");
  if (!actionsContainer) return;

  const randomMatchBtn = document.createElement("button");
  randomMatchBtn.id = "random-match-btn";
  randomMatchBtn.innerText = "随机匹配";
  randomMatchBtn.style.borderColor = "#28a745";
  randomMatchBtn.style.boxShadow = "0 0 5px rgba(40, 167, 69, 0.3)";

  // 插入到开始比赛按钮之前
  if (DOM.startMatchBtn && DOM.startMatchBtn.parentNode) {
    actionsContainer.insertBefore(randomMatchBtn, DOM.startMatchBtn);
  } else {
    actionsContainer.appendChild(randomMatchBtn);
  }

  // 更新缓存的DOM引用
  DOM.randomMatchBtn = randomMatchBtn;

  // 添加事件监听
  DOM.randomMatchBtn.addEventListener("click", randomizeMatches);
}

// 随机匹配选手处理函数
function randomizeMatches() {
  console.log("执行随机匹配");

  if (!BattleState.playersLoaded || BattleState.players.length < 4) {
    showToast("选手数据不足，无法随机匹配", "warning");
    return;
  }

  // 获取当前的四名选手
  const currentPlayers = BattleState.players.slice(0, 4);

  // 随机打乱选手顺序
  const shuffledPlayers = [...currentPlayers].sort(() => Math.random() - 0.5);

  // 更新玩家数组
  for (let i = 0; i < 4 && i < shuffledPlayers.length; i++) {
    BattleState.players[i] = shuffledPlayers[i];
  }

  // 如果在第一轮且胜者组第一轮第一场，重新初始化比赛
  if (
    BattleState.currentRound === 1 &&
    BattleState.currentBracket === "winner" &&
    BattleState.currentMatchIndex === 0
  ) {
    // 重新初始化比赛安排
    initializeTournamentBracket();

    // 刷新比赛显示
    displayCurrentMatch();
    updateBracketDisplay();

    showToast("选手已随机匹配", "success");
  } else {
    showToast("只能在比赛开始前随机匹配选手", "warning");
  }
}

// 处理抽取音乐
function handleDrawMusic() {
  console.log("执行抽取音乐");

  if (!BattleState.musicLoaded) {
    showToast("音乐数据正在加载，请稍候", "info");
    return;
  }

  if (BattleState.musicList.length === 0) {
    showToast("音乐列表为空", "error");
    return;
  }

  // 随机抽取音乐
  const randomIndex = Math.floor(Math.random() * BattleState.musicList.length);
  const selectedMusic = BattleState.musicList[randomIndex];

  // 更新UI
  DOM.musicName.innerText = selectedMusic;
  DOM.musicPlayer.src = `../resource/musics/1yearplus_ex/${selectedMusic}`;

  showToast(`已抽取音乐: ${selectedMusic}`, "success");
}

// 处理播放音乐
function handlePlayMusic() {
  console.log("执行播放音乐");

  if (!DOM.musicPlayer.src) {
    showToast("请先抽取音乐", "warning");
    return;
  }

  if (DOM.musicPlayer.paused) {
    // 如果已在播放模式，先停止
    if (BattleState.isMusicPlaying) {
      stopMusicMode();
      return;
    }

    // 启动音乐播放模式
    startMusicMode();
  } else {
    // 停止播放
    stopMusicMode();
  }
}

// 处理下一场比赛
function handleNextMatch() {
  console.log("执行下一场比赛");

  // 检查当前比赛是否已完成
  const currentMatch = getCurrentMatch();
  if (!currentMatch || !currentMatch.winner) {
    showToast("请先通过点击选手确定本场比赛的获胜者", "warning");
    return;
  }

  // 更新赛程
  updateTournamentProgress();

  // 检查比赛是否已全部完成
  if (BattleState.tournamentCompleted) {
    // 比赛已全部完成
    const winner = determineTournamentWinner();
    if (winner) {
      showToast(`双败赛制比赛已全部完成，最终获胜者是 ${winner}！`, "success");

      // 保存最终获胜者
      saveChapter2Winner(winner);

      // 显示最终获胜提示
      showFinalWinnerAnnouncement(winner);
    } else {
      showToast("比赛已完成，但无法确定获胜者", "error");
    }
    return;
  }

  // 检查是否进入决赛第二轮
  if (
    BattleState.currentBracket === "final" &&
    BattleState.currentRound === 2
  ) {
    showToast("进入冠军决定战！胜者组选手需再输一场才会被淘汰", "info");
  }

  // 获取新的当前比赛
  const nextMatch = getCurrentMatch();
  if (!nextMatch) {
    showToast("没有下一场比赛了", "warning");
    return;
  }

  // 重置选手区域
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");
  BattleState.currentWinner = null;

  // 显示新的比赛
  displayCurrentMatch();
  updateBracketDisplay();
  updateRoundDisplay();

  // 保存状态
  saveGameState();
}

// 新增合并功能：清除缓存并重置游戏
function clearCacheAndResetGame() {
  try {
    // 清除本地存储
    localStorage.removeItem("battleGroup1-2State");
    localStorage.removeItem("chapter1Winners");
    localStorage.removeItem("chapter2Winner");

    // 显示处理中提示
    showToast("正在重置比赛并清除缓存...", "info");

    // 清除服务器缓存
    Promise.all([
      // 清除battle-group1-2进度
      fetch("http://localhost:3000/api/clear-battle-group1-2-process", {
        method: "POST",
      }),
      // 获取最新的winners.json数据
      fetch("../resource/json/winners.json", {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache",
        },
      }).then((response) => response.json()),
    ])
      .then(([clearResponse, winnersData]) => {
        if (!clearResponse.ok) {
          throw new Error("清除服务器缓存失败");
        }

        console.log("缓存已清除，获取到最新获胜者数据:", winnersData);

        // 重新加载选手数据
        loadPlayers().then(() => {
          // 初始化新游戏
          initializeNewGame();

          // 更新UI
          updateBracketDisplay();
          updateRoundDisplay();

          // 重置选手区域
          DOM.player1Name.innerText = "";
          DOM.player2Name.innerText = "";
          DOM.player1.classList.remove("winner", "loser");
          DOM.player2.classList.remove("winner", "loser");
          updatePlayerStatsDisplay();

          // 重置音乐
          DOM.musicName.innerText = "音乐名称";
          DOM.musicPlayer.src = "";

          showToast("比赛已完全重置，使用最新数据", "success");

          // 刷新页面以确保所有状态都是最新的
          setTimeout(() => location.reload(), 1500);
        });
      })
      .catch((error) => {
        console.error("重置失败:", error);
        showToast("重置失败: " + error.message, "error");
      });
  } catch (error) {
    console.error("重置失败:", error);
    showToast("重置失败: " + error.message, "error");
  }
}

// 清除缓存 (保留原函数，但在新流程中不再单独使用)
function clearCache() {
  try {
    // 确认对话框
    if (!confirm("确定要清除所有缓存数据吗？此操作将无法恢复。")) {
      return;
    }

    // 清除本地存储
    localStorage.removeItem("battleGroup1-2State");
    localStorage.removeItem("chapter1Winners");
    localStorage.removeItem("chapter2Winner");

    // 清除服务器缓存
    fetch("http://localhost:3000/api/clear-battle-group1-2-process", {
      method: "POST",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("服务器响应错误");
        }
        return response.text();
      })
      .then(() => {
        console.log("所有缓存已清除");

        // 重置battle-group1-2-process.json文件
        return fetch("http://localhost:3000/api/reset-battle-process", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chapter: 2,
            confirm: true,
          }),
        });
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error("重置battle-group1-2-process.json失败");
        }
        showToast("缓存已清除", "success");
        // 重置游戏状态
        setTimeout(() => location.reload(), 1000);
      })
      .catch((error) => {
        console.error("清除缓存失败:", error);
        showToast("清除缓存失败: " + error.message, "error");
      });
  } catch (error) {
    console.error("清除缓存失败:", error);
    showToast("清除缓存失败", "error");
  }
}

// 重置游戏 (保留原函数，但在新流程中不再单独使用)
function resetGame() {
  // 清除缓存
  localStorage.removeItem("battleGroup1-2State");

  // 初始化新游戏
  initializeNewGame();

  // 更新UI
  updateBracketDisplay();
  updateRoundDisplay();

  // 重置选手区域
  DOM.player1Name.innerText = "";
  DOM.player2Name.innerText = "";
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");
  updatePlayerStatsDisplay();

  // 重置音乐
  DOM.musicName.innerText = "音乐名称";
  DOM.musicPlayer.src = "";

  showToast("游戏已重置", "success");
}

// 设置获胜者 (HTML内联事件调用)
window.setWinner = function (playerId) {
  // 检查当前比赛是否存在
  const currentMatch = getCurrentMatch();
  if (!currentMatch) {
    showToast("没有正在进行的比赛", "error");
    return;
  }

  // 如果比赛已有获胜者，提示已完成
  if (currentMatch.winner) {
    showToast("当前比赛已经有获胜者，请进入下一场比赛", "warning");
    return;
  }

  // 移除先前样式
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");

  // 获取选手名称
  const player1Name = DOM.player1Name.innerText;
  const player2Name = DOM.player2Name.innerText;

  // 设置获胜者
  const winnerElement = document.getElementById(playerId);
  const loserElement = document.getElementById(
    playerId === "player1" ? "player2" : "player1"
  );

  // 获取胜者和败者名称
  const winnerName = playerId === "player1" ? player1Name : player2Name;
  const loserName = playerId === "player1" ? player2Name : player1Name;

  // 保存结果到当前比赛
  currentMatch.winner = winnerName;
  currentMatch.loser = loserName;

  // 更新选手战绩
  updatePlayerStats(winnerName, loserName);

  // 添加样式
  winnerElement.classList.add("winner");
  loserElement.classList.add("loser");

  // 记录当前获胜者
  BattleState.currentWinner = winnerName;

  // 显示提示
  showWinnerAnnouncement(winnerName);

  // 保存游戏状态
  saveGameState();

  // 更新赛程图
  updateBracketDisplay();
};

// 处理页面点击事件 (用于音乐播放模式)
function handleDocumentClick(event) {
  if (BattleState.isMusicPlaying) {
    // 确保不是点击播放器或提示
    if (
      !DOM.musicPlayer.contains(event.target) &&
      event.target.id !== "click-to-stop-hint"
    ) {
      stopMusicMode();
    }
  }
}

// 添加自动保存定时器
function setupAutoSave() {
  // 每60秒自动保存一次
  setInterval(saveGameState, 60000);
}
