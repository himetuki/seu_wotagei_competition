/**
 * 一年加组对战系统 - 事件模块
 * 包含事件监听和处理函数
 */

// 设置事件监听器
function setupEventListeners() {
  // 检查DOM元素是否已缓存
  if (
    !DOM.drawPlayersBtn ||
    !DOM.drawMusicBtn ||
    !DOM.drawTricksBtn ||
    !DOM.playMusicBtn ||
    !DOM.nextRoundBtn ||
    !DOM.resetGameBtn
  ) {
    console.error("无法找到必要的DOM元素，请检查HTML结构");
    showToast("页面加载错误，请刷新重试", "error");
    return;
  }

  // 功能按钮事件监听
  DOM.drawPlayersBtn.addEventListener("click", handleDrawPlayers);
  DOM.drawMusicBtn.addEventListener("click", handleDrawMusic);
  DOM.drawTricksBtn.addEventListener("click", handleDrawTricks);
  DOM.playMusicBtn.addEventListener("click", handlePlayMusic);
  DOM.nextRoundBtn.addEventListener("click", handleNextRound);

  // 重置按钮
  DOM.resetGameBtn.addEventListener("click", function () {
    if (confirm("确定要重置当前对战进度吗？将开始新的章节。")) {
      resetGame();
    }
  });

  // 导航按钮
  DOM.homeBtn.addEventListener("click", function () {
    window.location.href = "index.html";
  });

  // 添加清除缓存按钮事件监听
  if (DOM.clearCacheBtn) {
    DOM.clearCacheBtn.addEventListener("click", clearCache);
  }

  // 选手区域点击事件由HTML内联事件处理 (onclick="setWinner")

  // 页面卸载前保存状态
  window.addEventListener("beforeunload", saveGameState);

  // 添加自动保存
  setupAutoSave();
}

// 处理抽取选手
function handleDrawPlayers() {
  console.log("执行抽取选手");

  if (!BattleState.playersLoaded) {
    showToast("选手数据正在加载，请稍候", "info");
    return;
  }

  if (BattleState.players.length < 2) {
    showToast("选手数量不足，无法进行对战", "error");
    return;
  }

  // 抽取未参战选手
  drawAvailablePlayers();
  saveGameState();
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
  DOM.musicPlayer.src = `../resource/musics/1yearplus/${selectedMusic}`;

  showToast(`已抽取音乐: ${selectedMusic}`, "success");
}

// 处理抽取动作
function handleDrawTricks() {
  console.log("执行抽取动作");

  if (!BattleState.tricksLoaded) {
    showToast("技能数据正在加载，请稍候", "info");
    return;
  }

  // 确保技池已显示
  if (
    !DOM.tricksPoolPlayer1.children.length ||
    !DOM.tricksPoolPlayer2.children.length
  ) {
    updateTrickPools();
    setTimeout(handleDrawTricks, 500);
    return;
  }

  // 获取未划线的技能
  const player1Tricks = Array.from(
    DOM.tricksPoolPlayer1.querySelectorAll(".trick-item:not(.crossed)")
  );
  const player2Tricks = Array.from(
    DOM.tricksPoolPlayer2.querySelectorAll(".trick-item:not(.crossed)")
  );

  if (player1Tricks.length === 0 || player2Tricks.length === 0) {
    showToast("技池中没有可用的技能", "error");
    return;
  }

  // 随机选择技能
  const player1Trick =
    player1Tricks[Math.floor(Math.random() * player1Tricks.length)].innerText;
  const player2Trick =
    player2Tricks[Math.floor(Math.random() * player2Tricks.length)].innerText;

  // 更新选中的技能状态
  BattleState.selectedPlayer1Trick = player1Trick;
  BattleState.selectedPlayer2Trick = player2Trick;

  // 显示结果
  displayTrickMatch(player1Trick, player2Trick);
  saveGameState();
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

// 启动音乐播放模式
function startMusicMode() {
  // 添加音乐播放模式类
  document.body.classList.add("music-playing-mode");

  // 创建遮罩
  const overlay = document.createElement("div");
  overlay.classList.add("battle-overlay");
  document.body.appendChild(overlay);

  // 添加震动效果
  document.body.classList.add("shake");
  setTimeout(() => document.body.classList.remove("shake"), 500);

  // 创建 Battle Start 动画
  const battleStart = document.createElement("div");
  battleStart.classList.add("battle-start");

  // 文字动画效果
  setTimeout(() => {
    battleStart.innerText = "B";
    document.body.appendChild(battleStart);
  }, 200); // 延长至200ms

  setTimeout(() => {
    battleStart.innerText = "BA";
  }, 300); // 延长至300ms

  setTimeout(() => {
    battleStart.innerText = "BAT";
  }, 400); // 延长至400ms

  setTimeout(() => {
    battleStart.innerText = "BATT";
  }, 500); // 延长至500ms

  setTimeout(() => {
    battleStart.innerText = "BATTL";
  }, 600); // 延长至600ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE";
  }, 700); // 延长至700ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE ";
  }, 800); // 延长至800ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE S";
  }, 900); // 延长至900ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE ST";
  }, 1000); // 延长至1000ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE STA";
  }, 1100); // 延长至1100ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE STAR";
  }, 1200); // 延长至1200ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE START";
    battleStart.classList.add("shake");
  }, 1300); // 延长至1300ms

  // 动画结束后播放音乐
  setTimeout(() => {
    if (document.body.contains(battleStart)) {
      document.body.removeChild(battleStart);

      // 移除遮罩
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }

      // 添加点击提示
      const clickToStop = document.createElement("div");
      clickToStop.classList.add("click-to-stop");
      clickToStop.innerText = "点击任意位置停止";
      clickToStop.id = "click-to-stop-hint";
      document.body.appendChild(clickToStop);

      // 播放音乐
      DOM.musicPlayer.play();
      DOM.musicPlayer.style.display = "block";

      // 更新状态
      BattleState.isMusicPlaying = true;

      // 添加事件监听
      DOM.musicPlayer.onended = stopMusicMode;
      document.addEventListener("click", handleDocumentClick);
    }
  }, 4500); // 延长至4500ms
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

  // 移除提示
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

// 处理页面点击事件
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

// 处理中键点击函数
function handleMiddleClick(event) {
  if (event.button !== 1) return;

  event.preventDefault();

  const trickName = event.target.innerText;
  const isPlayer1Pool =
    event.target.closest("#tricks-pool-list-player1") !== null;

  // 更新选中的技能状态
  if (isPlayer1Pool) {
    BattleState.selectedPlayer1Trick = trickName;
  } else {
    BattleState.selectedPlayer2Trick = trickName;
  }

  // 显示技能对决
  displayTrickMatch(
    BattleState.selectedPlayer1Trick,
    BattleState.selectedPlayer2Trick
  );

  // 保存状态
  saveGameState();

  // 视觉反馈
  event.target.classList.add("middle-clicked");
  setTimeout(() => event.target.classList.remove("middle-clicked"), 300);
}
