/**
 * 体态传技 - 记录数据处理模块
 * 负责处理记录的加载、过滤、删除等操作
 */

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
    const response = await fetch("../../api/movement-partys");

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

    const response = await fetch(`../../api/movement-partys/${id}`, {
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
    const response = await fetch("../../api/clear-movement-partys", {
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

// 页面加载完成时初始化
document.addEventListener("DOMContentLoaded", initializeData);
