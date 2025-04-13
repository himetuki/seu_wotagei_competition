/**
 * 体态传技 - UI模块
 * 处理用户界面交互
 */

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
    window.location.href = "../games_select.html";
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

// 格式化时间（辅助函数）
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

// 显示提示消息
function showToast(message, type = "info", duration = 3000) {
  // 先移除可能存在的旧提示
  const existingToast = document.querySelector(".toast-message");
  if (existingToast) {
    document.body.removeChild(existingToast);
  }

  // 创建提示元素
  const toast = document.createElement("div");
  toast.className = `toast-message ${type}-toast`;
  toast.textContent = message;

  // 添加到页面
  document.body.appendChild(toast);

  // 显示动画
  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  // 自动隐藏
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, duration);
}

// 揭示当前技能
function revealTrick() {
  if (!GameData.currentTrick) {
    showToast("没有技能可揭示", "warning");
    return;
  }

  // 显示技能名称
  const trickReveal = document.createElement("div");
  trickReveal.classList.add("trick-reveal");
  trickReveal.innerHTML = `
    <div class="reveal-content">
      <h3>本次游戏技能</h3>
      <p class="trick-name">${GameData.currentTrick}</p>
      <button id="close-reveal-btn" class="primary-btn">关闭</button>
    </div>
  `;

  document.body.appendChild(trickReveal);

  // 绑定关闭事件
  document.getElementById("close-reveal-btn").addEventListener("click", () => {
    if (trickReveal.parentNode) {
      trickReveal.parentNode.removeChild(trickReveal);
    }
  });
}

// 显示保存记录表单
function showRecordForm() {
  const recordForm = document.createElement("div");
  recordForm.classList.add("record-form");
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

  document.body.appendChild(recordForm);

  // 绑定事件
  document
    .getElementById("save-record-btn")
    .addEventListener("click", saveGameRecord);
  document
    .getElementById("cancel-record-btn")
    .addEventListener("click", hideRecordForm);

  // 设置表单动画效果
  setTimeout(() => recordForm.classList.add("visible"), 10);
}

// 隐藏保存记录表单
function hideRecordForm() {
  const recordForm = document.getElementById("record-form");
  if (recordForm) {
    recordForm.classList.remove("visible");
    setTimeout(() => {
      if (recordForm.parentNode) {
        recordForm.parentNode.removeChild(recordForm);
      }
    }, 300);
  }
}

// 保存游戏记录
async function saveGameRecord() {
  const teamNameInput = document.getElementById("team-name");
  const guessResultRadios = document.getElementsByName("guess-result");

  // 获取表单数据
  const teamName = teamNameInput.value.trim();

  if (!teamName) {
    showToast("请输入队伍名称", "warning");
    return;
  }

  // 获取猜测结果
  let isGuessCorrect = false;
  for (const radio of guessResultRadios) {
    if (radio.checked) {
      isGuessCorrect = radio.value === "correct";
      break;
    }
  }

  // 准备数据
  const recordData = {
    teamName: teamName,
    isGuessCorrect: isGuessCorrect,
    duration: GameState.elapsedSeconds,
    trickName: GameData.currentTrick,
    date: new Date().toISOString(),
  };

  try {
    // 发送到服务器
    const response = await fetch("../../api/movement-partys", {
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

    // 显示成功消息
    showToast("游戏记录已保存", "success");

    // 隐藏表单
    hideRecordForm();
  } catch (error) {
    console.error("保存游戏记录失败:", error);
    showToast(`保存记录失败: ${error.message}`, "error");
  }
}

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
