/**
 * 定时搬化棒 - 核心功能模块
 * 负责游戏的核心逻辑和状态管理
 */

// 游戏状态
const GameState = {
  isPlaying: false,
  isPaused: false,
  timeLimit: 60, // 秒
  isGameOver: false,
  availableMusics: [],
  currentMusic: null,
  interfaceOpacity: 0.8, // 添加界面透明度设置，默认80%
};

// 游戏初始化
function initGame() {
  // 从设置加载游戏配置
  loadGameSettings().then(() => {
    // 加载音乐列表
    loadMusicList().then(() => {
      // 更新UI显示
      updateTimeLimitDisplay();
    });
  });
}

// 加载音乐列表
async function loadMusicList() {
  try {
    const response = await fetch("../../resource/json/games_musics.json");
    if (response.ok) {
      const musicList = await response.json();
      GameState.availableMusics = musicList;
      console.log("加载音乐列表成功, 共", musicList.length, "首");
    } else {
      console.error("无法加载音乐列表，状态码:", response.status);
    }
  } catch (error) {
    console.error("加载音乐列表出错:", error);
  }
}

// 选择随机音乐
function selectRandomMusic() {
  if (GameState.availableMusics.length > 0) {
    const randomIndex = Math.floor(
      Math.random() * GameState.availableMusics.length
    );
    GameState.currentMusic = GameState.availableMusics[randomIndex];

    // 更新UI显示
    document.getElementById("music-name").textContent =
      GameState.currentMusic.replace(".mp3", "");

    // 设置音乐源 - 修改为新的音乐路径
    const musicPlayer = document.getElementById("game-music");
    musicPlayer.src = `../../resource/musics/games_musics/${GameState.currentMusic}`;
    musicPlayer.load(); // 预加载音乐

    return GameState.currentMusic;
  }
  return null;
}

// 播放当前音乐
function playGameMusic() {
  const musicPlayer = document.getElementById("game-music");
  if (GameState.currentMusic) {
    musicPlayer.play();
  } else {
    // 如果没有选择音乐，选择一个并播放
    selectRandomMusic();
    setTimeout(() => musicPlayer.play(), 100);
  }
}

// 暂停当前音乐
function pauseGameMusic() {
  const musicPlayer = document.getElementById("game-music");
  musicPlayer.pause();
}

// 停止当前音乐
function stopGameMusic() {
  const musicPlayer = document.getElementById("game-music");
  musicPlayer.pause();
  musicPlayer.currentTime = 0;
}

// 开始游戏
function startGame() {
  // 如果游戏已经在进行中，则不执行任何操作
  if (GameState.isPlaying) return;

  // 显示3秒倒计时
  showCountdown().then(() => {
    // 倒计时结束后，实际开始游戏
    GameState.isPlaying = true;
    GameState.isPaused = false;
    GameState.isGameOver = false;

    // 启动计时器
    startTimer();

    // 启动化棒动画
    FloatingSticks.start();

    // 播放背景音乐
    playGameMusic();

    // 更新按钮状态
    updateButtonStates();
  });
}

// 显示3秒倒计时
function showCountdown() {
  return new Promise((resolve) => {
    // 创建遮罩
    const overlay = document.createElement("div");
    overlay.classList.add("countdown-overlay");
    document.body.appendChild(overlay);

    // 创建倒计时容器
    const countdownContainer = document.createElement("div");
    countdownContainer.classList.add("countdown-container");
    document.body.appendChild(countdownContainer);

    // 获取非倒计时元素并应用透明度
    applyInterfaceOpacity(true);

    // 设置初始倒计时数字
    let count = 3;

    // 创建音频上下文(用于生成8bit音效)
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();

    // 播放倒计时音效(8bit风格)
    function playBeepSound() {
      // 创建振荡器
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      // 设置方波音色(类似8bit音效)
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5音

      // 设置音量包络
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.2
      );

      // 连接节点
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // 开始和停止
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
    }

    // 播放开始音效(更欢快的8bit风格)
    function playStartSound() {
      // 创建多个音符形成一个欢快的开始音效
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      const durations = [0.1, 0.1, 0.1, 0.3];

      notes.forEach((freq, index) => {
        setTimeout(() => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();

          oscillator.type = "square";
          oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);

          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            audioContext.currentTime + durations[index]
          );

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);

          oscillator.start();
          oscillator.stop(audioContext.currentTime + durations[index]);
        }, index * 150);
      });
    }

    // 更新倒计时函数
    const updateCountdown = () => {
      // 播放beep音效
      playBeepSound();

      // 更新倒计时显示
      countdownContainer.textContent = count;
      countdownContainer.classList.add("countdown-animation");

      // 移除动画类以便重新触发
      setTimeout(() => {
        countdownContainer.classList.remove("countdown-animation");
      }, 900);

      // 减少计数
      count--;

      if (count >= 0) {
        // 继续倒计时
        setTimeout(updateCountdown, 1000);
      } else {
        // 播放开始音效
        playStartSound();

        // 显示"开始!"文本
        countdownContainer.textContent = "开始!";
        countdownContainer.classList.add("start-animation");

        // 倒计时结束，移除元素并解析Promise
        setTimeout(() => {
          document.body.removeChild(overlay);
          document.body.removeChild(countdownContainer);
          resolve();
        }, 1000);
      }
    };

    // 开始倒计时
    setTimeout(updateCountdown, 500);
  });
}

// 设置界面元素透明度
function applyInterfaceOpacity(isCountdownActive) {
  const opacity = isCountdownActive ? GameState.interfaceOpacity : 1;

  // 选择需要变透明的元素（除开始倒计时、游戏倒计时、背景图以外的元素）
  const elementsToModify = [
    ".navigation",
    ".timer-controls",
    ".time-setting",
    "header",
    "footer",
  ];

  elementsToModify.forEach((selector) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach((element) => {
      element.style.transition = "opacity 0.3s ease";
      element.style.opacity = opacity;
    });
  });
}

// 暂停游戏
function pauseGame() {
  GameState.isPaused = true;
  pauseTimer();
  pauseGameMusic();

  // 暂停浮动化棒动画
  FloatingSticks.stop();

  updateButtonStates();
}

// 继续游戏
function resumeGame() {
  GameState.isPaused = false;
  resumeTimer();
  playGameMusic();

  // 恢复浮动化棒动画
  FloatingSticks.start();

  updateButtonStates();
}

// 重置游戏
function resetGame() {
  GameState.isPlaying = false;
  GameState.isPaused = false;
  GameState.isGameOver = false;

  // 重置计时器
  resetTimer();

  // 停止音乐
  stopGameMusic();

  // 停止浮动化棒动画
  FloatingSticks.stop();

  // 恢复元素透明度
  applyInterfaceOpacity(false);

  // 更新按钮状态
  updateButtonStates();

  // 隐藏结果模态框
  hideResultModal();

  // 选择新的音乐
  selectRandomMusic();
}

// 游戏结束
function endGame() {
  GameState.isPlaying = false;
  GameState.isGameOver = true;

  // 停止计时器
  stopTimer();

  // 停止音乐
  stopGameMusic();

  // 恢复元素透明度
  applyInterfaceOpacity(false);

  // 浮动化棒会在showResultModal中停止

  // 更新按钮状态
  updateButtonStates();

  // 显示结果
  showResultModal();
}

// 更新按钮状态
function updateButtonStates() {
  const startBtn = document.getElementById("start-timer-btn");
  const pauseBtn = document.getElementById("pause-timer-btn");
  const resetBtn = document.getElementById("reset-timer-btn");

  if (GameState.isPlaying && !GameState.isPaused) {
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    pauseBtn.textContent = "暂停";
    resetBtn.disabled = false;
  } else if (GameState.isPaused) {
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    pauseBtn.textContent = "继续";
    resetBtn.disabled = false;
  } else {
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = "暂停";
    resetBtn.disabled = GameState.isGameOver === false;
  }
}

// 当页面加载完成时初始化游戏
document.addEventListener("DOMContentLoaded", () => {
  // 初始化游戏
  initGame();

  // 设置按钮事件监听
  document
    .getElementById("start-timer-btn")
    .addEventListener("click", startGame);
  document.getElementById("pause-timer-btn").addEventListener("click", () => {
    if (GameState.isPaused) {
      resumeGame();
    } else {
      pauseGame();
    }
  });
  document
    .getElementById("reset-timer-btn")
    .addEventListener("click", resetGame);

  // 设置结果模态框按钮事件
  document.getElementById("try-again-btn").addEventListener("click", resetGame);
  document.getElementById("back-to-menu-btn").addEventListener("click", () => {
    window.location.href = "../games_select.html";
  });

  // 设置导航按钮事件
  document.getElementById("settings-btn").addEventListener("click", () => {
    window.location.href = "moving_sth_settings.html";
  });
  document.getElementById("back-btn").addEventListener("click", () => {
    window.location.href = "../games_select.html";
  });
  document.getElementById("home-btn").addEventListener("click", () => {
    window.location.href = "../index.html";
  });
});
