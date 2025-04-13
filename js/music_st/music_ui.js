/**
 * 音乐导入功能 - UI交互模块
 * 处理界面更新和交互效果
 */

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
  setTimeout(() => {
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
    setTimeout(() => {
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
  setTimeout(() => {
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

  // 渲染音乐文件列表
  container.innerHTML = AppState.musicFiles
    .map(
      (file, index) => `
    <tr data-filename="${file.name}">
      <td>${index + 1}</td>
      <td title="${file.name}">${file.name}</td>
      <td>
        <button class="move-to-recycle-btn" onclick="moveFileToRecycle('${
          file.name
        }')">
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

// 显示自定义确认对话框
function showConfirmDialog(message, onConfirm, onCancel) {
  // 移除可能已存在的对话框
  const existingDialog = document.querySelector(".confirm-dialog-container");
  if (existingDialog) {
    document.body.removeChild(existingDialog);
  }

  // 创建对话框容器
  const dialogContainer = document.createElement("div");
  dialogContainer.className = "confirm-dialog-container";

  // 创建遮罩层
  const overlay = document.createElement("div");
  overlay.className = "confirm-dialog-overlay";

  // 创建对话框内容
  const dialog = document.createElement("div");
  dialog.className = "confirm-dialog";

  // 创建标题
  const title = document.createElement("h3");
  title.className = "confirm-dialog-title";
  title.textContent = "确认操作";

  // 创建消息内容
  const content = document.createElement("p");
  content.className = "confirm-dialog-message";
  content.textContent = message;

  // 创建按钮容器
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "confirm-dialog-buttons";

  // 确认按钮
  const confirmBtn = document.createElement("button");
  confirmBtn.className = "confirm-btn primary-btn";
  confirmBtn.textContent = "确认";
  confirmBtn.addEventListener("click", () => {
    closeDialog();
    if (typeof onConfirm === "function") {
      onConfirm();
    }
  });

  // 取消按钮
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "cancel-btn secondary-btn";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", () => {
    closeDialog();
    if (typeof onCancel === "function") {
      onCancel();
    }
  });

  // 组装对话框
  buttonContainer.appendChild(confirmBtn);
  buttonContainer.appendChild(cancelBtn);
  dialog.appendChild(title);
  dialog.appendChild(content);
  dialog.appendChild(buttonContainer);
  dialogContainer.appendChild(overlay);
  dialogContainer.appendChild(dialog);

  // 添加到页面
  document.body.appendChild(dialogContainer);

  // 添加淡入效果
  setTimeout(() => {
    dialogContainer.classList.add("visible");
    dialog.classList.add("visible");
  }, 10);

  // 点击遮罩层关闭对话框
  overlay.addEventListener("click", () => {
    closeDialog();
    if (typeof onCancel === "function") {
      onCancel();
    }
  });

  // 关闭对话框函数
  function closeDialog() {
    dialogContainer.classList.remove("visible");
    dialog.classList.remove("visible");

    // 动画结束后移除DOM
    setTimeout(() => {
      if (document.body.contains(dialogContainer)) {
        document.body.removeChild(dialogContainer);
      }
    }, 300);
  }
}

// 导出全局函数
window.moveFileToRecycle = moveFileToRecycle;
