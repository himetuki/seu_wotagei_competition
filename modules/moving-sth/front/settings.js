/**
 * 定时搬化棒 — 设置页面前端组件（P4 迁移，原 moving_sth_settings.js 整体迁入）
 *
 * 形态适配说明（逻辑逐行保留）：
 *   - 原 DOMContentLoaded 包裹已去除，改为 initMovingSthSettings()（kernel render 时调用）
 *   - 原脚本顶层的 DOM 元素获取移入 init（调用时 DOM 早已就绪）
 *   - 静态骨架监听一律经 AbortController signal 登记（P3 定稿约定）
 *   - cleanup：abort 解绑 + 未关闭确认对话框移除（本页无 interval/rAF/audio）
 */

// 组件入口（原 DOMContentLoaded 初始化，kernel render 时执行）
export function initMovingSthSettings() {
  // cleanup 契约：静态骨架监听经 signal 登记，重渲染时 abort 统一解绑
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

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
  }, { signal });

  // 加载当前设置并填充表单
  loadCurrentSettings();

  // 处理表单提交
  settingsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveSettings();
  }, { signal });

  // 处理重置默认按钮点击
  resetDefaultBtn.addEventListener("click", () => {
    resetToDefaultSettings();
  }, { signal });

  // 处理返回游戏按钮点击
  backToGameBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  }, { signal });

  // 处理返回游戏中心按钮点击
  backBtn.addEventListener("click", () => {
    window.location.href = "/m/games";
  }, { signal });

  // 处理返回主页按钮点击
  homeBtn.addEventListener("click", () => {
    window.location.href = "/m/home";
  }, { signal });

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
        "/api/settings/moving-sth"
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
          "/api/settings/moving-sth",
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

  return () => cleanupMovingSthSettings(bindAbort);
}

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用）
 * ================================================================= */
function cleanupMovingSthSettings(bindAbort) {
  // signal 登记的静态骨架监听统一解绑
  if (bindAbort) bindAbort.abort();

  // 移除未关闭的确认对话框
  const dialogContainer = document.querySelector(".dialog-container");
  if (dialogContainer && dialogContainer.parentNode) {
    dialogContainer.parentNode.removeChild(dialogContainer);
  }
}
