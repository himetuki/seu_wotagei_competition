/**
 * 体态传技 - 记录UI交互模块
 * 负责处理记录界面的渲染和用户交互
 */

// DOM元素引用
const DOM = {
  recordsList: document.getElementById("records-list"),
  totalRecords: document.getElementById("total-records"),
  correctPercentage: document.getElementById("correct-percentage"),
  averageTime: document.getElementById("average-time"),
  searchInput: document.getElementById("search-input"),
  searchBtn: document.getElementById("search-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  clearAllBtn: document.getElementById("clear-all-btn"),
  backBtn: document.getElementById("back-btn"),
  homeBtn: document.getElementById("home-btn"),
  confirmDialogTemplate: document.getElementById("confirm-dialog-template"),
};

// 初始化UI事件监听器
function initializeUI() {
  // 搜索按钮
  DOM.searchBtn.addEventListener("click", handleSearch);

  // 搜索输入框回车事件
  DOM.searchInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  });

  // 刷新按钮
  DOM.refreshBtn.addEventListener("click", refreshRecords);

  // 清空所有记录按钮
  DOM.clearAllBtn.addEventListener("click", confirmClearAllRecords);

  // 返回按钮
  DOM.backBtn.addEventListener("click", () => {
    window.location.href = "movement_without_hands.html";
  });

  // 主页按钮
  DOM.homeBtn.addEventListener("click", () => {
    window.location.href = "../index.html";
  });
}

// 处理搜索
function handleSearch() {
  const keyword = DOM.searchInput.value;
  searchRecords(keyword);
}

// 刷新记录
function refreshRecords() {
  // 清空搜索框
  DOM.searchInput.value = "";
  // 重新加载记录
  loadRecords().then(() => {
    showToast("记录已刷新", "info");
  });
}

// 确认清空所有记录
function confirmClearAllRecords() {
  showConfirmDialog(
    "确定要清空所有游戏记录吗？此操作无法撤销。",
    clearAllRecords
  );
}

// 确认删除单条记录
function confirmDeleteRecord(id) {
  showConfirmDialog(
    "确定要删除此条记录吗？",
    () => deleteRecord(parseInt(id)) // 确保id是数字类型
  );
}

// 显示确认对话框
function showConfirmDialog(message, onConfirm) {
  // 克隆模板
  const dialogNode = DOM.confirmDialogTemplate.content.cloneNode(true);
  const dialogOverlay = dialogNode.querySelector(".confirm-dialog-overlay");
  const dialog = dialogNode.querySelector(".confirm-dialog");
  const messageElement = dialogNode.querySelector(".dialog-message");
  const confirmBtn = dialogNode.querySelector(".confirm-btn");
  const cancelBtn = dialogNode.querySelector(".cancel-btn");

  // 设置消息
  messageElement.textContent = message;

  // 添加到页面
  document.body.appendChild(dialogNode);

  // 添加确认事件
  confirmBtn.addEventListener("click", () => {
    closeDialog();
    if (typeof onConfirm === "function") {
      onConfirm();
    }
  });

  // 添加取消事件
  cancelBtn.addEventListener("click", closeDialog);

  // 点击背景关闭对话框
  dialogOverlay.addEventListener("click", (e) => {
    if (e.target === dialogOverlay) {
      closeDialog();
    }
  });

  // 显示动画
  setTimeout(() => {
    dialogOverlay.classList.add("visible");
    dialog.classList.add("visible");
  }, 10);

  // 关闭对话框函数
  function closeDialog() {
    dialogOverlay.classList.remove("visible");
    dialog.classList.remove("visible");

    // 动画结束后移除
    setTimeout(() => {
      if (dialogOverlay.parentNode) {
        document.body.removeChild(dialogOverlay);
      }
    }, 300);
  }
}

// 更新UI
function updateUI() {
  // 更新记录列表
  renderRecordsList();

  // 更新统计信息
  updateStatsDisplay();
}

// 渲染记录列表
function renderRecordsList() {
  const records = RecordsData.filteredRecords;

  if (RecordsData.isLoading) {
    DOM.recordsList.innerHTML = `
      <tr class="loading-row">
        <td colspan="6">正在加载记录...</td>
      </tr>
    `;
    return;
  }

  if (records.length === 0) {
    DOM.recordsList.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">暂无游戏记录</td>
      </tr>
    `;
    return;
  }

  DOM.recordsList.innerHTML = records
    .map(
      (record, index) => `
    <tr data-id="${record.id}">
      <td>${record.teamName}</td>
      <td>${record.trickName}</td>
      <td>${formatTime(record.duration)}</td>
      <td class="${record.isGuessCorrect ? "correct" : "incorrect"}">
        ${record.isGuessCorrect ? "猜中✓" : "未猜中✗"}
      </td>
      <td>${formatDate(record.date)}</td>
      <td>
        <div class="record-actions">
          <button class="btn-icon btn-delete" title="删除记录" onclick="confirmDeleteRecord(${
            record.id
          })">
            <span class="icon">🗑️</span>
          </button>
        </div>
      </td>
    </tr>
  `
    )
    .join("");
}

// 更新统计信息显示
function updateStatsDisplay() {
  DOM.totalRecords.textContent = RecordsData.stats.totalRecords;
  DOM.correctPercentage.textContent = `${RecordsData.stats.correctPercentage}%`;
  DOM.averageTime.textContent = formatTime(RecordsData.stats.averageTime);

  // 为数字添加视觉效果
  animateNumberChange(DOM.totalRecords);
  animateNumberChange(DOM.correctPercentage);
  animateNumberChange(DOM.averageTime);
}

// 数字变化动画
function animateNumberChange(element) {
  element.classList.add("number-change");
  setTimeout(() => {
    element.classList.remove("number-change");
  }, 500);
}

// 在全局作用域下暴露需要在HTML中直接调用的函数
window.confirmDeleteRecord = confirmDeleteRecord;

// 页面加载完成时初始化UI
document.addEventListener("DOMContentLoaded", initializeUI);
