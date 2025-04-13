/**
 * 设置中心 - 核心模块
 * 包含通用功能和基础设置
 */

// DOM元素缓存
const DOM = {};

// 全局状态
const State = {
  currentTab: "players",
  currentPlayerFile: "player1",
  currentTrickFile: "tricks",
  playerData: [],
  trickData: [],
  awardData: [],
  editingItemId: null,
  isEditing: false,
  hasChanges: false,
};

// 常量定义
const API_BASE_URL = "http://localhost:3000/api";
const ENDPOINTS = {
  player1: "/player1",
  player2: "/player2",
  tricks: "/tricks",
  tricks_for_group2: "/tricks_for_group2",
  award: "/award", // 确保这里是"/award"而不是"/awards"
};

// 初始化函数
document.addEventListener("DOMContentLoaded", function () {
  console.log("设置页面加载完成");

  // 缓存DOM元素
  cacheDOMElements();

  // 绑定通用事件
  bindCommonEvents();

  // 显示初始标签页
  showTab(State.currentTab);

  // 返回主页按钮
  DOM.homeBtn.addEventListener("click", function () {
    if (State.hasChanges) {
      showConfirmDialog("您有未保存的更改，确定要离开吗？", () => {
        window.location.href = "index.html";
      });
    } else {
      window.location.href = "index.html";
    }
  });
});

// 缓存DOM元素
function cacheDOMElements() {
  // 标签页按钮
  DOM.tabButtons = document.querySelectorAll(".tab-btn");
  DOM.tabPanels = document.querySelectorAll(".tab-panel");

  // 通用元素
  DOM.statusMessage = document.getElementById("status-message");
  DOM.homeBtn = document.getElementById("home-btn");

  // 选手管理元素
  DOM.playerFileSelect = document.getElementById("player-file-select");
  DOM.playerList = document.getElementById("player-list");
  DOM.playerForm = document.getElementById("player-form");
  DOM.playerName = document.getElementById("player-name");
  // 移除对add-player-btn的引用，因为不再需要
  DOM.savePlayersBtn = document.getElementById("save-players-btn");
  DOM.cancelPlayerEdit = document.getElementById("cancel-player-edit");

  // 技能管理元素
  DOM.trickFileSelect = document.getElementById("trick-file-select");
  DOM.trickList = document.getElementById("trick-list");
  DOM.trickForm = document.getElementById("trick-form");
  DOM.trickName = document.getElementById("trick-name");
  // 移除对add-trick-btn的引用，因为不再需要
  DOM.saveTricksBtn = document.getElementById("save-tricks-btn");
  DOM.cancelTrickEdit = document.getElementById("cancel-trick-edit");

  // 奖励管理元素
  DOM.awardList = document.getElementById("award-list");
  DOM.awardForm = document.getElementById("award-form");
  DOM.awardRank = document.getElementById("award-rank");
  DOM.awardName = document.getElementById("award-name");
  DOM.awardDescription = document.getElementById("award-description"); // 新增
  DOM.addAwardBtn = document.getElementById("add-award-btn");
  DOM.saveAwardsBtn = document.getElementById("save-awards-btn");
  DOM.cancelAwardEdit = document.getElementById("cancel-award-edit");
}

// 显示自定义确认对话框
function showConfirmDialog(message, onConfirm, onCancel) {
  // 移除可能已存在的对话框
  const existingDialog = document.querySelector(".dialog-container");
  if (existingDialog) {
    document.body.removeChild(existingDialog);
  }

  // 创建对话框容器
  const dialogContainer = document.createElement("div");
  dialogContainer.className = "dialog-container";

  // 创建半透明遮罩
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  // 创建对话框
  const dialog = document.createElement("div");
  dialog.className = "custom-dialog";

  // 添加内容
  const content = document.createElement("p");
  content.textContent = message;
  dialog.appendChild(content);

  // 添加按钮容器
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "dialog-buttons";

  // 确认按钮
  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "确认";
  confirmBtn.className = "dialog-btn confirm-btn";
  confirmBtn.addEventListener("click", function () {
    document.body.removeChild(dialogContainer);
    if (onConfirm) onConfirm();
  });

  // 取消按钮
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "取消";
  cancelBtn.className = "dialog-btn cancel-btn";
  cancelBtn.addEventListener("click", function () {
    document.body.removeChild(dialogContainer);
    if (onCancel) onCancel();
  });

  // 组装对话框
  buttonContainer.appendChild(confirmBtn);
  buttonContainer.appendChild(cancelBtn);
  dialog.appendChild(buttonContainer);
  dialogContainer.appendChild(overlay);
  dialogContainer.appendChild(dialog);

  // 点击遮罩关闭对话框（相当于取消）
  overlay.addEventListener("click", function () {
    document.body.removeChild(dialogContainer);
    if (onCancel) onCancel();
  });

  // 添加到页面
  document.body.appendChild(dialogContainer);

  // 触发动画
  setTimeout(() => {
    dialog.classList.add("show");
  }, 10);
}

// 绑定通用事件
function bindCommonEvents() {
  // 标签页切换
  DOM.tabButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const tabName = this.dataset.tab;
      showTab(tabName);
    });
  });
}

// 显示标签页
function showTab(tabName) {
  // 记录当前标签页
  State.currentTab = tabName;

  // 更新标签按钮状态
  DOM.tabButtons.forEach((button) => {
    if (button.dataset.tab === tabName) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });

  // 显示对应面板
  DOM.tabPanels.forEach((panel) => {
    if (panel.id === `${tabName}-panel`) {
      panel.classList.add("active");
    } else {
      panel.classList.remove("active");
    }
  });

  // 根据标签页加载数据
  switch (tabName) {
    case "players":
      loadPlayerData(State.currentPlayerFile);
      break;
    case "tricks":
      loadTrickData(State.currentTrickFile);
      break;
    case "awards":
      loadAwardData();
      break;
    case "musics":
      // 音乐导入面板不需要加载数据，只有跳转按钮
      break;
  }
}

// 显示状态消息
function showStatusMessage(message, type = "info") {
  DOM.statusMessage.textContent = message;
  DOM.statusMessage.className = type;
  DOM.statusMessage.classList.add("show");

  setTimeout(() => {
    DOM.statusMessage.classList.remove("show");
  }, 3000);
}

// 通用API请求函数
async function fetchAPI(endpoint, method = "GET", data = null) {
  try {
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    };

    if (data && (method === "POST" || method === "PUT")) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }

    // 对于DELETE请求可能没有返回内容
    if (method === "DELETE") {
      return true;
    }

    // 检查响应内容类型，决定是解析为JSON还是文本
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      // 如果不是JSON，返回文本内容
      return await response.text();
    }
  } catch (error) {
    console.error("API请求错误:", error);
    showStatusMessage(`请求失败: ${error.message}`, "error");
    throw error;
  }
}

// 生成唯一ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
