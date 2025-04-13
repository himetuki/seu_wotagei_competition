/**
 * 音乐导入功能 - 核心模块
 * 包含全局状态和初始化功能
 */

// DOM元素缓存
const DOM = {};

// 全局状态
const AppState = {
  // 当前选择的组别
  currentGroup: "1yearplus",

  // 组别配置信息
  groups: {
    "1yearplus": {
      name: "一年加组第一章节",
      folder: "resource\\musics\\1yearplus",
      jsonFile: "musics_list.json",
      count: 0,
    },
    "1yearplus_ex": {
      name: "一年加组第二章节",
      folder: "resource\\musics\\1yearplus_ex",
      jsonFile: "musics_list_ex.json", // 修正拼写错误：muisic_list_ex.json -> musics_list_ex.json
      count: 0,
    },
    "1yearminus": {
      name: "一年内组",
      folder: "resource\\musics\\1yearminus",
      jsonFile: "musics_list_2.json",
      count: 0,
    },
    games_musics: {
      name: "搬化棒游戏音乐",
      folder: "resource\\musics\\games_musics",
      jsonFile: "games_musics.json",
      count: 0,
    },
  },

  // 上传状态
  uploading: false,

  // 已选择的文件
  selectedFiles: [],

  // 上传进度
  progress: 0,

  // 当前组别的音乐文件列表
  musicFiles: [],

  // 是否正在加载音乐文件列表
  loadingMusicFiles: false,

  // 手动选择的上传目标组别
  manualTargetGroup: null,
};

// 初始化函数 - 页面加载完成时执行
document.addEventListener("DOMContentLoaded", () => {
  console.log("音乐导入页面初始化中...");

  // 缓存DOM元素
  cacheDOMElements();

  // 检查上传组件状态
  checkUploaderStatus();

  // 设置事件监听
  setupEventListeners();

  // 加载当前组别音乐数量
  loadGroupMusicCounts();

  // 加载当前组别音乐文件列表
  loadMusicFiles();

  // 更新UI
  updateGroupInfo();

  // 初始化上传目标选择
  initUploadTargetSelection();
});

// 检查上传组件状态
async function checkUploaderStatus() {
  try {
    const response = await fetch("/api/upload_status");

    if (!response.ok) {
      throw new Error(`服务器错误: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success || !data.uploaderReady) {
      showStatusMessage(
        `上传组件未就绪: ${
          data.error || "可能缺少multer模块"
        }。请联系管理员安装multer。`,
        "error",
        10000
      );
      console.error("上传组件未就绪:", data);
    } else {
      console.log("上传组件已就绪, 版本:", data.version);
    }
  } catch (error) {
    console.error("检查上传组件状态失败:", error);
    showStatusMessage("无法连接到服务器，上传功能可能不可用", "warning", 5000);
  }
}

// 缓存DOM元素引用
function cacheDOMElements() {
  // 组别选择按钮
  DOM.groupButtons = document.querySelectorAll(".group-btn");

  // 文件上传相关
  DOM.dropArea = document.getElementById("drop-area");
  DOM.fileInput = document.getElementById("file-input");
  DOM.fileList = document.getElementById("file-list");
  DOM.uploadCount = document.getElementById("upload-count");
  DOM.startUploadBtn = document.getElementById("start-upload-btn");
  DOM.clearFilesBtn = document.getElementById("clear-files-btn");

  // 组别信息显示
  DOM.currentGroupName = document.getElementById("current-group-name");
  DOM.currentFolder = document.getElementById("current-folder");
  DOM.currentJson = document.getElementById("current-json");
  DOM.currentCount = document.getElementById("current-count");

  // 状态和进度
  DOM.statusMessage = document.getElementById("status-message");
  DOM.progressContainer = document.getElementById("progress-container");
  DOM.progressBarInner = document.getElementById("progress-bar-inner");
  DOM.progressText = document.getElementById("progress-text");

  // 导航按钮
  DOM.settingsBtn = document.getElementById("settings-btn");
  DOM.homeBtn = document.getElementById("home-btn");

  // 音乐文件列表
  DOM.musicFilesList = document.getElementById("music-files-list");
  DOM.refreshMusicListBtn = document.getElementById("refresh-music-list");
}

// 设置事件监听器
function setupEventListeners() {
  // 组别切换按钮
  DOM.groupButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.dataset.group;
      changeGroup(group);
    });
  });

  // 文件拖放区域
  DOM.dropArea.addEventListener("dragover", handleDragOver);
  DOM.dropArea.addEventListener("dragleave", handleDragLeave);
  DOM.dropArea.addEventListener("drop", handleFileDrop);

  // 文件选择输入
  DOM.fileInput.addEventListener("change", handleFileSelect);

  // 上传和清除按钮
  DOM.startUploadBtn.addEventListener("click", startUpload);
  DOM.clearFilesBtn.addEventListener("click", clearFileList);

  // 导航按钮
  DOM.settingsBtn.addEventListener("click", () => {
    window.location.href = "../html/setting.html";
  });

  DOM.homeBtn.addEventListener("click", () => {
    window.location.href = "../html/index.html";
  });

  // 刷新音乐文件列表按钮
  if (DOM.refreshMusicListBtn) {
    DOM.refreshMusicListBtn.addEventListener("click", () => {
      loadMusicFiles(true);
    });
  }
}

// 初始化上传目标选择
function initUploadTargetSelection() {
  const targetSelect = document.getElementById("upload-target-group");
  if (!targetSelect) return;

  // 设置默认值为当前组别
  targetSelect.value = AppState.currentGroup;

  // 监听变化
  targetSelect.addEventListener("change", () => {
    AppState.manualTargetGroup = targetSelect.value;
    console.log(`已手动选择上传目标组别: ${AppState.manualTargetGroup}`);
  });

  // 初始化手动目标组别
  AppState.manualTargetGroup = targetSelect.value;
}

// 切换当前组别
function changeGroup(group) {
  // 更新当前组别
  AppState.currentGroup = group;

  // 更新按钮样式
  DOM.groupButtons.forEach((button) => {
    if (button.dataset.group === group) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });

  // 更新组别信息显示
  updateGroupInfo();

  // 加载新组别的音乐文件列表
  loadMusicFiles();

  // 同时更新上传目标选择
  const targetSelect = document.getElementById("upload-target-group");
  if (targetSelect) {
    targetSelect.value = group;
    AppState.manualTargetGroup = group;
  }
}

// 更新组别信息显示
function updateGroupInfo() {
  const groupInfo = AppState.groups[AppState.currentGroup];

  DOM.currentGroupName.textContent = groupInfo.name;
  DOM.currentFolder.textContent = groupInfo.folder;
  DOM.currentJson.textContent = groupInfo.jsonFile;
  DOM.currentCount.textContent = groupInfo.count;
}

// 加载各组别现有音乐数量
async function loadGroupMusicCounts() {
  try {
    for (const group in AppState.groups) {
      const count = await getMusicCount(group);
      AppState.groups[group].count = count;
    }

    // 更新当前组别信息
    updateGroupInfo();
  } catch (error) {
    console.error("加载音乐数量失败:", error);
    showStatusMessage("加载音乐数量失败: " + error.message, "error");
  }
}

// 加载当前组别的音乐文件列表
async function loadMusicFiles(forceRefresh = false) {
  if (AppState.loadingMusicFiles && !forceRefresh) return;

  AppState.loadingMusicFiles = true;
  AppState.musicFiles = [];

  // 更新UI显示加载中
  updateMusicFilesList();

  try {
    const result = await getMusicFiles(AppState.currentGroup);

    if (result.success) {
      AppState.musicFiles = result.files || [];
      console.log(`成功加载 ${AppState.musicFiles.length} 个音乐文件`);
    } else {
      console.error("加载音乐文件列表失败:", result.error);
      showStatusMessage(`加载音乐文件列表失败: ${result.error}`, "error");
    }
  } catch (error) {
    console.error("加载音乐文件列表异常:", error);
    showStatusMessage(`加载音乐文件列表异常: ${error.message}`, "error");
  } finally {
    AppState.loadingMusicFiles = false;
    updateMusicFilesList();
  }
}
