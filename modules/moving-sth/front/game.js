/**
 * 定时搬化棒 — 游戏页面前端组件（P4 迁移）
 *
 * 由原多脚本按加载顺序并入同一闭包（core → ui → timer → data），
 * 函数体逐行保留；全局函数/变量 → 模块闭包作用域。
 * 原 core/ui 的 DOMContentLoaded 初始化改由 initMovingSthGame() 承接
 * （kernel 装配渲染时 DOM 已就绪）。
 *
 * 注意：设置加载继续用原生 fetch（/resource/json/games_musics.json），
 * 设置存档键 "movingSthSettings" 与端点 /api/settings/moving-sth 逐字保留。
 *
 * P11-B6 迁移：
 *   · 选曲随机 → /web/lib/random.mjs 的 pickOne（原 Math.floor(Math.random()*n)）
 *   · 设置双写/恢复链 → /web/lib/persist.mjs 的 createPersistence
 *     （server → localStorage → 默认设置；原子实现只有"请求失败才回退本地"）
 *   · 烟花配色同形随机选取一并收敛到 pickOne；化棒位置/速度等**连续抖动值**仍用
 *     Math.random（非"选曲/选人"，pickOne 不适用）
 *
 * cleanup 覆盖：signal 登记的静态监听（按钮/document keydown/window resize）、
 * 计时 interval、浮动化棒 rAF、倒计时链式 timeout 与其动态节点、audio 播放。
 */
import { pickOne } from "/web/lib/random.mjs";
import { createPersistence } from "/web/lib/persist.mjs";

/* =================================================================
 *  core：游戏状态（原 moving_sth_core.js）
 * ================================================================= */
const GameState = {
  isPlaying: false,
  isPaused: false,
  timeLimit: 60, // 秒
  isGameOver: false,
  isCountingDown: false, // 倒计时重入门闩（startGame 置位，倒计时结束/ cleanup 复位）
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
    const response = await fetch("/resource/json/games_musics.json");
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
    // 等概率单抽（Fisher–Yates 基座；替代原 Math.floor(Math.random() * n)）
    GameState.currentMusic = pickOne(GameState.availableMusics);

    // 更新UI显示
    document.getElementById("music-name").textContent =
      GameState.currentMusic.replace(".mp3", "");

    // 设置音乐源 - 修改为新的音乐路径
    const musicPlayer = document.getElementById("game-music");
    musicPlayer.src = `/resource/musics/games_musics/${GameState.currentMusic}`;
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
  // 倒计时进行中拒绝重入：此刻 isPlaying 仍为 false，重复点击会排两条倒计时链，
  // 先后 resolve 使 startTimer 执行两次，旧 interval 句柄被覆盖成失控孤儿（每 10ms
  // 空转并在时间到后反复触发 endGame → 结果弹窗/烟花无限循环）
  if (GameState.isCountingDown) return;
  GameState.isCountingDown = true;

  // 显示3秒倒计时
  showCountdown().then(() => {
    GameState.isCountingDown = false;
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

// 倒计时链式 timeout 登记处（cleanup 时统一清除，原版无此机制，P4 cleanup 补充）
let countdownTimeouts = [];
let countdownNodes = [];
let countdownAudioContexts = [];

function trackCountdownTimeout(fn, ms) {
  const id = setTimeout(fn, ms);
  countdownTimeouts.push(id);
  return id;
}

// 显示3秒倒计时
function showCountdown() {
  return new Promise((resolve) => {
    // 创建遮罩
    const overlay = document.createElement("div");
    overlay.classList.add("countdown-overlay");
    document.body.appendChild(overlay);
    countdownNodes.push(overlay);

    // 创建倒计时容器
    const countdownContainer = document.createElement("div");
    countdownContainer.classList.add("countdown-container");
    document.body.appendChild(countdownContainer);
    countdownNodes.push(countdownContainer);

    // 获取非倒计时元素并应用透明度
    applyInterfaceOpacity(true);

    // 设置初始倒计时数字
    let count = 3;

    // 创建音频上下文(用于生成8bit音效)
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    countdownAudioContexts.push(audioContext);

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
        trackCountdownTimeout(() => {
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
      trackCountdownTimeout(() => {
        countdownContainer.classList.remove("countdown-animation");
      }, 900);

      // 减少计数
      count--;

      if (count >= 0) {
        // 继续倒计时
        trackCountdownTimeout(updateCountdown, 1000);
      } else {
        // 播放开始音效
        playStartSound();

        // 显示"开始!"文本
        countdownContainer.textContent = "开始!";
        countdownContainer.classList.add("start-animation");

        // 倒计时结束，移除元素并解析Promise
        trackCountdownTimeout(() => {
          if (overlay.parentNode) document.body.removeChild(overlay);
          if (countdownContainer.parentNode)
            document.body.removeChild(countdownContainer);
          resolve();
        }, 1000);
      }
    };

    // 开始倒计时
    trackCountdownTimeout(updateCountdown, 500);
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
  // 唯一调用点在计时 interval 内；一旦 isPlaying 已被置 false（已结束/失控 interval
  // 重入），直接忽略——防止结果弹窗与烟花被反复触发
  if (!GameState.isPlaying) return;
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

/* =================================================================
 *  ui：浮动化棒与结果弹窗（原 moving_sth_ui.js）
 * ================================================================= */

// 浮动化棒的状态管理
const FloatingSticks = {
  sticks: [],
  container: null,
  animationId: null,
  active: false,

  // 初始化
  init() {
    this.container = document.querySelector(".floating-sticks-container");
    this.createSticks();

    // 设置容器样式，防止点击事件
    this.container.style.pointerEvents = "none";
    this.container.style.zIndex = "900"; // 设置较高的z-index但低于模态框
  },

  // 创建浮动化棒
  createSticks() {
    // 清空现有的化棒
    this.container.innerHTML = "";
    this.sticks = [];

    // 创建10根化棒 (原来是5根)
    for (let i = 0; i < 10; i++) {
      const stick = document.createElement("div");
      stick.className = "floating-stick";

      // 随机位置和旋转
      const x = Math.random() * (window.innerWidth - 100);
      const y = Math.random() * (window.innerHeight - 150);
      const rotation = Math.random() * 360;

      stick.style.left = `${x}px`;
      stick.style.top = `${y}px`;
      stick.style.transform = `rotate(${rotation}deg)`;

      // 确保每个化棒也不可点击
      stick.style.pointerEvents = "none";

      // 添加到容器
      this.container.appendChild(stick);

      // 记录化棒状态
      this.sticks.push({
        element: stick,
        x,
        y,
        rotation,
        velocityX: (Math.random() - 0.5) * 2, // -1 ~ 1的速度
        velocityY: (Math.random() - 0.5) * 2,
        rotationSpeed: (Math.random() - 0.5) * 1.5, // 旋转速度
      });
    }
  },

  // 启动动画
  start() {
    if (this.active) return;

    this.active = true;
    // 游戏开始时，提高化棒容器的z-index，让它显示在最上层
    this.container.style.zIndex = "900";
    this.animate();
  },

  // 停止动画
  stop() {
    this.active = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  },

  // 动画循环
  animate() {
    if (!this.active) return;

    // 更新每根化棒的位置
    this.sticks.forEach((stick) => {
      // 更新位置
      stick.x += stick.velocityX;
      stick.y += stick.velocityY;
      stick.rotation += stick.rotationSpeed;

      // 边缘碰撞检测与反弹
      if (stick.x <= 0 || stick.x >= window.innerWidth - 30) {
        stick.velocityX *= -1; // 反向
        stick.rotationSpeed = (Math.random() - 0.5) * 1.5; // 随机新旋转速度
      }

      if (stick.y <= 0 || stick.y >= window.innerHeight - 120) {
        stick.velocityY *= -1; // 反向
        stick.rotationSpeed = (Math.random() - 0.5) * 1.5; // 随机新旋转速度
      }

      // 限制在窗口内
      stick.x = Math.max(0, Math.min(window.innerWidth - 30, stick.x));
      stick.y = Math.max(0, Math.min(window.innerHeight - 120, stick.y));

      // 更新DOM
      stick.element.style.left = `${stick.x}px`;
      stick.element.style.top = `${stick.y}px`;
      stick.element.style.transform = `rotate(${stick.rotation}deg)`;
    });

    // 继续动画循环
    this.animationId = requestAnimationFrame(() => this.animate());
  },

  // 窗口大小变化时调整
  handleResize() {
    this.sticks.forEach((stick) => {
      // 确保化棒不超出新的窗口边界
      stick.x = Math.min(stick.x, window.innerWidth - 30);
      stick.y = Math.min(stick.y, window.innerHeight - 120);

      stick.element.style.left = `${stick.x}px`;
      stick.element.style.top = `${stick.y}px`;
    });
  },
};

// 更新得分显示
function updateScoreDisplay() {
  const sticksMovedElement = document.getElementById("sticks-moved");
  sticksMovedElement.textContent = GameState.sticksMoved;
}

// 显示结果模态框
function showResultModal() {
  const resultModal = document.getElementById("result-modal");
  const resultTitle = document.getElementById("result-title");
  const resultMessage = document.getElementById("result-message");

  resultTitle.textContent = "时间到！";
  resultMessage.textContent = "计时结束";

  resultTitle.style.color = "var(--primary-color)";
  resultModal.classList.add("show");

  // 添加动画效果
  addFireworks();

  // 停止化棒动画
  FloatingSticks.stop();
}

// 隐藏结果模态框
function hideResultModal() {
  const resultModal = document.getElementById("result-modal");
  resultModal.classList.remove("show");

  // 如果游戏正在进行，重新启动化棒动画
  if (GameState.isPlaying && !GameState.isPaused) {
    FloatingSticks.start();
  }
}

// 添加动画效果
function addAnimation(element, className, duration) {
  element.classList.add(className);
  setTimeout(() => {
    element.classList.remove(className);
  }, duration);
}

// 添加烟花特效
function addFireworks() {
  const modal = document.getElementById("result-modal");
  const colors = ["#3498db", "#2ecc71", "#e74c3c", "#f39c12", "#9b59b6"];

  // 创建烟花数量
  const fireworksCount = 10;

  for (let i = 0; i < fireworksCount; i++) {
    setTimeout(() => {
      // 创建烟花容器
      const firework = document.createElement("div");
      firework.style.position = "absolute";
      firework.style.left = Math.random() * 100 + "%";
      firework.style.top = Math.random() * 100 + "%";
      firework.style.zIndex = "1100";

      // 烟花动画
      // 烟花大小/位置是连续抖动值（保留 Math.random）；配色是"从数组选一个"→ pickOne
      const size = Math.random() * 10 + 10;
      const color = pickOne(colors);

      firework.innerHTML = `
        <svg width="${size * 2}" height="${size * 2}" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="5" fill="${color}">
            <animate attributeName="r" values="5;30;5" dur="1.5s" repeatCount="1" />
            <animate attributeName="opacity" values="1;0" dur="1.5s" repeatCount="1" />
          </circle>
          ${Array.from({ length: 8 }, (_, i) => {
            const angle = (i * Math.PI) / 4;
            const x1 = 50 + Math.cos(angle) * 10;
            const y1 = 50 + Math.sin(angle) * 10;
            const x2 = 50 + Math.cos(angle) * 40;
            const y2 = 50 + Math.sin(angle) * 40;

            return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2">
              <animate attributeName="opacity" values="0;1;0" dur="1.5s" repeatCount="1" />
              <animate attributeName="stroke-width" values="2;0" dur="1.5s" repeatCount="1" />
            </line>`;
          }).join("")}
        </svg>
      `;

      modal.appendChild(firework);

      // 在动画结束后移除
      setTimeout(() => {
        modal.removeChild(firework);
      }, 1500);
    }, i * 200); // 交错启动烟花
  }
}

/* =================================================================
 *  timer：计时器（原 moving_sth_timer.js）
 * ================================================================= */

// 计时器相关变量
let timerInterval = null;
let remainingTime = 0;
let startTime = 0;
let elapsedPausedTime = 0;
let lastPauseTime = 0;

// 启动计时器
function startTimer() {
  // 设置初始时间
  remainingTime = GameState.timeLimit;
  startTime = Date.now();
  elapsedPausedTime = 0;

  // 更新计时器显示
  updateTimerDisplay();

  // 防御性去重：先清旧句柄再起新 interval，杜绝双链并发时旧 interval 失控
  if (timerInterval) clearInterval(timerInterval);

  // 启动定时器，每10毫秒更新一次
  timerInterval = setInterval(() => {
    if (!GameState.isPaused) {
      const currentTime = Date.now();
      const elapsedTime = Math.floor(
        (currentTime - startTime - elapsedPausedTime) / 1000
      );
      remainingTime = GameState.timeLimit - elapsedTime;

      // 更新计时器显示
      updateTimerDisplay();

      // 检查时间是否已到
      if (remainingTime <= 0) {
        clearInterval(timerInterval);
        endGame(); // 时间到，游戏结束
      }

      // 如果时间小于10秒，添加警告样式
      if (remainingTime <= 10) {
        document.getElementById("timer").classList.add("warning");
      } else {
        document.getElementById("timer").classList.remove("warning");
      }
    }
  }, 10);
}

// 暂停计时器
function pauseTimer() {
  if (timerInterval) {
    lastPauseTime = Date.now();
  }
}

// 继续计时器
function resumeTimer() {
  if (lastPauseTime > 0) {
    elapsedPausedTime += Date.now() - lastPauseTime;
    lastPauseTime = 0;
  }
}

// 停止计时器
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// 重置计时器
function resetTimer() {
  stopTimer();
  remainingTime = GameState.timeLimit;
  updateTimerDisplay();
  document.getElementById("timer").classList.remove("warning");
}

// 更新计时器显示
function updateTimerDisplay() {
  const timerElement = document.getElementById("timer");
  const minutes = Math.max(0, Math.floor(remainingTime / 60));
  const seconds = Math.max(0, remainingTime % 60);

  timerElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

// 更新时间限制显示
function updateTimeLimitDisplay() {
  const timeLimitElement = document.getElementById("time-limit");
  timeLimitElement.textContent = GameState.timeLimit;
}

/* =================================================================
 *  data：设置加载/保存（原 moving_sth_data.js）
 * ================================================================= */

// 默认游戏设置
const defaultSettings = {
  timeLimit: 60,
  interfaceOpacity: 0.8, // 添加默认透明度设置
};

/* -----------------------------------------------------------------
 * 设置存档控制器（P11-B6：createPersistence 统一双写/恢复链）
 *   key "movingSthSettings" 与端点 /api/settings/moving-sth 逐字保留（存档契约）。
 *   isValid = "服务端已应答即以其为准"（非 null/undefined 即算存档）：
 *   与迁移前 `if (response.ok) 用服务端 else 回退本地` 一致——服务端返回空壳时
 *   仍以服务端为准，不会因缺字段而改读本地旧值。
 * ----------------------------------------------------------------- */
let apiRef = null; // ctx.api（页面 init 注入；未注入时仅本地读写，远端静默跳过）

/** 页面 init 首行注入 ctx.api（origin 相对路径、非 2xx 抛错） */
export function useMovingSthApi(api) {
  apiRef = api || null;
}

function settingsStore() {
  return createPersistence({
    key: "movingSthSettings",
    endpoint: "/api/settings/moving-sth",
    api: apiRef,
    isValid: (data) => data !== null && data !== undefined,
  });
}

// 加载游戏设置
async function loadGameSettings() {
  // 恢复链（persist 契约）：server → localStorage → 默认设置
  const { data, source } = await settingsStore().load();

  if (source === "none") {
    // 两端都没有（或不可用）→ 使用默认设置
    console.log("使用默认设置");
    useDefaultSettings();
    return defaultSettings;
  }

  // 更新游戏状态
  GameState.timeLimit = data.timeLimit || defaultSettings.timeLimit;
  GameState.interfaceOpacity =
    data.interfaceOpacity !== undefined
      ? data.interfaceOpacity
      : defaultSettings.interfaceOpacity;

  console.log(
    source === "server" ? "从服务器加载设置成功:" : "从localStorage加载设置成功:",
    data
  );
  return data;
}

// 保存游戏设置
async function saveGameSettings(settings) {
  // 双写：先 localStorage（同步、必达）后服务端 POST（异步、失败不抛）
  const { local, remote } = await settingsStore().save(settings);

  if (!local) {
    // 迁移前：localStorage 写失败 → 外层 catch → false（服务端不再尝试）
    console.error("保存设置出错: localStorage 写入失败");
    return false;
  }

  if (remote) {
    console.log("设置保存到服务器成功");
  } else {
    console.log("设置保存到服务器失败，但已保存到本地");
  }

  return true;
}

// 使用默认设置
function useDefaultSettings() {
  GameState.timeLimit = defaultSettings.timeLimit;
  GameState.interfaceOpacity = defaultSettings.interfaceOpacity;
}

/* =================================================================
 *  组件入口（原 core/ui 的 DOMContentLoaded 初始化，kernel render 时执行）
 * ================================================================= */
export function initMovingSthGame(ctx) {
  // cleanup 契约：静态骨架节点 + document/window 监听全部经 signal 登记，
  // 重渲染时 abort 统一解绑，防止不刷新页面的重复 render 双绑双触发
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

  // 持久化控制器取用 ctx.api（origin 相对路径；非 2xx 抛错 → 恢复链回退本地）
  useMovingSthApi(ctx && ctx.api);

  // 原 core DOMContentLoaded：初始化游戏
  initGame();

  // 设置按钮事件监听
  document
    .getElementById("start-timer-btn")
    .addEventListener("click", startGame, { signal });
  document.getElementById("pause-timer-btn").addEventListener("click", () => {
    if (GameState.isPaused) {
      resumeGame();
    } else {
      pauseGame();
    }
  }, { signal });
  document
    .getElementById("reset-timer-btn")
    .addEventListener("click", resetGame, { signal });

  // 设置结果模态框按钮事件
  document.getElementById("try-again-btn").addEventListener("click", resetGame, { signal });
  document.getElementById("back-to-menu-btn").addEventListener("click", () => {
    window.location.href = "/m/games";
  }, { signal });

  // 设置导航按钮事件
  document.getElementById("settings-btn").addEventListener("click", () => {
    window.location.href = "settings.html";
  }, { signal });
  document.getElementById("back-btn").addEventListener("click", () => {
    window.location.href = "/m/games";
  }, { signal });
  document.getElementById("home-btn").addEventListener("click", () => {
    window.location.href = "/m/home";
  }, { signal });

  // 原 ui 顶层监听：ESC 关闭模态框（经 signal 登记）
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideResultModal();
    }
  }, { signal });

  // 原 ui 顶层监听：窗口大小变化处理（经 signal 登记）
  window.addEventListener("resize", () => {
    FloatingSticks.handleResize();
  }, { signal });

  // 原 ui DOMContentLoaded：页面加载完成后初始化浮动化棒
  FloatingSticks.init();

  return () => cleanupMovingSthGame(bindAbort);
}

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用）
 * ================================================================= */
function cleanupMovingSthGame(bindAbort) {
  // signal 登记的静态骨架监听（按钮/document keydown/window resize）统一解绑
  if (bindAbort) bindAbort.abort();

  // 计时 interval 清除
  stopTimer();

  // 浮动化棒 rAF 取消
  FloatingSticks.stop();

  // 倒计时链式 timeout 清除 + 动态节点移除（若中断时仍挂在 body 上）
  countdownTimeouts.forEach((id) => clearTimeout(id));
  countdownTimeouts = [];
  countdownNodes.forEach((node) => {
    if (node.parentNode) node.parentNode.removeChild(node);
  });
  countdownNodes = [];

  // 倒计时 WebAudio 上下文关闭（8bit 音效用，振荡器均已自停）
  countdownAudioContexts.forEach((audioCtx) => {
    try {
      if (audioCtx && audioCtx.state !== "closed") audioCtx.close();
    } catch (e) {
      /* 忽略关闭异常 */
    }
  });
  countdownAudioContexts = [];

  // 游戏态复位，避免重渲染后残留"进行中"的按钮/透明度状态
  GameState.isPlaying = false;
  GameState.isPaused = false;
  GameState.isGameOver = false;
  // 倒计时链被上方 clearTimeout 中断时，.then 不会执行——标志必须在此复位，
  // 否则重渲染后 startGame 被永久拒绝
  GameState.isCountingDown = false;
  applyInterfaceOpacity(false);

  // audio 播放停止
  const musicPlayer = document.getElementById("game-music");
  if (musicPlayer) {
    musicPlayer.pause();
    try {
      musicPlayer.currentTime = 0;
    } catch (e) {
      /* 未加载媒体时可能抛错，忽略 */
    }
  }
}
