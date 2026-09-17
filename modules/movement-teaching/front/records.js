/**
 * 体态传技 — 记录页面前端组件（P4 迁移）
 *
 * 由原 m-w-h_records_data.js + m-w-h_records_ui.js 按加载顺序并入同一闭包，
 * 函数体逐行保留；全局函数/变量 → 模块闭包作用域。
 * 原两个 DOMContentLoaded 初始化与脚本顶层 DOM 缓存改由 initMovementTeachingRecords()
 * 承接（kernel render 时 DOM 早已就绪）。
 *
 * 注意：记录行删除按钮走模板内联 onclick="confirmDeleteRecord(...)"，
 * 依赖 window.confirmDeleteRecord 全局桥接（原版行为，保留）。
 *
 * cleanup 覆盖：signal 登记的静态监听；toast/对话框均自清理（带 parentNode 守卫）。
 */

import { icon } from "/web/icons.mjs";

// 记录数据存储
const RecordsData = {
  // 所有记录列表
  records: [],
  // 当前筛选后的记录列表
  filteredRecords: [],
  // 记录统计数据
  stats: {
    totalRecords: 0,
    correctPercentage: 0,
    averageTime: 0,
  },
  // 是否正在加载
  isLoading: true,
};

// 初始化数据
async function initializeData() {
  try {
    await loadRecords();
    updateStats();
    console.log("记录数据初始化完成");
  } catch (error) {
    console.error("初始化记录数据失败:", error);
    showToast("加载记录数据失败", "error");
  }
}

// 加载所有记录
async function loadRecords() {
  RecordsData.isLoading = true;
  updateUI();

  try {
    const response = await fetch("/api/movement-partys");

    if (!response.ok) {
      throw new Error(`获取记录失败: ${response.status}`);
    }

    const data = await response.json();

    if (data && data.records && Array.isArray(data.records)) {
      // 按时间降序排序，最新的排在前面
      RecordsData.records = data.records.sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
      });
      RecordsData.filteredRecords = [...RecordsData.records];
    } else {
      RecordsData.records = [];
      RecordsData.filteredRecords = [];
    }

    console.log(`成功加载 ${RecordsData.records.length} 条记录`);
  } catch (error) {
    console.error("加载记录数据失败:", error);
    showToast("无法连接到服务器", "error");
    RecordsData.records = [];
    RecordsData.filteredRecords = [];
  } finally {
    RecordsData.isLoading = false;
    updateUI();
  }
}

// 删除单条记录
async function deleteRecord(id) {
  try {
    showToast("正在删除记录...", "info");

    const response = await fetch(`/api/movement-partys/${id}`, {
      method: "DELETE",
    });

    // 解析JSON响应
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || `删除失败: ${response.status}`);
    }

    // 从记录列表中移除
    RecordsData.records = RecordsData.records.filter(
      (record) => record.id !== id
    );
    RecordsData.filteredRecords = RecordsData.filteredRecords.filter(
      (record) => record.id !== id
    );

    // 更新统计数据和UI
    updateStats();
    updateUI();

    showToast("记录已删除", "success");
    return true;
  } catch (error) {
    console.error("删除记录失败:", error);
    showToast(`删除记录失败: ${error.message}`, "error");
    return false;
  }
}

// 清空所有记录
async function clearAllRecords() {
  try {
    const response = await fetch("/api/clear-movement-partys", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`清空记录失败: ${response.status}`);
    }

    // 清空记录列表
    RecordsData.records = [];
    RecordsData.filteredRecords = [];

    // 更新统计数据和UI
    updateStats();
    updateUI();

    showToast("所有记录已清空", "success");
    return true;
  } catch (error) {
    console.error("清空记录失败:", error);
    showToast("清空记录失败", "error");
    return false;
  }
}

// 搜索记录
function searchRecords(keyword) {
  if (!keyword || keyword.trim() === "") {
    RecordsData.filteredRecords = [...RecordsData.records];
  } else {
    const searchTerm = keyword.toLowerCase().trim();
    RecordsData.filteredRecords = RecordsData.records.filter((record) => {
      return (
        record.teamName.toLowerCase().includes(searchTerm) ||
        record.trickName.toLowerCase().includes(searchTerm)
      );
    });
  }

  updateUI();
}

// 更新统计数据
function updateStats() {
  const records = RecordsData.records;

  // 总记录数
  RecordsData.stats.totalRecords = records.length;

  // 猜中率
  if (records.length > 0) {
    const correctCount = records.filter(
      (record) => record.isGuessCorrect
    ).length;
    RecordsData.stats.correctPercentage = Math.round(
      (correctCount / records.length) * 100
    );
  } else {
    RecordsData.stats.correctPercentage = 0;
  }

  // 平均时间
  if (records.length > 0) {
    const totalTime = records.reduce((sum, record) => sum + record.duration, 0);
    RecordsData.stats.averageTime = Math.round(totalTime / records.length);
  } else {
    RecordsData.stats.averageTime = 0;
  }
}

// 格式化时间显示（将秒数转换为 MM:SS 格式）
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

// 格式化日期显示
function formatDate(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 显示toast消息
function showToast(message, type = "info", duration = 3000) {
  // 检查toast容器是否存在，不存在则创建
  let toastContainer = document.querySelector(".toast-container");

  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
  }

  // 创建toast元素
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  // 添加到容器
  toastContainer.appendChild(toast);

  // 显示动画
  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  // 设置自动消失
  setTimeout(() => {
    toast.classList.remove("show");

    // 动画完成后移除元素
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }

      // 如果没有更多toast，移除容器
      if (toastContainer.children.length === 0) {
        document.body.removeChild(toastContainer);
      }
    }, 300);
  }, duration);
}

// 添加CSS样式以支持toast消息
(function addToastStyles() {
  if (document.getElementById("toast-styles")) return;

  const style = document.createElement("style");
  style.id = "toast-styles";
  style.textContent = `
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
    }
    
    .toast {
      background-color: #333;
      color: white;
      padding: 12px 20px;
      border-radius: 5px;
      margin-bottom: 10px;
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
      transform: translateX(100%);
      opacity: 0;
      transition: all 0.3s ease;
    }
    
    .toast.show {
      transform: translateX(0);
      opacity: 1;
    }
    
    .toast.success {
      background-color: #28a745;
    }
    
    .toast.error {
      background-color: #dc3545;
    }
    
    .toast.warning {
      background-color: #ffc107;
      color: #333;
    }
    
    .toast.info {
      background-color: #17a2b8;
    }
  `;

  document.head.appendChild(style);
})();

// DOM元素引用（原脚本顶层缓存，改为 init 时填充）
const DOM = {};

// 初始化UI事件监听器
function initializeUI(signal) {
  // 搜索按钮
  DOM.searchBtn.addEventListener("click", handleSearch, { signal });

  // 搜索输入框回车事件
  DOM.searchInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  }, { signal });

  // 刷新按钮
  DOM.refreshBtn.addEventListener("click", refreshRecords, { signal });

  // 清空所有记录按钮
  DOM.clearAllBtn.addEventListener("click", confirmClearAllRecords, { signal });

  // 返回按钮
  DOM.backBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  }, { signal });

  // 主页按钮
  DOM.homeBtn.addEventListener("click", () => {
    window.location.href = "/m/home";
  }, { signal });
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
        ${record.isGuessCorrect ? "猜中" + icon("check", { size: 16 }) : "未猜中" + icon("x", { size: 16 })}
      </td>
      <td>${formatDate(record.date)}</td>
      <td>
        <div class="record-actions">
          <button class="btn-icon btn-delete" title="删除记录" onclick="confirmDeleteRecord(${
            record.id
          })">
            <span class="icon">${icon("trash", { size: 16, label: "删除记录" })}</span>
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
// （记录行删除按钮为内联 onclick，必须挂 window）
window.confirmDeleteRecord = confirmDeleteRecord;

/* =================================================================
 *  组件入口（原两个 DOMContentLoaded 初始化 + 顶层 DOM 缓存，kernel render 时执行）
 * ================================================================= */
export function initMovementTeachingRecords() {
  // cleanup 契约：静态骨架监听经 signal 登记，重渲染时 abort 统一解绑
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

  // DOM元素引用
  DOM.recordsList = document.getElementById("records-list");
  DOM.totalRecords = document.getElementById("total-records");
  DOM.correctPercentage = document.getElementById("correct-percentage");
  DOM.averageTime = document.getElementById("average-time");
  DOM.searchInput = document.getElementById("search-input");
  DOM.searchBtn = document.getElementById("search-btn");
  DOM.refreshBtn = document.getElementById("refresh-btn");
  DOM.clearAllBtn = document.getElementById("clear-all-btn");
  DOM.backBtn = document.getElementById("back-btn");
  DOM.homeBtn = document.getElementById("home-btn");
  DOM.confirmDialogTemplate = document.getElementById("confirm-dialog-template");

  // 静态骨架图标：刷新 / 清空 / 搜索按钮（原 HTML 内 emoji，此处注入 Tabler SVG）
  const staticIcons = [
    [DOM.refreshBtn, "refresh", "刷新记录列表"],
    [DOM.clearAllBtn, "trash", "清空所有记录"],
    [DOM.searchBtn, "search", "搜索"],
  ];
  for (const [btn, name, label] of staticIcons) {
    const host = btn && btn.querySelector(".icon");
    if (host) host.innerHTML = icon(name, { size: 16, label });
  }

  // 页面加载完成时初始化（原两个 DOMContentLoaded 按 data→ui 注册序触发）
  initializeData();
  initializeUI(signal);

  return () => {
    // signal 登记的静态骨架监听统一解绑
    if (bindAbort) bindAbort.abort();
  };
}
