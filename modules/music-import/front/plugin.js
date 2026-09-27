/**
 * modules/music-import 前端插件（P4 插件化迁移，原 music_core.js + music_ui.js +
 * music_import.js + music_api.js 按加载顺序整体迁入同一模块闭包）
 *
 * 契约：原生 ESM，不 import 内核；apply 阶段只 register（key = 模块 id "music-import"）；
 * DOM 操作统一发生在 component 被调用时（kernel 装配完成后 render，DOM 早已就绪，
 * 原 DOMContentLoaded 包裹随之去除）。函数体逐行保留，适配点：
 *   - 顶层 DOM/AppState → 模块级变量（原脚本全局变量，单页面单实例语义不变）
 *   - 静态骨架/document.body 监听一律 { signal } 登记（AbortController），cleanup 统一 abort
 *   - 上传仍用原生 XHR + FormData 直连共享层 /api/upload_music 等端点（multer 语义在
 *     共享路由 server/routes/music-routes.js，属共享层不归本插件，前端调用逐字不变）
 *   - P5a：回收站按钮改容器级事件委托（原 inline onclick 拼接文件名，单引号文件名会炸），
 *     window.moveFileToRecycle 全局桥随之移除（唯一消费方即该 inline onclick）
 * 旧 music_*.js 保留磁盘、不再加载；行为与迁移前逐字一致。
 */

// DOM元素缓存（原 music_core.js）
import { icon } from "/web/icons.mjs";
import { createTimerRegistry } from "/web/lib/timers.mjs";

const DOM = {};

/* 一次性定时器句柄（cleanup 统一清理，避免 teardown 后回调仍在飞）——
 * P12 起经 /web/lib/timers.mjs 注册表统一登记（替代原 pageTimers + later() 样板） */
const timers = createTimerRegistry();
/** 登记一次性定时器（别名保既有调用点零改动） */
const later = (fn, ms) => timers.later(fn, ms);

/* P12：确认弹窗归 component-confirm-dialog 组件实例——节点/监听/动画/单弹窗语义由组件
   自管，onReady 回填模块级桥 confirmApi（组件缺失时降级 warn，见 showConfirmDialog） */
let confirmApi = null;

// 全局状态（原 music_core.js）
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

export default {
  name: "music-import-front",
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({ key: "music-import", component: musicImportComponent });
  },
};

/* =================================================================
 *  组件入口（原 DOMContentLoaded 初始化，kernel render 时执行）
 * ================================================================= */
function musicImportComponent(el, meta, ctx) {
  // cleanup 契约：静态骨架/document.body 监听经 signal 登记，重渲染时 abort 统一解绑
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

  // P12：confirm-dialog 组件实例化（自挂 body；onReady 回填模块级桥 confirmApi；
  // 组件缺失时桥接降级 warn，确认类操作不会被误触发）
  let disposeConfirm = null;
  const confirmFactory = ctx && ctx.ui ? ctx.ui.component("confirm-dialog") : null;
  if (confirmFactory) {
    const dispose = confirmFactory(
      document.body,
      { onReady: (api) => { confirmApi = api; } },
      ctx
    );
    if (typeof dispose === "function") disposeConfirm = dispose;
  }

  console.log("音乐导入页面初始化中...");

  // 缓存DOM元素
  cacheDOMElements();

  // 检查上传组件状态
  checkUploaderStatus();

  // 设置事件监听
  setupEventListeners(signal);

  // 加载当前组别音乐数量
  loadGroupMusicCounts();

  // 加载当前组别音乐文件列表
  loadMusicFiles();

  // 更新UI
  updateGroupInfo();

  // 初始化上传目标选择
  initUploadTargetSelection(signal);

  // 注：「设置页 → 音乐导入」跳转按钮的 body 级委托监听已删除 —— 该按钮不在本页
  //（#goto-music-import-btn 在 modules/setting/index.html），委托永不触发；
  // 唯一活路径是 setting 组件内 { signal } 绑定的常规监听。

  return () => {
    cleanupMusicImportPage(bindAbort);
    // P12：confirm-dialog 组件实例卸载（移除在开对话框 + 清组件在飞定时器）
    if (disposeConfirm) disposeConfirm();
    confirmApi = null;
  };
}

/* =================================================================
 *  原 music_core.js
 * ================================================================= */

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

  // 静态骨架图标：刷新按钮（原 HTML 内 emoji → Tabler SVG）
  const refreshIconHost = DOM.refreshMusicListBtn && DOM.refreshMusicListBtn.querySelector(".icon");
  if (refreshIconHost) refreshIconHost.innerHTML = icon("refresh", { size: 16, label: "刷新文件列表" });
}

// 设置事件监听器
function setupEventListeners(signal) {
  // 组别切换按钮
  DOM.groupButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.dataset.group;
      changeGroup(group);
    }, { signal });
  });

  // 文件拖放区域
  DOM.dropArea.addEventListener("dragover", handleDragOver, { signal });
  DOM.dropArea.addEventListener("dragleave", handleDragLeave, { signal });
  DOM.dropArea.addEventListener("drop", handleFileDrop, { signal });

  // 文件选择输入
  DOM.fileInput.addEventListener("change", handleFileSelect, { signal });

  // 上传和清除按钮
  DOM.startUploadBtn.addEventListener("click", startUpload, { signal });
  DOM.clearFilesBtn.addEventListener("click", clearFileList, { signal });

  // 导航按钮
  DOM.settingsBtn.addEventListener("click", () => {
    window.location.href = "/m/setting";
  }, { signal });

  DOM.homeBtn.addEventListener("click", () => {
    window.location.href = "/m/home";
  }, { signal });

  // 刷新音乐文件列表按钮
  if (DOM.refreshMusicListBtn) {
    DOM.refreshMusicListBtn.addEventListener("click", () => {
      loadMusicFiles(true);
    }, { signal });
  }

  // P5a：文件行"移到回收文件夹"按钮改为容器级事件委托（原 innerHTML 模板内
  // inline onclick 拼接文件名，含单引号的文件名会破坏调用）。文件名取自行上的
  // data-filename（绑定容器为静态节点，随 signal 解绑，innerHTML 重渲染不影响）。
  if (DOM.musicFilesList) {
    DOM.musicFilesList.addEventListener("click", (event) => {
      const btn = event.target.closest(".move-to-recycle-btn");
      if (!btn) return;
      const row = btn.closest("tr[data-filename]");
      if (row && row.dataset.filename) {
        moveFileToRecycle(row.dataset.filename);
      }
    }, { signal });
  }
}

// 初始化上传目标选择
function initUploadTargetSelection(signal) {
  const targetSelect = document.getElementById("upload-target-group");
  if (!targetSelect) return;

  // 设置默认值为当前组别
  targetSelect.value = AppState.currentGroup;

  // 监听变化
  targetSelect.addEventListener("change", () => {
    AppState.manualTargetGroup = targetSelect.value;
    console.log(`已手动选择上传目标组别: ${AppState.manualTargetGroup}`);
  }, { signal });

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

/* =================================================================
 *  原 music_ui.js
 * ================================================================= */

// 处理拖拽悬停效果
function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  DOM.dropArea.classList.add("dragover");
}

// 处理拖拽离开效果
function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  DOM.dropArea.classList.remove("dragover");
}

// 清空文件列表
function clearFileList() {
  AppState.selectedFiles = [];
  DOM.fileList.innerHTML = "";
  DOM.uploadCount.textContent = "0";
  updateUploadButtons();

  // 重置文件输入，允许再次选择相同文件
  DOM.fileInput.value = "";
}

// 更新上传按钮状态
function updateUploadButtons() {
  const hasFiles = AppState.selectedFiles.length > 0;

  DOM.startUploadBtn.disabled = !hasFiles || AppState.uploading;
  DOM.clearFilesBtn.disabled = !hasFiles || AppState.uploading;
}

// 显示状态消息
function showStatusMessage(message, type = "info", duration = 3000) {
  // 创建或更新状态消息
  DOM.statusMessage.textContent = message;
  DOM.statusMessage.className = `status-message ${type} show`;

  // 设置自动消失
  later(() => {
    DOM.statusMessage.classList.remove("show");
  }, duration);
}

// 更新文件列表显示
function updateFileList() {
  // 清空现有列表
  DOM.fileList.innerHTML = "";

  // 添加每个文件
  AppState.selectedFiles.forEach((file, index) => {
    const listItem = document.createElement("li");
    listItem.className = "file-item";

    // 创建文件信息显示
    const fileInfo = document.createElement("div");
    fileInfo.className = "file-info";

    // 文件名
    const fileName = document.createElement("span");
    fileName.className = "file-name";
    fileName.textContent = file.name;

    // 文件大小
    const fileSize = document.createElement("span");
    fileSize.className = "file-size";
    fileSize.textContent = formatFileSize(file.size);

    // 添加文件信息
    fileInfo.appendChild(fileName);
    fileInfo.appendChild(fileSize);

    // 创建删除按钮
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-file-btn";
    deleteBtn.innerHTML = "×";
    deleteBtn.title = "移除文件";
    deleteBtn.addEventListener("click", () => removeFile(index));

    // 组装列表项
    listItem.appendChild(fileInfo);
    listItem.appendChild(deleteBtn);

    // 添加到列表
    DOM.fileList.appendChild(listItem);
  });

  // 更新文件计数
  DOM.uploadCount.textContent = AppState.selectedFiles.length;

  // 更新按钮状态
  updateUploadButtons();
}

// 从列表中移除文件
function removeFile(index) {
  if (AppState.uploading) return; // 上传过程中不允许移除

  AppState.selectedFiles.splice(index, 1);
  updateFileList();
}

// 格式化文件大小显示
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// 更新上传进度显示
function updateProgressBar(progress) {
  AppState.progress = progress;

  if (progress === 0) {
    DOM.progressContainer.classList.add("hidden");
    return;
  }

  // 显示进度条
  DOM.progressContainer.classList.remove("hidden");

  // 更新进度条宽度
  DOM.progressBarInner.style.width = `${progress}%`;

  // 更新进度文本
  DOM.progressText.textContent = `${Math.round(progress)}%`;

  // 如果完成，3秒后隐藏进度条
  if (progress === 100) {
    later(() => {
      DOM.progressContainer.classList.add("hidden");
    }, 3000);
  }
}

// 添加上传按钮动画效果
function addUploadButtonAnimation() {
  DOM.startUploadBtn.classList.add("uploading");

  // 上传完成或停止时移除动画
  if (!AppState.uploading) {
    DOM.startUploadBtn.classList.remove("uploading");
  }
}

// 添加文件列表动画效果
function addListItemAnimation() {
  // 为新添加的文件添加动画效果
  const items = DOM.fileList.querySelectorAll(".file-item");
  items.forEach((item, index) => {
    item.style.animationDelay = `${index * 0.05}s`;
    item.classList.add("animate-in");
  });
}

// 显示上传成功或失败的视觉反馈
function showUploadResult(success) {
  const resultClass = success ? "upload-success" : "upload-error";

  // 添加结果类用于视觉反馈
  DOM.progressContainer.classList.add(resultClass);

  // 3秒后移除效果
  later(() => {
    DOM.progressContainer.classList.remove(resultClass);
  }, 3000);
}

// 更新音乐文件列表显示
function updateMusicFilesList() {
  const container = DOM.musicFilesList;
  if (!container) return;

  if (AppState.loadingMusicFiles) {
    container.innerHTML = `
      <tr class="loading-row">
        <td colspan="3">加载音乐文件列表中...</td>
      </tr>
    `;
    return;
  }

  if (AppState.musicFiles.length === 0) {
    container.innerHTML = `
      <tr class="empty-row">
        <td colspan="3">当前组别没有音乐文件</td>
      </tr>
    `;
    return;
  }

  // 渲染音乐文件列表（按钮点击经 setupEventListeners 的容器级委托分发，
  // 文件名从 tr[data-filename] 读取，不再 inline onclick 拼接）
  container.innerHTML = AppState.musicFiles
    .map(
      (file, index) => `
    <tr data-filename="${file.name}">
      <td>${index + 1}</td>
      <td title="${file.name}">${file.name}</td>
      <td>
        <button class="move-to-recycle-btn">
          移到回收文件夹
        </button>
      </td>
    </tr>
  `
    )
    .join("");
}

// 移动文件到回收文件夹
async function moveFileToRecycle(filename) {
  if (AppState.uploading) {
    showStatusMessage("上传过程中不能移动文件", "warning");
    return;
  }

  // 使用自定义确认对话框而不是浏览器原生confirm
  showConfirmDialog(
    `确定要将文件 "${filename}" 移动到回收文件夹吗？`,
    async () => {
      // 用户确认后的操作
      showStatusMessage("正在移动文件...", "info");

      try {
        const result = await moveToRecycle(AppState.currentGroup, filename);

        if (result.success) {
          showStatusMessage(`文件 "${filename}" 已移动到回收文件夹`, "success");

          // 从当前列表中移除
          AppState.musicFiles = AppState.musicFiles.filter(
            (file) => file.name !== filename
          );
          updateMusicFilesList();

          // 更新音乐数量
          if (result.scanResult && result.scanResult.count !== undefined) {
            AppState.groups[AppState.currentGroup].count =
              result.scanResult.count;
            updateGroupInfo();
          } else {
            // 如果没有返回新的数量，重新加载
            loadGroupMusicCounts();
          }
        } else {
          showStatusMessage(`移动文件失败: ${result.error}`, "error");
        }
      } catch (error) {
        showStatusMessage(`移动文件异常: ${error.message}`, "error");
      }
    }
  );
}

// 显示自定义确认对话框（P12 桥接：实现归 component-confirm-dialog 组件实例，
// 调用点零改动。降级 = warn 且不回调 onConfirm——防组件被禁用时误触发移动/删除）
function showConfirmDialog(message, onConfirm, onCancel) {
  if (confirmApi) confirmApi(message, onConfirm, onCancel);
  else console.warn("[music-import] confirm-dialog 组件不可用，已忽略确认请求");
}

/* =================================================================
 *  原 music_import.js
 * ================================================================= */

// 处理文件拖放
function handleFileDrop(event) {
  event.preventDefault();
  event.stopPropagation();

  // 移除拖拽样式
  DOM.dropArea.classList.remove("dragover");

  // 获取拖放的文件
  const files = event.dataTransfer.files;
  processFiles(files);
}

// 处理文件选择
function handleFileSelect(event) {
  const files = event.target.files;
  processFiles(files);
}

// 处理文件
function processFiles(files) {
  if (!files || files.length === 0) return;

  const validFiles = [];
  const invalidFiles = [];

  // 检查每个文件
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // 检查是否为音频文件
    if (isValidAudioFile(file)) {
      // 检查是否已存在相同文件
      const exists = AppState.selectedFiles.some(
        (existingFile) =>
          existingFile.name === file.name && existingFile.size === file.size
      );

      if (!exists) {
        validFiles.push(file);
      }
    } else {
      invalidFiles.push(file.name);
    }
  }

  // 添加有效文件到选择列表
  if (validFiles.length > 0) {
    AppState.selectedFiles = [...AppState.selectedFiles, ...validFiles];
    updateFileList();
    addListItemAnimation();
  }

  // 显示无效文件警告
  if (invalidFiles.length > 0) {
    const message = `以下${
      invalidFiles.length
    }个文件不是有效的音频文件: ${invalidFiles.join(", ")}`;
    showStatusMessage(message, "warning", 5000);
  }
}

// 检查是否为有效的音频文件
function isValidAudioFile(file) {
  console.log(`检测文件类型: ${file.name}, MIME: ${file.type || "未知"}`);

  // 检查文件类型（MIME类型）
  if (file.type) {
    const mimePattern = /audio\/(mpeg|mp3|wav|wave|flac|ogg|x-flac)/i;
    if (mimePattern.test(file.type)) {
      console.log(`文件 ${file.name} 的MIME类型验证通过: ${file.type}`);
      return true;
    }
  }

  // 检查文件扩展名 - 使用更宽松的检测方式
  const name = file.name.toLowerCase();
  const validExtensions = [".mp3", ".wav", ".flac", ".ogg"];

  for (const ext of validExtensions) {
    if (name.endsWith(ext)) {
      console.log(`文件 ${file.name} 的扩展名验证通过: ${ext}`);
      return true;
    }
  }

  console.warn(`文件 ${file.name} 未通过格式验证，不是有效的音频文件`);
  return false;
}

// 开始上传文件
async function startUpload() {
  if (AppState.selectedFiles.length === 0 || AppState.uploading) {
    return;
  }

  try {
    // 设置上传状态
    AppState.uploading = true;
    updateUploadButtons();
    addUploadButtonAnimation();

    // 重置进度条
    updateProgressBar(0);

    // 获取手动选择的目标组别
    const targetGroup = AppState.manualTargetGroup || AppState.currentGroup;

    // 验证目标组别是否有效
    if (!targetGroup || !AppState.groups[targetGroup]) {
      throw new Error("上传目标组别无效，请选择有效的组别");
    }

    console.log("上传组别信息:", {
      currentGroup: AppState.currentGroup,
      targetGroup: targetGroup,
      groupDetails: AppState.groups[targetGroup],
      manualTargetGroup: AppState.manualTargetGroup,
    });

    // 显示上传中消息
    showStatusMessage(
      `开始上传文件到 ${AppState.groups[targetGroup].name}...`,
      "info"
    );

    // 上传前检查
    try {
      // 测试表单数据提交 - 创建一个简单的测试表单
      const testFormData = new FormData();
      testFormData.append("group", targetGroup);
      testFormData.append("test", "value");

      console.log("测试表单数据提交...");
      const testResponse = await fetch("/api/test_form_data", {
        method: "POST",
        body: testFormData,
      });

      const testResult = await testResponse.json();
      console.log("表单数据测试结果:", testResult);

      if (!testResult.hasGroup) {
        console.warn("测试表单中的group参数未被正确解析，这可能影响上传");
      }
    } catch (testError) {
      console.warn("表单数据测试失败:", testError);
      // 继续尝试上传
    }

    // 检查组别是否有效
    if (!targetGroup || !AppState.groups[targetGroup]) {
      throw new Error("无效的上传目标组别");
    }

    // 检查上传组件状态
    const statusResponse = await fetch("/api/upload_status");
    const statusData = await statusResponse.json();

    if (!statusData.success || !statusData.uploaderReady) {
      throw new Error("上传组件未就绪，请联系管理员安装multer模块");
    }

    // 获取文件元数据
    const fileMetas = AppState.selectedFiles.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type || getMimeTypeFromExtension(file.name),
    }));

    // 首先检查文件是否已存在
    const existingFiles = await checkExistingFiles(targetGroup, fileMetas);

    if (existingFiles.length > 0) {
      const fileNames = existingFiles.join(", ");
      const confirmUpload = confirm(
        `以下文件已存在，确定要覆盖吗？\n${fileNames}`
      );

      if (!confirmUpload) {
        AppState.uploading = false;
        updateUploadButtons();
        showStatusMessage("上传已取消", "info");
        return;
      }
    }

    // 开始逐个上传文件
    for (let i = 0; i < AppState.selectedFiles.length; i++) {
      const file = AppState.selectedFiles[i];
      const progress = Math.round((i / AppState.selectedFiles.length) * 100);

      // 更新进度
      updateProgressBar(progress);

      console.log(
        `正在上传文件 ${i + 1}/${AppState.selectedFiles.length}: ${
          file.name
        } 到组别 ${targetGroup} (使用URL参数传递组别)`
      );

      try {
        // 使用手动选择的目标组别
        const result = await uploadFile(file, targetGroup);
        console.log(`文件 ${file.name} 上传结果:`, result);
      } catch (uploadError) {
        console.error(`文件 ${file.name} 上传失败:`, uploadError);
        throw uploadError; // 抛出错误以终止整个上传过程
      }
    }

    // 所有文件上传完成
    updateProgressBar(100);
    showUploadResult(true);

    // 刷新音乐列表
    await updateMusicsList(targetGroup);

    // 重新加载音乐数量
    await loadGroupMusicCounts();

    // 显示成功消息
    showStatusMessage(
      `成功上传 ${AppState.selectedFiles.length} 个文件`,
      "success"
    );

    // 清空文件列表
    clearFileList();
  } catch (error) {
    console.error("上传失败:", error);
    let errorMsg = error.message;

    // 提供更友好的错误信息
    if (errorMsg.includes("缺少group参数")) {
      errorMsg = "无法识别目标组别，请重新选择组别后再试";
    } else if (errorMsg.includes("400 Bad Request")) {
      errorMsg =
        "请求格式错误: " +
        (errorMsg.split("400 Bad Request")[1] || "请检查上传文件格式和大小");
    } else if (errorMsg.includes("500 Internal Server Error")) {
      errorMsg =
        "服务器错误：上传组件可能未正确安装。请联系管理员安装multer模块。";
    }

    showStatusMessage("上传失败: " + errorMsg, "error");
    showUploadResult(false);
  } finally {
    // 重置上传状态
    AppState.uploading = false;
    updateUploadButtons();
  }
}

// 根据文件扩展名获取MIME类型
function getMimeTypeFromExtension(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const mimeTypes = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    flac: "audio/flac",
    ogg: "audio/ogg",
  };

  return mimeTypes[ext] || "audio/mpeg";
}

/* =================================================================
 *  原 music_api.js
 * ================================================================= */

// 获取某个组别的音乐数量
async function getMusicCount(group) {
  try {
    const response = await fetch(
      `/api/music_count?group=${group}`
    );

    if (!response.ok) {
      throw new Error(`获取音乐数量失败 (${response.status})`);
    }

    const data = await response.json();
    return data.count || 0;
  } catch (error) {
    console.error(`获取 ${group} 音乐数量失败:`, error);
    return 0; // 出错时返回0
  }
}

// 检查文件是否已存在
async function checkExistingFiles(group, fileMetas) {
  try {
    // 使用手动选择的目标组别（如果有）
    const targetGroup = AppState.manualTargetGroup || group;

    const response = await fetch(
      "/api/check_music_files", // 修改为相对路径
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          group: targetGroup,
          files: fileMetas,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`检查文件失败 (${response.status})`);
    }

    const data = await response.json();
    return data.existingFiles || [];
  } catch (error) {
    console.error("检查文件是否存在失败:", error);
    throw error;
  }
}

// 上传单个音乐文件
async function uploadFile(file, group) {
  return new Promise((resolve, reject) => {
    // 使用手动选择的目标组别（如果有）
    const targetGroup = AppState.manualTargetGroup || group;

    // 检查并确保group参数有效
    if (!targetGroup) {
      console.error("上传文件时group参数无效:", targetGroup);
      return reject(new Error("无效的组别参数"));
    }

    console.log(`准备上传文件 ${file.name} 到组别 ${targetGroup}`);

    // 调试信息 - 检查文件类型和内容
    console.log(
      `上传文件信息: 名称=${file.name}, 类型=${file.type || "未知"}, 大小=${
        file.size
      }字节`
    );

    // 处理可能的空MIME类型问题
    if (!file.type) {
      // 尝试根据扩展名确定MIME类型
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      const mimeTypes = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
      };

      // 如果文件类型为空，手动设置一个合适的MIME类型
      // 注意：这不会改变原始文件对象，只是为FormData准备一个副本
      if (mimeTypes[ext]) {
        console.log(`文件MIME类型为空，根据扩展名设置为: ${mimeTypes[ext]}`);

        // 创建新的Blob对象，指定正确的MIME类型
        const fileBlob = file.slice(0, file.size, mimeTypes[ext]);
        // 创建File对象，保留原始文件名但设置正确的MIME类型
        file = new File([fileBlob], file.name, { type: mimeTypes[ext] });
      }
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("group", targetGroup);

    // 添加额外的信息用于调试
    formData.append("manual_selection", "true");

    // 调试信息 - 检查FormData是否包含所有字段
    const formDataEntries = [...formData.entries()];
    console.log(
      "FormData包含以下字段:",
      formDataEntries
        .map((entry) => `${entry[0]}=${entry[1].name || entry[1]}`)
        .join(", ")
    );

    const xhr = new XMLHttpRequest();

    // 监听上传进度
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const fileProgress = Math.round((event.loaded / event.total) * 100);
        console.log(`文件 ${file.name} 上传进度: ${fileProgress}%`);
      }
    });

    // 上传完成
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          console.log(`文件 ${file.name} 上传成功:`, response);
          resolve(response);
        } catch (e) {
          console.warn("解析响应失败，但视为上传成功", e);
          resolve({ success: true, message: "上传成功(无法解析响应)" });
        }
      } else {
        let errorMsg = `上传失败: ${xhr.status} ${xhr.statusText}`;

        try {
          // 尝试解析服务器返回的错误信息
          const response = JSON.parse(xhr.responseText);
          if (response && response.error) {
            errorMsg = response.error;
          }
        } catch (e) {
          console.warn("无法解析错误响应:", xhr.responseText.substring(0, 200));
        }

        console.error("上传文件失败:", errorMsg, "请求体:", {
          file: file.name,
          type: file.type,
          size: file.size,
          group: targetGroup,
        });
        reject(new Error(errorMsg));
      }
    });

    // 上传错误
    xhr.addEventListener("error", () => {
      console.error("网络错误，上传失败");
      reject(new Error("网络错误，上传失败"));
    });

    // 上传中断
    xhr.addEventListener("abort", () => {
      console.error("上传已取消");
      reject(new Error("上传已取消"));
    });

    // 开始上传 - 将group参数添加到URL查询参数中
    xhr.open(
      "POST",
      `/api/upload_music?group=${encodeURIComponent(targetGroup)}`
    );
    xhr.send(formData);
  });
}

// 更新音乐列表JSON文件
async function updateMusicsList(group) {
  try {
    const response = await fetch(
      "/api/update_music_list", // 修改为相对路径
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ group }),
      }
    );

    if (!response.ok) {
      throw new Error(`更新音乐列表失败 (${response.status})`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("更新音乐列表失败:", error);
    throw error;
  }
}

// 获取音乐文件列表
async function getMusicFiles(group) {
  try {
    const response = await fetch(`/api/music_files?group=${group}`);

    if (!response.ok) {
      throw new Error(`获取音乐文件列表失败: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("获取音乐文件列表失败:", error);
    return { success: false, error: error.message, files: [] };
  }
}

// 移动音乐文件到回收文件夹
async function moveToRecycle(group, filename) {
  try {
    const response = await fetch("/api/move_to_recycle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ group, filename }),
    });

    if (!response.ok) {
      throw new Error(`移动文件失败: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("移动文件到回收文件夹失败:", error);
    return { success: false, error: error.message };
  }
}

// 服务器API错误处理
function handleApiError(error, retryFn = null, retryCount = 0) {
  console.error("API错误:", error);

  // 如果是网络错误并且提供了重试函数，则尝试重试
  if (error.message.includes("网络") && retryFn && retryCount < 3) {
    console.log(`尝试重试 (${retryCount + 1}/3)...`);

    // 延迟重试，每次时间增加
    const delay = 1000 * Math.pow(2, retryCount);

    later(() => {
      retryFn(retryCount + 1);
    }, delay);

    return;
  }

  // 显示错误消息
  showStatusMessage(`操作失败: ${error.message}`, "error");
}

// P5a：window.moveFileToRecycle 全局桥已随 inline onclick 移除而删除 —— 唯一消费方
// 是模板里的内联 onclick，现由容器级事件委托直接调用本模块内同名函数，语义不变
//（同参 filename、同一确认弹窗与 /api/move_to_recycle 调用链）。

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用）
 * ================================================================= */
function cleanupMusicImportPage(bindAbort) {
  // signal 登记的静态骨架监听（按钮/拖放/文件选择）统一解绑
  if (bindAbort) bindAbort.abort();

  // 一次性定时器（状态消息隐去 / 进度条隐藏）：清空在飞任务，避免 teardown 后回调仍在飞
  // （P12：弹窗节点/监听/动画归 confirm-dialog 组件实例，由组件 cleanup 自行回收）
  timers.dispose();

  // 上传中重置上传状态（进行中的 XHR 与迁移前页面跳转语义一致：不强行中断）
  AppState.uploading = false;
}
