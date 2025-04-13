/**
 * 定时搬化棒 - 设置页面逻辑
 */

// 当页面加载完成后执行
document.addEventListener("DOMContentLoaded", () => {
  // 获取表单元素
  const settingsForm = document.getElementById("settings-form");
  const timeSettingInput = document.getElementById("time-setting");
  const opacitySettingInput = document.getElementById("opacity-setting");
  const opacityValue = document.getElementById("opacity-value");
  const resetDefaultBtn = document.getElementById("reset-default-btn");
  const backToGameBtn = document.getElementById("back-to-game-btn");
  const backBtn = document.getElementById("back-btn");
  const homeBtn = document.getElementById("home-btn");

  // 默认设置
  const defaultSettings = {
    timeLimit: 60,
    interfaceOpacity: 0.8,
  };

  // 实时更新透明度显示
  opacitySettingInput.addEventListener("input", () => {
    const value = parseFloat(opacitySettingInput.value);
    const percentage = Math.round(value * 100);
    opacityValue.textContent = `${percentage}%`;
  });

  // 加载当前设置并填充表单
  loadCurrentSettings();

  // 处理表单提交
  settingsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveSettings();
  });

  // 处理重置默认按钮点击
  resetDefaultBtn.addEventListener("click", () => {
    resetToDefaultSettings();
  });

  // 处理返回游戏按钮点击
  backToGameBtn.addEventListener("click", () => {
    window.location.href = "moving_sth_in_times.html";
  });

  // 处理返回游戏中心按钮点击
  backBtn.addEventListener("click", () => {
    window.location.href = "../games_select.html";
  });

  // 处理返回主页按钮点击
  homeBtn.addEventListener("click", () => {
    window.location.href = "../index.html";
  });

  // 显示通知提示
  function showNotification(message, type = "success") {
    const notificationElement = document.createElement("div");
    notificationElement.className = `notification ${type}`;
    notificationElement.textContent = message;

    // 移除已有的通知
    const existingNotifications = document.querySelectorAll(".notification");
    existingNotifications.forEach((notification) => {
      document.body.removeChild(notification);
    });

    document.body.appendChild(notificationElement);

    setTimeout(() => {
      notificationElement.classList.add("show");
    }, 50);

    setTimeout(() => {
      notificationElement.classList.remove("show");
      setTimeout(() => {
        if (document.body.contains(notificationElement)) {
          document.body.removeChild(notificationElement);
        }
      }, 500);
    }, 3000);
  }

  // 显示确认对话框
  function showConfirmDialog(message, onConfirm, onCancel) {
    const dialogOverlay = document.createElement("div");
    dialogOverlay.className = "dialog-overlay";

    const dialogContainer = document.createElement("div");
    dialogContainer.className = "dialog-container";

    const dialogContent = document.createElement("div");
    dialogContent.className = "dialog-content";
    dialogContent.textContent = message;

    const buttonContainer = document.createElement("div");
    buttonContainer.className = "dialog-buttons";

    const confirmButton = document.createElement("button");
    confirmButton.className = "dialog-confirm";
    confirmButton.textContent = "确认";
    confirmButton.addEventListener("click", () => {
      document.body.removeChild(dialogOverlay);
      if (onConfirm) onConfirm();
    });

    const cancelButton = document.createElement("button");
    cancelButton.className = "dialog-cancel";
    cancelButton.textContent = "取消";
    cancelButton.addEventListener("click", () => {
      document.body.removeChild(dialogOverlay);
      if (onCancel) onCancel();
    });

    buttonContainer.appendChild(confirmButton);
    buttonContainer.appendChild(cancelButton);

    dialogContainer.appendChild(dialogContent);
    dialogContainer.appendChild(buttonContainer);

    dialogOverlay.appendChild(dialogContainer);
    document.body.appendChild(dialogOverlay);
  }

  // 加载当前设置
  async function loadCurrentSettings() {
    try {
      const settings = await fetch(
        "http://localhost:3000/api/settings/moving-sth"
      )
        .then((response) => {
          if (!response.ok) throw new Error("无法加载设置");
          return response.json();
        })
        .catch(() => {
          const localSettings = localStorage.getItem("movingSthSettings");
          if (localSettings) {
            return JSON.parse(localSettings);
          }
          return defaultSettings;
        });

      // 填充表单
      timeSettingInput.value = settings.timeLimit || defaultSettings.timeLimit;

      // 设置透明度滑块值
      const opacity =
        settings.interfaceOpacity !== undefined
          ? settings.interfaceOpacity
          : defaultSettings.interfaceOpacity;
      opacitySettingInput.value = opacity;
      // 更新显示百分比
      const percentage = Math.round(opacity * 100);
      opacityValue.textContent = `${percentage}%`;
    } catch (error) {
      console.error("加载设置失败:", error);
      showNotification("加载设置失败，使用默认设置", "error");
      resetToDefaultSettings();
    }
  }

  // 保存设置
  async function saveSettings() {
    try {
      const timeLimit = parseInt(timeSettingInput.value, 10);
      const interfaceOpacity = parseFloat(opacitySettingInput.value);

      if (isNaN(timeLimit) || timeLimit < 1 || timeLimit > 300) {
        showNotification("时间限制必须在1-300秒之间", "error");
        return;
      }

      if (
        isNaN(interfaceOpacity) ||
        interfaceOpacity < 0.1 ||
        interfaceOpacity > 1.0
      ) {
        showNotification("透明度设置无效", "error");
        return;
      }

      const settings = {
        timeLimit,
        interfaceOpacity,
      };

      // 保存到本地
      localStorage.setItem("movingSthSettings", JSON.stringify(settings));

      // 添加表单保存动画效果
      settingsForm
        .closest(".settings-container")
        .classList.add("settings-saved");
      setTimeout(() => {
        settingsForm
          .closest(".settings-container")
          .classList.remove("settings-saved");
      }, 1000);

      // 尝试保存到服务器
      try {
        const response = await fetch(
          "http://localhost:3000/api/settings/moving-sth",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(settings),
          }
        );

        if (!response.ok) {
          throw new Error("保存到服务器失败");
        }
      } catch (error) {
        console.log("保存到服务器失败，但已保存到本地:", error);
        showNotification("已保存到本地，但服务器保存失败", "warning");
        return;
      }

      showNotification("设置已保存", "success");
    } catch (error) {
      console.error("保存设置失败:", error);
      showNotification("保存设置失败", "error");
    }
  }

  // 重置为默认设置
  function resetToDefaultSettings() {
    showConfirmDialog("确定要重置为默认设置吗？", () => {
      timeSettingInput.value = defaultSettings.timeLimit;
      opacitySettingInput.value = defaultSettings.interfaceOpacity;
      // 更新显示的百分比
      const percentage = Math.round(defaultSettings.interfaceOpacity * 100);
      opacityValue.textContent = `${percentage}%`;

      showNotification("已重置为默认设置", "info");
    });
  }
});
