/**
 * 音乐导入功能 - API交互模块
 * 处理与服务器的数据交互
 */

// 获取某个组别的音乐数量
async function getMusicCount(group) {
  try {
    const response = await fetch(
      `http://localhost:3000/api/music_count?group=${group}`
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

    setTimeout(() => {
      retryFn(retryCount + 1);
    }, delay);

    return;
  }

  // 显示错误消息
  showStatusMessage(`操作失败: ${error.message}`, "error");
}

// 添加一个事件监听器，用于设置页面中的跳转按钮
document.addEventListener("DOMContentLoaded", () => {
  // 使用代理模式确保即使在setting.html页面也能找到按钮
  document.body.addEventListener("click", (event) => {
    // 如果点击的是音乐导入跳转按钮
    if (event.target.id === "goto-music-import-btn") {
      window.location.href = "../html/musics_settings.html";
    }
  });
});
