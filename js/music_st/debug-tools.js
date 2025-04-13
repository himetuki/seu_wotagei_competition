/**
 * 音乐上传调试工具
 * 用于测试文件上传功能和文件类型检测
 */

// 测试单个文件上传
async function testFileUpload(file) {
  console.log("开始测试文件上传:", file.name);

  try {
    // 创建FormData对象
    const formData = new FormData();
    formData.append("file", file);
    formData.append("test", "true");

    // 显示FormData内容
    console.log(
      "FormData内容:",
      [...formData.entries()].map(
        (entry) =>
          `${entry[0]}=${entry[1] instanceof File ? entry[1].name : entry[1]}`
      )
    );

    // 发送测试请求
    const response = await fetch("/api/test_audio_upload", {
      method: "POST",
      body: formData,
    });

    // 解析响应
    const result = await response.json();
    console.log("测试上传结果:", result);

    return {
      success: result.success,
      details: result,
    };
  } catch (error) {
    console.error("测试上传失败:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// 获取文件MIME类型
function getFileMimeType(file) {
  return new Promise((resolve) => {
    // 使用FileReader读取文件前几个字节来确定文件类型
    const reader = new FileReader();
    reader.onload = function (e) {
      const arr = new Uint8Array(e.target.result).subarray(0, 4);
      let header = "";
      for (let i = 0; i < arr.length; i++) {
        header += arr[i].toString(16);
      }

      console.log(`文件 ${file.name} 的头部字节: ${header}`);

      // 根据文件头判断实际MIME类型
      let type = "未知";
      if (header.startsWith("4944330")) type = "audio/mpeg"; // ID3 tag, MP3
      else if (header.startsWith("fffb") || header.startsWith("fff3"))
        type = "audio/mpeg"; // MP3
      else if (header.startsWith("52494646")) type = "audio/wav"; // RIFF, WAV
      else if (header.startsWith("664c6143")) type = "audio/flac"; // fLaC, FLAC
      else if (header.startsWith("4f676753")) type = "audio/ogg"; // OggS, OGG

      resolve({
        reportedType: file.type,
        detectedType: type,
        match: file.type === type || file.type.includes(type),
      });
    };
    reader.readAsArrayBuffer(file.slice(0, 4));
  });
}

// 测试获取上传目标组别
async function testGetUploadTarget() {
  console.log("测试获取上传目标组别:");
  console.log("- 当前组别:", AppState.currentGroup);
  console.log("- 手动选择组别:", AppState.manualTargetGroup);

  const targetSelect = document.getElementById("upload-target-group");
  if (targetSelect) {
    console.log("- 下拉菜单选择值:", targetSelect.value);
  } else {
    console.log("- 下拉菜单元素不存在");
  }

  // 测试FormData传递组别参数
  try {
    const formData = new FormData();
    formData.append("test", "value");
    formData.append(
      "group",
      AppState.manualTargetGroup || AppState.currentGroup
    );

    console.log(
      "测试FormData:",
      [...formData.entries()]
        .map((entry) => `${entry[0]}=${entry[1]}`)
        .join(", ")
    );

    const response = await fetch("/api/test_form_data", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();
    console.log("FormData传参测试结果:", result);

    return {
      success: true,
      details: {
        currentGroup: AppState.currentGroup,
        manualTargetGroup: AppState.manualTargetGroup,
        selectValue: targetSelect ? targetSelect.value : undefined,
        serverResult: result,
      },
    };
  } catch (error) {
    console.error("测试失败:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// 添加到全局以便从控制台调用
window.musicDebug = {
  testFileUpload,
  getFileMimeType,
  testGetUploadTarget,
};

// 在页面加载时显示调试说明
console.log(
  "音乐上传调试工具已加载。可以使用以下方法测试:\n" +
    "- musicDebug.testFileUpload(file): 测试文件上传\n" +
    "- musicDebug.getFileMimeType(file): 检测文件MIME类型\n" +
    "- musicDebug.testGetUploadTarget(): 测试获取上传目标组别\n" +
    "例如: 选择一个文件后，使用 musicDebug.testFileUpload(document.querySelector('#file-input').files[0])"
);
