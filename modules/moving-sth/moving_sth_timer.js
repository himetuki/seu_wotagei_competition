/**
 * 定时搬化棒 - 计时器模块
 * 负责游戏计时功能
 */

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
