/**
 * 一年内组比赛界面 - 第二章节（事件模块）
 * 管理事件监听器
 */

// 设置所有事件监听器
function setupEventListeners() {
  // 随机排序选手
  if (document.getElementById("shuffleButton")) {
    document
      .getElementById("shuffleButton")
      .addEventListener("click", shufflePlayers);
  } else if (DOM.shuffleButton) {
    DOM.shuffleButton.addEventListener("click", shufflePlayers);
  }
  /*
  // 抽取技名
  if (document.getElementById("drawTrickButton")) {
    document
      .getElementById("drawTrickButton")
      .addEventListener("click", drawRandomTrick);
  } else if (DOM.drawTrickButton) {
    DOM.drawTrickButton.addEventListener("click", drawRandomTrick);
  }*/

  // 抽取音乐
  if (document.getElementById("drawMusicButton")) {
    document
      .getElementById("drawMusicButton")
      .addEventListener("click", drawRandomMusic);
  } else if (DOM.drawMusicButton) {
    DOM.drawMusicButton.addEventListener("click", drawRandomMusic);
  }

  // 播放音乐
  if (document.getElementById("playMusicButton")) {
    document
      .getElementById("playMusicButton")
      .addEventListener("click", toggleMusicPlayback);
  } else if (DOM.playMusicButton) {
    DOM.playMusicButton.addEventListener("click", toggleMusicPlayback);
  }

  // 下一个选手
  if (document.getElementById("nextPlayerButton")) {
    document
      .getElementById("nextPlayerButton")
      .addEventListener("click", goToNextPlayer);
  } else if (DOM.nextPlayerButton) {
    DOM.nextPlayerButton.addEventListener("click", goToNextPlayer);
  }

  // 音乐播放结束事件
  DOM.musicPlayer.addEventListener("ended", handleMusicEnded);

  // 清除缓存
  DOM.clearCacheButton.addEventListener("click", clearCache);

  // 返回主页
  DOM.homeButton.addEventListener("click", () => {
    saveState();
    window.location.href = "index.html";
  });

  // 添加离开页面前保存
  window.addEventListener("beforeunload", saveState);

  // 查找清除音乐按钮并添加事件（如果存在）
  const clearMusicButton = document.getElementById("clearMusicButton");
  if (clearMusicButton) {
    clearMusicButton.addEventListener("click", clearMusic);
  }

  // 隐藏音乐播放进度
  DOM.musicPlayer.style.display = "none";
}

// 添加音乐播放模式功能
function startMusicMode() {
  // 添加音乐播放模式类
  document.body.classList.add("music-playing-mode");

  // 创建遮罩
  const overlay = document.createElement("div");
  overlay.classList.add("battle-overlay");
  document.body.appendChild(overlay);

  // 创建 Battle Start 动画
  const battleStart = document.createElement("div");
  battleStart.classList.add("battle-start");

  // 添加文字动画效果
  setTimeout(() => {
    battleStart.innerText = "B";
    document.body.appendChild(battleStart);
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
    battleStart.innerText = "BATTLE M";
  }, 800);

  setTimeout(() => {
    battleStart.innerText = "BATTLE MO";
  }, 900);

  setTimeout(() => {
    battleStart.innerText = "BATTLE MOD";
  }, 1000);

  setTimeout(() => {
    battleStart.innerText = "BATTLE MODE";
    battleStart.classList.add("shake");
  }, 1100);

  // 添加点击提示
  const clickToStop = document.createElement("div");
  clickToStop.classList.add("click-to-stop");
  clickToStop.innerText = "点击任意位置停止";
  clickToStop.id = "click-to-stop-hint";
  document.body.appendChild(clickToStop);

  // 动画结束后播放音乐
  setTimeout(() => {
    if (document.body.contains(battleStart)) {
      document.body.removeChild(battleStart);

      // 播放音乐
      DOM.musicPlayer.play();
      DOM.musicPlayer.style.display = "block";

      // 更新状态
      AppState.isMusicPlaying = true;

      // 添加事件监听
      document.addEventListener("click", handleDocumentClick);
    }
  }, 3000);
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
  AppState.isMusicPlaying = false;
  DOM.playMusicButton.textContent = "播放音乐";
}

// 处理页面点击事件 (用于音乐播放模式)
function handleDocumentClick(event) {
  if (AppState.isMusicPlaying) {
    // 确保不是点击播放器或提示
    if (
      !DOM.musicPlayer.contains(event.target) &&
      event.target.id !== "click-to-stop-hint" &&
      !event.target.closest("#playMusicButton")
    ) {
      stopMusicMode();
    }
  }
}

// 重写toggleMusicPlayback处理函数，支持音乐模式
function toggleMusicPlayback() {
  console.log("切换音乐播放状态, 当前文件:", AppState.currentMusicFile);

  if (!AppState.currentMusicFile) {
    showToast("请先抽取音乐", "warning");
    return;
  }

  if (DOM.musicPlayer.src && !DOM.musicPlayer.paused) {
    // 音乐正在播放，暂停它
    console.log("停止正在播放的音乐");
    stopMusicMode();
  } else if (DOM.musicPlayer.src && AppState.isMusicPaused) {
    // 音乐已暂停，继续播放
    console.log("继续播放已暂停的音乐");
    DOM.musicPlayer.play();
    AppState.isMusicPaused = false;
    DOM.playMusicButton.textContent = "暂停播放";
    DOM.musicPlayer.style.display = "block";
  } else {
    // 加载并播放新音乐 - 确保音乐路径正确
    console.log("正在加载新音乐:", AppState.currentMusicFile);

    try {
      // 重置播放器状态
      DOM.musicPlayer.pause();
      DOM.musicPlayer.currentTime = 0;

      // 处理特殊文件名 - 构建正确的音乐路径
      // 使用原始文件名，不进行URL编码
      const musicPath = `../resource/musics/1yearminus/${AppState.currentMusicFile}`;
      console.log("音乐完整路径:", musicPath);

      // 设置src之前先移除onended和onerror事件处理器
      DOM.musicPlayer.onended = null;
      DOM.musicPlayer.onerror = null;

      // 设置新的src
      DOM.musicPlayer.src = musicPath;

      // 先检查音乐文件是否存在
      fetch(musicPath, { method: "HEAD" })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`音乐文件不存在 (${response.status})`);
          }

          // 文件存在，可以安全播放
          console.log("音乐文件存在，准备播放");

          // 预加载一小段
          DOM.musicPlayer.load();

          // 设置错误处理
          DOM.musicPlayer.onerror = function () {
            console.error("音乐播放失败:", DOM.musicPlayer.error);
            stopMusicMode();
            showToast(`音乐无法播放: ${AppState.currentMusicFile}`, "error");
          };

          // 启动音乐播放模式
          startMusicMode();
        })
        .catch((error) => {
          console.error("音乐文件检查失败:", error);
          showToast(`音乐文件不可用: ${error.message}`, "error");

          // 尝试使用替代路径
          const alternativePath = `../resource/music/${AppState.currentMusicFile}`;
          console.log("尝试替代路径:", alternativePath);

          DOM.musicPlayer.src = alternativePath;
          DOM.musicPlayer.load();
          startMusicMode();
        });
    } catch (err) {
      console.error("播放音乐时发生错误:", err);
      showToast("播放音乐时出错", "error");
    }
  }
}
