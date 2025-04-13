/**
 * 体态传技 - 记录模块
 * 处理游戏结果记录和保存
 */

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

    // 更新状态
    RecordState.isResultSaved = true;

    // 添加CSS样式以支持保存状态提示消息
    ensureFeedbackStylesExist();

    // 创建并显示成功消息
    const feedbackMsg = document.createElement("div");
    feedbackMsg.className = "record-feedback success";
    feedbackMsg.innerHTML = `<span class="icon">✓</span> 游戏记录已保存成功`;

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
    saveButton.textContent = "已保存 ✓";
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
    feedbackMsg.innerHTML = `<span class="icon">✗</span> 保存失败: ${error.message}`;

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
    window.location.href = "../games_select.html";
  });

  // 淡入动画
  setTimeout(() => {
    modalOverlay.classList.add("visible");
    resultModal.classList.add("visible");
  }, 10);
}

// 查看记录页面
function viewRecords() {
  window.location.href = "m-w-h_records.html";
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

// 格式化时间（辅助函数）
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

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

// 导出需要的函数给其他模块使用
window.RecordModule = {
  addResultButtons,
  showRecordForm,
  revealTrick,
  closeResultModal,
  viewRecords,
};
