/**
 * 一年内组比赛界面 - 上半场（事件模块）
 * 处理事件监听和回调
 */

// 设置事件监听器
function setupEventListeners() {
  // 随机排序选手按钮
  DOM.shuffleButton.addEventListener("click", shufflePlayers);

  // 抽取技名按钮
  DOM.drawTrickButton.addEventListener("click", drawRandomTrick);

  // 抽取音乐按钮
  DOM.drawMusicButton.addEventListener("click", drawRandomMusic);

  // 播放音乐按钮
  DOM.playMusicButton.addEventListener("click", handlePlayMusic);

  // 下一位选手按钮
  DOM.nextPlayerButton.addEventListener("click", goToNextPlayer);

  // 返回主页按钮
  DOM.homeButton.addEventListener("click", () => {
    saveState(); // 保存状态
    window.location.href = "index.html";
  });

  // 清除缓存按钮
  DOM.clearCacheButton.addEventListener("click", clearCache);
}

// 处理播放音乐按钮点击
function handlePlayMusic() {
  console.log("点击播放按钮, 当前文件:", AppState.currentMusicFile);

  if (!AppState.currentMusicFile) {
    showToast("请先抽取音乐", "warning");
    return;
  }

  try {
    // 如果已在播放模式，先停止
    if (AppState.isMusicPlaying) {
      stopMusicMode();
      return;
    }

    if (DOM.musicPlayer.paused) {
      // 启动音乐播放动画模式，而不是直接播放
      startMusicMode();
    } else {
      // 暂停音乐
      DOM.musicPlayer.pause();
      DOM.playMusicButton.textContent = "播放音乐";
      console.log("音乐已暂停");
    }
  } catch (error) {
    console.error("播放音乐错误:", error);
    showToast("播放音乐时出错", "error");
  }
}
