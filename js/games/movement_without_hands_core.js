/**
 * 体态传技 - 核心模块
 * 处理游戏状态和核心逻辑
 */

// 游戏状态
const GameState = {
  isInitialized: false, // 游戏是否已初始化
  isPlaying: false, // 游戏是否正在进行
  isPaused: false, // 游戏是否暂停
  timerInterval: null, // 计时器间隔引用
  elapsedSeconds: 0, // 已经过的秒数
  startTimestamp: null, // 游戏开始的时间戳
  audioContext: null, // 音频上下文
  metronomeInterval: null, // 节拍器间隔引用
  beatsPerMinute: 120, // 默认BPM值
};

// 初始化游戏
async function initializeGame() {
  console.log("正在初始化游戏...");

  // 先尝试加载GameData（如果它提供加载方法）
  if (window.GameData && typeof window.GameData.loadSettings === "function") {
    try {
      await window.GameData.loadSettings();
      console.log("已加载游戏设置:", window.GameData.settings);
    } catch (e) {
      console.error("加载游戏设置失败:", e);
    }
  }

  // 加载BPM设置
  loadBpmSetting();

  if (GameState.isInitialized) return;

  // 加载技能数据
  await loadTricks();

  // 加载游戏进度
  const savedProgress = await loadGameProgress();

  if (savedProgress && savedProgress.isPlaying) {
    // 恢复进行中的游戏
    GameData.currentTrick = savedProgress.currentTrick;
    updateTrickDisplay(GameData.currentTrick);

    if (savedProgress.startTime) {
      // 计算已经过的时间
      if (savedProgress.elapsedTime) {
        GameState.elapsedSeconds = savedProgress.elapsedTime;
        updateTimerDisplay();
      }

      // 如果游戏正在进行，恢复计时器
      if (savedProgress.isPlaying && !savedProgress.endTime) {
        GameState.isPlaying = true;
        enableEndButton();
        disableStartButton();
        startTimer(savedProgress.elapsedTime);
      }
    }
  } else {
    // 预先抽取一个技能但不显示
    drawRandomTrick();
  }

  GameState.isInitialized = true;
  console.log("游戏初始化完成");
}

// 手动抽取技能
function handleDrawTrick() {
  if (GameState.isPlaying) {
    showToast("游戏进行中无法更换技能", "warning");
    return;
  }

  // 抽取新技能并显示
  const newTrick = drawRandomTrick();
  if (newTrick) {
    showTrickDisplay(); // 确保技能显示
    updateTrickDisplay(newTrick);
    showToast(`已抽取技能: ${newTrick}`, "success");
  } else {
    showToast("抽取技能失败，请检查技能数据", "error");
  }
}

// 开始游戏
function startGame() {
  if (GameState.isPlaying) return;

  // 先随机抽取一个技能（如果未抽取）
  if (!GameData.currentTrick) {
    drawRandomTrick();
  }

  // 加载BPM设置
  loadBpmSetting();

  // 直接启动持续的节拍器，不再播放初始四拍信号
  startContinuousMetronome();

  // 更新游戏状态
  GameState.isPlaying = true;
  GameState.isPaused = false;
  GameData.isPlaying = true;
  GameData.startTime = new Date();
  GameState.startTimestamp = Date.now();

  // 隐藏当前技能并显示占位信息
  hideTrickDisplay();

  // 开始计时
  startTimer();

  // 更新按钮状态
  enableEndButton();
  disableStartButton();

  // 保存游戏进度
  saveGameProgress();

  console.log("游戏开始，技能已隐藏");
}

// 结束游戏
function endGame() {
  if (!GameState.isPlaying) return;

  // 停止计时器
  clearInterval(GameState.timerInterval);

  // 停止节拍器
  stopContinuousMetronome();

  // 记录结束时间
  GameState.isPlaying = false;
  GameData.endTime = new Date();
  GameData.elapsedTime = GameState.elapsedSeconds;

  // 保存游戏进度
  saveGameProgress();

  // 更新UI
  disableEndButton();
  enableStartButton();

  // 显示结果弹窗 - 使用新的模态弹窗方式
  if (
    window.RecordModule &&
    typeof RecordModule.addResultButtons === "function"
  ) {
    RecordModule.addResultButtons();
  } else {
    console.error("RecordModule未加载，无法显示结果弹窗");
  }

  console.log("游戏结束");
}

// 重置游戏
function resetGame() {
  // 停止计时器
  stopTimer();

  // 停止节拍器
  stopContinuousMetronome();

  // 重置游戏状态
  GameState.isPlaying = false;
  GameState.isPaused = false;
  GameState.elapsedSeconds = 0;

  // 清除游戏数据
  GameData.isPlaying = false;
  GameData.startTime = null;
  GameData.endTime = null;
  GameData.elapsedTime = 0;

  // 重新抽取技能
  drawRandomTrick();

  // 更新UI
  updateTimerDisplay();
  updateTrickDisplay("等待抽取...");

  // 更新按钮状态
  enableStartButton();
  disableEndButton();

  // 隐藏结果屏幕
  hideResultScreen();

  // 清除进度
  clearGameProgress();

  console.log("游戏已重置");
}

// 开始计时器
function startTimer(startSeconds = 0) {
  // 清除可能存在的定时器
  if (GameState.timerInterval) {
    clearInterval(GameState.timerInterval);
  }

  // 初始化计时器
  GameState.elapsedSeconds = startSeconds || 0;
  updateTimerDisplay();

  // 设置定时器，每秒更新一次
  GameState.timerInterval = setInterval(() => {
    GameState.elapsedSeconds++;
    GameData.elapsedTime = GameState.elapsedSeconds;

    // 更新显示
    updateTimerDisplay();

    // 每10秒保存一次进度
    if (GameState.elapsedSeconds % 10 === 0) {
      saveGameProgress();
    }
  }, 1000);
}

// 停止计时器
function stopTimer() {
  if (GameState.timerInterval) {
    clearInterval(GameState.timerInterval);
    GameState.timerInterval = null;
  }
}

// 格式化时间显示（将秒数转换为 MM:SS 格式）
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

// 加载BPM设置
function loadBpmSetting() {
  console.log("正在加载BPM设置...");
  console.log("当前GameData:", window.GameData);

  if (
    window.GameData &&
    window.GameData.settings &&
    window.GameData.settings.beatsPerMinute
  ) {
    GameState.beatsPerMinute = parseInt(
      window.GameData.settings.beatsPerMinute,
      10
    );
    console.log(`已加载BPM设置: ${GameState.beatsPerMinute}`);
  } else {
    // 检查是否有备份设置
    try {
      const localSettings = localStorage.getItem(
        "movement_without_hands_settings"
      );
      if (localSettings) {
        const parsedSettings = JSON.parse(localSettings);
        if (parsedSettings.beatsPerMinute) {
          GameState.beatsPerMinute = parseInt(
            parsedSettings.beatsPerMinute,
            10
          );
          console.log(`从本地存储加载BPM: ${GameState.beatsPerMinute}`);
          return;
        }
      }
    } catch (e) {
      console.warn("无法从本地存储读取BPM设置:", e);
    }

    // 使用默认值
    GameState.beatsPerMinute = 120;
    console.log(`使用默认BPM: ${GameState.beatsPerMinute}`);
  }
}

// 启动持续节拍器
function startContinuousMetronome() {
  // 如果已经启动，先停止
  if (GameState.metronomeInterval) {
    clearInterval(GameState.metronomeInterval);
  }

  // 确保BPM设置有效
  const bpm = GameState.beatsPerMinute || 120;
  console.log(`启动节拍器，BPM: ${bpm}`);

  // 计算每拍间隔(毫秒)
  const beatInterval = 60000 / bpm;

  // 初始化拍子计数
  let beatCount = 1;

  // 创建节拍器定时器
  GameState.metronomeInterval = setInterval(() => {
    // 确定当前拍子类型(第4拍是重拍)
    const beatType = beatCount === 4 ? "heavy" : "light";

    // 播放节拍音效
    playMetronomeBeat(beatType);

    // 更新计数器
    beatCount = (beatCount % 4) + 1;
  }, beatInterval);

  console.log(`节拍器已启动，BPM: ${bpm}`);
}

// 停止持续节拍器
function stopContinuousMetronome() {
  if (GameState.metronomeInterval) {
    clearInterval(GameState.metronomeInterval);
    GameState.metronomeInterval = null;
    console.log("节拍器已停止");
  }
}

// 播放四四拍节拍器音效（8bit风格）- 初始信号用
function playMetronomeSound(introOnly = false) {
  // 如果没有音频上下文则创建
  if (!GameState.audioContext) {
    GameState.audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
  }

  // 创建一个AudioContext
  const audioCtx = GameState.audioContext;

  // 定义拍子频率与持续时间
  const beatsFreq = {
    light: 880, // 轻拍 (A5)
    heavy: 587.33, // 重拍 (D5)
  };

  // 四四拍的节拍模式（3轻1重）
  const beatPattern = ["light", "light", "light", "heavy"];

  // 节拍间隔时间（毫秒）- 仅用于初始信号，不受BPM影响
  const beatInterval = 500; // 每拍0.5秒，初始信号固定速度

  // 生成节拍声音
  function createBeatSound(type, time) {
    // 创建振荡器
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    // 设置方波音色（8bit风格）
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(beatsFreq[type], time);

    // 音量设置（重拍更响）
    const volume = type === "heavy" ? 0.4 : 0.25;
    gainNode.gain.setValueAtTime(volume, time);

    // 音量衰减
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      time + (type === "heavy" ? 0.3 : 0.15)
    );

    // 连接节点
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // 开始和结束时间
    oscillator.start(time);
    oscillator.stop(time + (type === "heavy" ? 0.4 : 0.2));
  }

  // 循环播放四拍
  beatPattern.forEach((beatType, index) => {
    const time = audioCtx.currentTime + (index * beatInterval) / 1000;
    createBeatSound(beatType, time);

    // 添加视觉反馈
    setTimeout(() => {
      // 创建一个临时元素显示节拍
      const beatIndicator = document.createElement("div");
      beatIndicator.className = `beat-indicator ${beatType}-beat`;
      beatIndicator.style.position = "fixed";
      beatIndicator.style.top = "50%";
      beatIndicator.style.left = "50%";
      beatIndicator.style.transform = "translate(-50%, -50%)";
      beatIndicator.style.borderRadius = "50%";
      beatIndicator.style.width = beatType === "heavy" ? "80px" : "50px";
      beatIndicator.style.height = beatType === "heavy" ? "80px" : "50px";
      beatIndicator.style.backgroundColor =
        beatType === "heavy"
          ? "rgba(255, 100, 100, 0.6)"
          : "rgba(100, 100, 255, 0.6)";
      beatIndicator.style.boxShadow =
        beatType === "heavy"
          ? "0 0 20px rgba(255, 100, 100, 0.8)"
          : "0 0 15px rgba(100, 100, 255, 0.8)";
      beatIndicator.style.zIndex = "1000";
      beatIndicator.style.animation = "beatPulse 0.4s forwards";

      document.body.appendChild(beatIndicator);

      // 移除指示器
      setTimeout(() => {
        if (document.body.contains(beatIndicator)) {
          document.body.removeChild(beatIndicator);
        }
      }, 400);
    }, index * beatInterval);
  });

  // 添加拍子动画样式
  if (!document.getElementById("beat-animation-style")) {
    const style = document.createElement("style");
    style.id = "beat-animation-style";
    style.textContent = `
      @keyframes beatPulse {
        0% {
          transform: translate(-50%, -50%) scale(0.8);
          opacity: 0.8;
        }
        50% {
          transform: translate(-50%, -50%) scale(1.2);
          opacity: 1;
        }
        100% {
          transform: translate(-50%, -50%) scale(0.5);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// 播放单个节拍 - 用于持续节拍器
function playMetronomeBeat(type = "light") {
  // 确保音频上下文存在
  if (!GameState.audioContext) {
    GameState.audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
  }

  const audioCtx = GameState.audioContext;

  // 定义拍子频率
  const beatsFreq = {
    light: 880, // 轻拍 (A5)
    heavy: 587.33, // 重拍 (D5)
  };

  // 创建振荡器
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  // 设置方波音色（8bit风格）
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(beatsFreq[type], audioCtx.currentTime);

  // 音量设置（重拍更响）
  const volume = type === "heavy" ? 0.3 : 0.2; // 持续节拍稍微降低音量
  gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);

  // 音量衰减
  gainNode.gain.exponentialRampToValueAtTime(
    0.01,
    audioCtx.currentTime + (type === "heavy" ? 0.3 : 0.15)
  );

  // 连接节点
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  // 开始和结束
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + (type === "heavy" ? 0.3 : 0.15));

  // 添加视觉反馈（小一点，不那么醒目）
  const beatIndicator = document.createElement("div");
  beatIndicator.className = `beat-indicator ${type}-beat`;
  beatIndicator.style.position = "fixed";
  beatIndicator.style.top = "90%";
  beatIndicator.style.left = "10%";
  beatIndicator.style.transform = "translate(-50%, -50%)";
  beatIndicator.style.borderRadius = "50%";
  beatIndicator.style.width = type === "heavy" ? "30px" : "20px";
  beatIndicator.style.height = type === "heavy" ? "30px" : "20px";
  beatIndicator.style.backgroundColor =
    type === "heavy" ? "rgba(255, 100, 100, 0.4)" : "rgba(100, 100, 255, 0.4)";
  beatIndicator.style.boxShadow =
    type === "heavy"
      ? "0 0 10px rgba(255, 100, 100, 0.5)"
      : "0 0 8px rgba(100, 100, 255, 0.5)";
  beatIndicator.style.zIndex = "1000";
  beatIndicator.style.animation = "beatPulse 0.3s forwards";

  document.body.appendChild(beatIndicator);

  // 移除指示器
  setTimeout(() => {
    if (document.body.contains(beatIndicator)) {
      document.body.removeChild(beatIndicator);
    }
  }, 300);
}

// 主入口 - 页面加载完成时初始化
document.addEventListener("DOMContentLoaded", () => {
  console.log("页面已加载，开始初始化游戏...");
  initializeGame();

  // 绑定按钮事件
  document
    .getElementById("draw-trick-btn")
    .addEventListener("click", handleDrawTrick);
  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("end-btn").addEventListener("click", endGame);
  document.getElementById("reset-btn").addEventListener("click", resetGame);
  document.getElementById("try-again-btn").addEventListener("click", resetGame);

  // 导航按钮
  document.getElementById("back-to-menu-btn").addEventListener("click", () => {
    window.location.href = "../games_select.html";
  });

  document.getElementById("back-btn").addEventListener("click", () => {
    window.location.href = "../games_select.html";
  });

  document.getElementById("home-btn").addEventListener("click", () => {
    window.location.href = "../index.html";
  });

  document.getElementById("settings-btn").addEventListener("click", () => {
    window.location.href = "movement_without_hands_settings.html";
  });

  // 添加查看记录按钮事件
  document.getElementById("records-btn").addEventListener("click", viewRecords);
});
