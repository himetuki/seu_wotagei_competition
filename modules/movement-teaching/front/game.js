/**
 * 体态传技 — 游戏页面前端组件（P4 迁移）
 *
 * 由原多脚本按加载顺序并入同一闭包（data → core → ui → record），
 * 函数体逐行保留；全局函数/变量 → 模块闭包作用域。
 * 原 core.js 的 DOMContentLoaded 初始化改由 initMovementTeachingGame() 承接
 * （kernel 装配渲染时 DOM 已就绪）。
 *
 * 同名函数（formatTime / showToast / showRecordForm / hideRecordForm /
 * saveGameRecord / revealTrick）在 ui 与 record 两节重复定义，按原脚本
 * 加载序后者覆盖前者（record 版生效，与原全局声明覆盖语义一致）。
 * 共享数据层（GameData / loadTricks / 进度存取）抽至 ./game-data.js，
 * 等价于原版两页面共载 movement_without_hands_data.js。
 *
 * 注意：持久化继续用原生 fetch（/api/game_2_process、/api/movement-partys、
 * /api/game_2_settings、/resource/json/tricks_for_game.json）与原 localStorage key，
 * 保持行为零回归。
 *
 * cleanup 覆盖：signal 登记的静态按钮监听、计时/节拍器/闪现 interval、
 * WebAudio 上下文、动态弹窗节点。
 */
import {
  GameData,
  loadTricks,
  loadGameProgress,
  saveGameProgress,
  clearGameProgress,
  drawRandomTrickSilent,
} from "./game-data.js";
import { icon } from "/web/icons.mjs";

// 技能抽取闪现 interval（原 data.js drawRandomTrick 内局部变量，
// P4 cleanup 提升到闭包级以便清除）
let trickFlashTimer = null;

// 随机抽取一个技能（带闪现效果，用于按钮点击）
function drawRandomTrick() {
  if (!GameData.tricks || GameData.tricks.length === 0) {
    console.error("没有可用的技能数据");
    return null;
  }

  const trickElement = document.getElementById("current-trick");

  // 禁用抽取按钮，防止重复点击
  const drawBtn = document.getElementById("draw-trick-btn");
  if (drawBtn) drawBtn.disabled = true;

  // 闪现效果参数
  const flashCount = 15;
  const flashInterval = 80;
  let currentFlash = 0;

  // 闪现动画
  trickFlashTimer = setInterval(() => {
    const randomIdx = Math.floor(Math.random() * GameData.tricks.length);
    const flashTrick = GameData.tricks[randomIdx].name;

    if (trickElement) {
      trickElement.textContent = flashTrick;
      trickElement.style.color = "#fbbf24"; // 闪现时为黄色
    }

    currentFlash++;

    if (currentFlash >= flashCount) {
      clearInterval(trickFlashTimer);
      trickFlashTimer = null;

      // 最终随机选择
      const finalIdx = Math.floor(Math.random() * GameData.tricks.length);
      GameData.currentTrick = GameData.tricks[finalIdx].name;

      if (trickElement) {
        trickElement.textContent = GameData.currentTrick;
        trickElement.style.color = "#10b981"; // 最终结果为绿色
      }

      // 启用按钮
      if (drawBtn) drawBtn.disabled = false;

      showToast(`已抽取技能: ${GameData.currentTrick}`, "success");
    }
  }, flashInterval);

  return GameData.currentTrick;
}

/* =================================================================
 *  core：游戏状态与核心逻辑（原 movement_without_hands_core.js）
 * ================================================================= */

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
    // 预先抽取一个技能但不显示（初始化时静默抽取，不闪现）
    const silentTrick = drawRandomTrickSilent();
    if (silentTrick) {
      updateTrickDisplay(silentTrick);
    }
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

  // 抽取新技能并显示（drawRandomTrick 内部已处理闪现效果和 toast）
  drawRandomTrick();
}

// 开始游戏
function startGame() {
  if (GameState.isPlaying) return;

  // 先随机抽取一个技能（如果未抽取，静默抽取不闪现）
  if (!GameData.currentTrick) {
    const silentTrick = drawRandomTrickSilent();
    if (silentTrick) {
      updateTrickDisplay(silentTrick);
    }
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

  // 重新抽取技能（重置时静默抽取，不闪现）
  const silentTrick = drawRandomTrickSilent();
  if (silentTrick) {
    updateTrickDisplay(silentTrick);
  } else {
    updateTrickDisplay("等待抽取...");
  }

  // 更新UI
  updateTimerDisplay();

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

/* =================================================================
 *  ui：界面交互（原 movement_without_hands_ui.js）
 * ================================================================= */

// 更新技能显示
function updateTrickDisplay(trickName) {
  const trickElement = document.getElementById("current-trick");
  if (!trickElement) return;

  trickElement.textContent = trickName;

  // 添加高亮动画
  trickElement.classList.remove("pulse");
  void trickElement.offsetWidth; // 触发重绘
  trickElement.classList.add("pulse");
}

// 隐藏技能显示
function hideTrickDisplay() {
  const trickElement = document.getElementById("current-trick");
  const placeholderElement = document.getElementById(
    "hidden-trick-placeholder"
  );

  if (trickElement && placeholderElement) {
    trickElement.classList.add("hidden");
    placeholderElement.classList.remove("hidden");
  }
}

// 显示技能
function showTrickDisplay() {
  const trickElement = document.getElementById("current-trick");
  const placeholderElement = document.getElementById(
    "hidden-trick-placeholder"
  );

  if (trickElement && placeholderElement) {
    trickElement.classList.remove("hidden");
    placeholderElement.classList.add("hidden");
  }
}

// 重置游戏时同时重置技能显示
function resetGameDisplay() {
  showTrickDisplay();
  hideResultScreen();
}

// 更新计时器显示
function updateTimerDisplay() {
  const timerElement = document.getElementById("timer-display");
  if (!timerElement) return;

  timerElement.textContent = formatTime(GameState.elapsedSeconds);
}

// 启用开始按钮
function enableStartButton() {
  const startButton = document.getElementById("start-btn");
  if (startButton) {
    startButton.disabled = false;
  }
}

// 禁用开始按钮
function disableStartButton() {
  const startButton = document.getElementById("start-btn");
  if (startButton) {
    startButton.disabled = true;
  }
}

// 启用结束按钮
function enableEndButton() {
  const endButton = document.getElementById("end-btn");
  if (endButton) {
    endButton.disabled = false;
  }
}

// 禁用结束按钮
function disableEndButton() {
  const endButton = document.getElementById("end-btn");
  if (endButton) {
    endButton.disabled = true;
  }
}

// 显示结果屏幕
function showResultScreen() {
  const resultScreen = document.createElement("div");
  resultScreen.classList.add("result-screen");

  resultScreen.innerHTML = `
    <div class="result-content">
      <h2>游戏结束!</h2>
      <p class="time-result">用时: <span>${formatTime(
        GameState.elapsedSeconds
      )}</span></p>
      <div class="result-actions">
        <button id="reset-game-btn" class="primary-btn">重新开始</button>
        <button id="back-to-menu-btn" class="secondary-btn">返回菜单</button>
      </div>
      <div class="result-buttons">
        <button id="reveal-trick-btn" class="action-btn">揭示技能</button>
        <button id="save-result-btn" class="action-btn primary">保存记录</button>
      </div>
    </div>
  `;

  document.body.appendChild(resultScreen);

  // 绑定按钮事件
  document.getElementById("reset-game-btn").addEventListener("click", () => {
    removeResultScreen();
    resetGame();
  });

  document.getElementById("back-to-menu-btn").addEventListener("click", () => {
    removeResultScreen();
    window.location.href = "/m/games";
  });

  // 绑定揭示技能和保存记录按钮事件
  document
    .getElementById("reveal-trick-btn")
    .addEventListener("click", revealTrick);
  document
    .getElementById("save-result-btn")
    .addEventListener("click", showRecordForm);
}

// 隐藏结果屏幕
function hideResultScreen() {
  const resultScreen = document.querySelector(".result-screen");
  if (resultScreen) {
    document.body.removeChild(resultScreen);
  }
}

// 说明：原 ui.js 的 formatTime / showToast / showRecordForm / hideRecordForm /
// saveGameRecord / revealTrick 与 record.js 重复定义。经典脚本按加载序被 record.js
// 覆盖（死代码），ESM 模块作用域禁止重复声明，故此处仅保留 record.js 版本
// （见下节），运行时可观察行为与原版一致。

// 添加CSS样式以支持toast消息
(function addToastStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .toast-message {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(-100px);
      background-color: rgba(60, 60, 80, 0.9);
      color: white;
      padding: 12px 25px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      transition: transform 0.3s ease-out;
      opacity: 0;
    }
    
    .toast-message.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    
    .info-toast {
      background-color: rgba(60, 80, 120, 0.9);
      border-left: 4px solid #3498db;
    }
    
    .success-toast {
      background-color: rgba(60, 120, 60, 0.9);
      border-left: 4px solid #2ecc71;
    }
    
    .warning-toast {
      background-color: rgba(120, 100, 40, 0.9);
      border-left: 4px solid #f1c40f;
    }
    
    .error-toast {
      background-color: rgba(120, 50, 50, 0.9);
      border-left: 4px solid #e74c3c;
    }
  `;
  document.head.appendChild(style);
})();

/* =================================================================
 *  record：结果记录（原 movement_without_hands_record.js，
 *  后载覆盖 ui 同名函数，与原全局声明覆盖语义一致）
 * ================================================================= */

// 游戏记录状态
const RecordState = {
  isGuessCorrect: false, // 是否猜中
  teamName: "", // 队伍名称
  duration: 0, // 游戏时长（秒）
  currentTrick: null, // 当前技能
  isResultSaved: false, // 是否已保存结果
  isTrickRevealed: false, // 是否已揭示技能
  recordId: null, // 添加记录ID用于防止重复提交
};

// 显示保存记录表单
function showRecordForm() {
  // 重置记录ID，确保每次打开表单时创建新记录
  RecordState.recordId = null;

  // 创建模态弹窗背景
  const modalOverlay = document.createElement("div");
  modalOverlay.classList.add("modal-overlay");
  modalOverlay.id = "record-modal-overlay";

  // 创建记录表单容器
  const recordForm = document.createElement("div");
  recordForm.classList.add("record-form", "modal-form");
  recordForm.id = "record-form";

  recordForm.innerHTML = `
    <h3>游戏结果记录</h3>
    <div class="form-group">
      <label for="team-name">队伍名称:</label>
      <input type="text" id="team-name" placeholder="请输入队伍名称">
    </div>
    <div class="form-group">
      <label>猜测结果:</label>
      <div class="radio-group">
        <label>
          <input type="radio" name="guess-result" value="correct" checked> 猜中
        </label>
        <label>
          <input type="radio" name="guess-result" value="incorrect"> 未猜中
        </label>
      </div>
    </div>
    <div class="form-actions">
      <button id="save-record-btn" class="primary-btn">保存记录</button>
      <button id="cancel-record-btn" class="secondary-btn">取消</button>
    </div>
  `;

  // 添加到页面
  modalOverlay.appendChild(recordForm);
  document.body.appendChild(modalOverlay);

  // 绑定事件
  document
    .getElementById("save-record-btn")
    .addEventListener("click", saveGameRecord);
  document
    .getElementById("cancel-record-btn")
    .addEventListener("click", hideRecordForm);

  // 点击背景关闭表单（可选）
  modalOverlay.addEventListener("click", function (e) {
    if (e.target === modalOverlay) {
      hideRecordForm();
    }
  });

  // 设置表单动画效果
  setTimeout(() => {
    modalOverlay.classList.add("visible");
    recordForm.classList.add("visible");
  }, 10);
}

// 隐藏保存记录表单
function hideRecordForm() {
  const modalOverlay = document.getElementById("record-modal-overlay");
  const recordForm = document.getElementById("record-form");

  if (modalOverlay) {
    modalOverlay.classList.remove("visible");
    if (recordForm) {
      recordForm.classList.remove("visible");
    }

    setTimeout(() => {
      if (modalOverlay.parentNode) {
        modalOverlay.parentNode.removeChild(modalOverlay);
      }
    }, 300);
  }
}

// 保存游戏记录
async function saveGameRecord() {
  const teamNameInput = document.getElementById("team-name");
  const guessResultRadios = document.getElementsByName("guess-result");
  const saveButton = document.getElementById("save-record-btn");

  // 防止重复提交
  if (saveButton.disabled) {
    return;
  }

  // 禁用保存按钮，避免重复提交
  saveButton.disabled = true;
  saveButton.textContent = "保存中...";

  // 获取表单数据
  RecordState.teamName = teamNameInput.value.trim();

  if (!RecordState.teamName) {
    showToast("请输入队伍名称", "warning");
    // 重新启用按钮
    saveButton.disabled = false;
    saveButton.textContent = "保存记录";
    return;
  }

  // 获取猜测结果
  for (const radio of guessResultRadios) {
    if (radio.checked) {
      RecordState.isGuessCorrect = radio.value === "correct";
      break;
    }
  }

  // 生成记录的唯一ID - 如果已有ID则复用，避免重复提交创建多条记录
  if (!RecordState.recordId) {
    RecordState.recordId = Date.now();
  }

  // 准备数据
  const recordData = {
    teamName: RecordState.teamName,
    isGuessCorrect: RecordState.isGuessCorrect,
    duration: GameState.elapsedSeconds,
    trickName: GameData.currentTrick,
    date: new Date().toISOString(),
    id: RecordState.recordId,
  };

  try {
    // 发送到服务器
    const response = await fetch("/api/movement-partys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(recordData),
    });

    if (!response.ok) {
      throw new Error(`保存失败: ${response.status}`);
    }

    const result = await response.json();

    // 更新状态
    RecordState.isResultSaved = true;

    // 添加CSS样式以支持保存状态提示消息
    ensureFeedbackStylesExist();

    // 创建并显示成功消息
    const feedbackMsg = document.createElement("div");
    feedbackMsg.className = "record-feedback success";
    feedbackMsg.innerHTML = `<span class="icon">${icon("check", { size: 16 })}</span> 游戏记录已保存成功`;

    // 在表单内显示反馈消息
    const formActions = document.querySelector(".form-actions");
    if (formActions) {
      // 移除之前的反馈消息
      const oldFeedback = document.querySelector(".record-feedback");
      if (oldFeedback) oldFeedback.remove();

      // 添加到表单底部
      formActions.parentNode.insertBefore(feedbackMsg, formActions);
    }

    // 修改保存按钮状态
    saveButton.disabled = false;
    saveButton.innerHTML = `已保存 ${icon("check", { size: 16 })}`;
    saveButton.classList.add("save-success");

    // 3秒后关闭表单
    setTimeout(() => {
      hideRecordForm();
    }, 3000);
  } catch (error) {
    console.error("保存游戏记录失败:", error);

    // 添加CSS样式以支持保存状态提示消息
    ensureFeedbackStylesExist();

    // 创建并显示错误消息
    const feedbackMsg = document.createElement("div");
    feedbackMsg.className = "record-feedback error";
    feedbackMsg.innerHTML = `<span class="icon">${icon("x", { size: 16 })}</span> 保存失败: ${error.message}`;

    // 在表单内显示反馈消息
    const formActions = document.querySelector(".form-actions");
    if (formActions) {
      // 移除之前的反馈消息
      const oldFeedback = document.querySelector(".record-feedback");
      if (oldFeedback) oldFeedback.remove();

      // 添加到表单底部
      formActions.parentNode.insertBefore(feedbackMsg, formActions);
    }

    // 重新启用按钮
    saveButton.disabled = false;
    saveButton.textContent = "重试保存";
    saveButton.classList.add("save-error");

    // 5秒后恢复按钮正常状态
    setTimeout(() => {
      saveButton.classList.remove("save-error");
      saveButton.textContent = "保存记录";
    }, 5000);
  }
}

// 确保反馈消息样式已添加到页面
function ensureFeedbackStylesExist() {
  if (document.getElementById("record-feedback-styles")) return;

  const style = document.createElement("style");
  style.id = "record-feedback-styles";
  style.textContent = `
    .record-feedback {
      margin: 15px 0;
      padding: 12px 15px;
      border-radius: 5px;
      animation: fadeInSlide 0.3s ease forwards;
      font-weight: bold;
    }
    
    .record-feedback.success {
      background-color: rgba(40, 167, 69, 0.9);
      color: white;
      border-left: 4px solid #28a745;
    }
    
    .record-feedback.error {
      background-color: rgba(220, 53, 69, 0.9);
      color: white;
      border-left: 4px solid #dc3545;
    }
    
    .record-feedback .icon {
      margin-right: 8px;
      font-weight: bold;
      display: inline-flex;
      align-items: center;
    }

    .y-icon {
      vertical-align: middle;
    }
    
    @keyframes fadeInSlide {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .save-success {
      background-color: #28a745 !important;
      border-color: #218838 !important;
    }
    
    .save-error {
      background-color: #dc3545 !important;
      border-color: #c82333 !important;
    }
  `;

  document.head.appendChild(style);
}

// 揭示当前技能
function revealTrick() {
  if (!GameData.currentTrick) {
    showToast("没有技能可揭示", "warning");
    return;
  }

  // 创建模态弹窗背景
  const modalOverlay = document.createElement("div");
  modalOverlay.classList.add("modal-overlay");
  modalOverlay.id = "trick-modal-overlay";

  // 显示技能名称
  const trickReveal = document.createElement("div");
  trickReveal.classList.add("trick-reveal", "modal-form", "centered-modal");
  trickReveal.innerHTML = `
    <div class="reveal-content">
      <h3>本次游戏技能</h3>
      <p class="trick-name">${GameData.currentTrick}</p>
      <button id="close-reveal-btn" class="primary-btn">关闭</button>
    </div>
  `;

  // 添加到页面
  modalOverlay.appendChild(trickReveal);
  document.body.appendChild(modalOverlay);

  // 绑定关闭事件
  document
    .getElementById("close-reveal-btn")
    .addEventListener("click", closeTrickReveal);

  // 点击背景关闭弹窗
  modalOverlay.addEventListener("click", function (e) {
    if (e.target === modalOverlay) {
      closeTrickReveal();
    }
  });

  // 淡入动画
  setTimeout(() => {
    modalOverlay.classList.add("visible");
    trickReveal.classList.add("visible");
  }, 10);

  // 标记已揭示
  RecordState.isTrickRevealed = true;
}

// 关闭技能揭示弹窗
function closeTrickReveal() {
  const modalOverlay = document.getElementById("trick-modal-overlay");
  if (modalOverlay) {
    modalOverlay.classList.remove("visible");
    setTimeout(() => {
      if (modalOverlay.parentNode) {
        modalOverlay.parentNode.removeChild(modalOverlay);
      }
    }, 300);
  }
}

// 添加结果按钮到游戏界面 - 创建一个结果模态框
function addResultButtons() {
  // 创建模态弹窗背景
  const modalOverlay = document.createElement("div");
  modalOverlay.classList.add("modal-overlay");
  modalOverlay.id = "result-modal-overlay";

  // 创建结果容器
  const resultModal = document.createElement("div");
  resultModal.classList.add("result-modal", "modal-form");
  resultModal.innerHTML = `
    <div class="result-content">
      <h2>游戏结束!</h2>
      <p class="time-result">用时: <span>${formatTime(
        GameState.elapsedSeconds
      )}</span></p>
      <div class="result-buttons">
        <button id="reveal-trick-btn" class="action-btn">揭示技能</button>
        <button id="save-result-btn" class="action-btn primary">保存记录</button>
        <button id="view-records-btn" class="action-btn">查看记录</button>
      </div>
      <div class="form-actions">
        <button id="reset-game-btn" class="primary-btn">重新开始</button>
        <button id="back-to-menu-btn" class="secondary-btn">返回菜单</button>
      </div>
    </div>
  `;

  // 添加到页面
  modalOverlay.appendChild(resultModal);
  document.body.appendChild(modalOverlay);

  // 绑定事件
  document
    .getElementById("reveal-trick-btn")
    .addEventListener("click", revealTrick);
  document
    .getElementById("save-result-btn")
    .addEventListener("click", showRecordForm);
  document
    .getElementById("view-records-btn")
    .addEventListener("click", viewRecords);
  document.getElementById("reset-game-btn").addEventListener("click", () => {
    closeResultModal();
    resetGame();
  });
  document.getElementById("back-to-menu-btn").addEventListener("click", () => {
    closeResultModal();
    window.location.href = "/m/games";
  });

  // 淡入动画
  setTimeout(() => {
    modalOverlay.classList.add("visible");
    resultModal.classList.add("visible");
  }, 10);
}

// 查看记录页面
function viewRecords() {
  window.location.href = "records.html";
}

// 关闭结果模态框
function closeResultModal() {
  const modalOverlay = document.getElementById("result-modal-overlay");
  if (modalOverlay) {
    modalOverlay.classList.remove("visible");
    setTimeout(() => {
      if (modalOverlay.parentNode) {
        modalOverlay.parentNode.removeChild(modalOverlay);
      }
    }, 300);
  }
}

// 说明：formatTime 已在 core 节定义（三处重复声明之一，内容一致，ESM 仅保留一份）。

// 显示toast消息 (复用UI模块中的函数)
function showToast(message, type = "info", duration = 3000) {
  // 检查是否有全局的showToast函数可用，但避免递归调用
  if (window.showToast && window.showToast !== showToast) {
    // 调用全局函数，确保不是当前函数自身
    window.showToast(message, type, duration);
  } else {
    // 如果没有全局函数或全局函数就是当前函数，则直接使用控制台输出
    console.log(`[${type}] ${message}`);
  }
}

// 导出需要的函数给其他模块使用（原版桥接，保留）
window.RecordModule = {
  addResultButtons,
  showRecordForm,
  revealTrick,
  closeResultModal,
  viewRecords,
};

/* =================================================================
 *  组件入口（原 core.js 的 DOMContentLoaded 初始化，kernel render 时执行）
 * ================================================================= */
export function initMovementTeachingGame() {
  // cleanup 契约：静态骨架监听经 signal 登记，重渲染时 abort 统一解绑，
  // 防止不刷新页面的重复 render 双绑双触发
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

  console.log("页面已加载，开始初始化游戏...");
  initializeGame();

  // 绑定按钮事件
  document
    .getElementById("draw-trick-btn")
    .addEventListener("click", handleDrawTrick, { signal });
  document.getElementById("start-btn").addEventListener("click", startGame, { signal });
  document.getElementById("end-btn").addEventListener("click", endGame, { signal });
  document.getElementById("reset-btn").addEventListener("click", resetGame, { signal });
  document.getElementById("try-again-btn").addEventListener("click", resetGame, { signal });

  // 导航按钮
  document.getElementById("back-to-menu-btn").addEventListener("click", () => {
    window.location.href = "/m/games";
  }, { signal });

  document.getElementById("back-btn").addEventListener("click", () => {
    window.location.href = "/m/games";
  }, { signal });

  document.getElementById("home-btn").addEventListener("click", () => {
    window.location.href = "/m/home";
  }, { signal });

  document.getElementById("settings-btn").addEventListener("click", () => {
    window.location.href = "settings.html";
  }, { signal });

  // 添加查看记录按钮事件
  document.getElementById("records-btn").addEventListener("click", viewRecords, { signal });

  return () => cleanupMovementTeachingGame(bindAbort);
}

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用）
 * ================================================================= */
function cleanupMovementTeachingGame(bindAbort) {
  // signal 登记的静态骨架监听统一解绑
  if (bindAbort) bindAbort.abort();

  // 计时器 / 节拍器 / 技能闪现 interval 清除
  stopTimer();
  stopContinuousMetronome();
  if (trickFlashTimer) {
    clearInterval(trickFlashTimer);
    trickFlashTimer = null;
  }

  // WebAudio 上下文关闭（节拍器音效用，振荡器均已自停）
  try {
    if (GameState.audioContext && GameState.audioContext.state !== "closed") {
      GameState.audioContext.close();
    }
  } catch (e) {
    /* 忽略关闭异常 */
  }
  GameState.audioContext = null;

  // 游戏态复位（isInitialized 复位以保证重渲染时重新初始化）
  GameState.isInitialized = false;
  GameState.isPlaying = false;
  GameState.isPaused = false;

  // 移除本页动态弹窗节点（结果/记录/揭示弹窗与结果屏）
  document
    .querySelectorAll(
      ".modal-overlay, .result-screen, .trick-reveal, .record-form, .toast-message"
    )
    .forEach((node) => {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
}
