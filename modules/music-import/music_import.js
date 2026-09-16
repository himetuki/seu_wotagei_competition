/**
 * 音乐导入功能 - 导入处理模块
 * 处理文件选择和上传逻辑
 */

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
