/**
 * 体态传技 - 设置页面
 * 处理技能列表的编辑和保存
 */

// DOM元素缓存
const DOM = {
  trickList: document.getElementById("trick-list"),
  trickForm: document.getElementById("trick-form"),
  trickName: document.getElementById("trick-name"),
  // 移除 addTrickBtn 引用
  saveTricksBtn: document.getElementById("save-tricks-btn"),
  saveTrickEdit: document.getElementById("save-trick-edit"),
  cancelTrickEdit: document.getElementById("cancel-trick-edit"),
  statusMessage: document.getElementById("status-message"),
  backBtn: document.getElementById("back-btn"),
  homeBtn: document.getElementById("home-btn"),
  bpmSetting: document.getElementById("bpm-setting"),
  bpmValue: document.getElementById("bpm-value"),
  saveSettingsBtn: document.getElementById("save-settings-btn"),
  testMetronomeBtn: document.getElementById("test-metronome-btn"),
  stopMetronomeBtn: document.getElementById("stop-metronome-btn"),
};

// 全局状态
const State = {
  trickData: [],
  isEditing: false,
  editingItemId: null,
  hasChanges: false,
  settings: {
    beatsPerMinute: 120, // 默认BPM值
  },
  metronomeTest: {
    isPlaying: false,
    audioContext: null,
    interval: null,
    beatCount: 0,
  },
};

// 页面加载完成时初始化
document.addEventListener("DOMContentLoaded", function () {
  // 加载技能数据
  loadTrickData();

  // 加载设置数据
  loadSettingsData();

  // 绑定事件
  bindEvents();

  // 重置修改状态
  State.hasChanges = false;

  // 添加BPM滑动条监听器，修改为值变化后自动保存
  if (DOM.bpmSetting) {
    DOM.bpmSetting.addEventListener("input", function () {
      updateBpmValueDisplay(this.value);
    });

    // 添加change事件，当用户完成拖动后自动保存
    DOM.bpmSetting.addEventListener("change", function () {
      // 如果有变化，则自动保存
      if (State.hasChanges) {
        saveSettings();
      }
    });
  }

  // 试听节拍器按钮
  if (DOM.testMetronomeBtn) {
    DOM.testMetronomeBtn.addEventListener("click", function () {
      toggleMetronomeTest();
      addButtonClickEffect(this);
    });
  }

  // 停止试听按钮
  if (DOM.stopMetronomeBtn) {
    DOM.stopMetronomeBtn.addEventListener("click", function () {
      stopMetronomeTest();
      addButtonClickEffect(this);
    });
  }
});

// 绑定事件处理函数
function bindEvents() {
  // 删除添加技能按钮的事件监听

  // 保存所有技能按钮
  DOM.saveTricksBtn.addEventListener("click", function () {
    saveTrickData();
    addButtonClickEffect(this);
  });

  // 技能表单提交
  DOM.trickForm.addEventListener("submit", function (e) {
    e.preventDefault();
    handleTrickFormSubmit();
  });

  // 取消编辑按钮
  DOM.cancelTrickEdit.addEventListener("click", function () {
    resetTrickForm();
    addButtonClickEffect(this);
  });

  // 导航按钮 - 直接跳转，需要确认对话框
  DOM.backBtn.addEventListener("click", function () {
    if (State.hasChanges) {
      createSimpleConfirmDialog(
        "您有未保存的更改，确定要离开吗？",
        function () {
          window.location.href = "movement_without_hands.html";
        }
      );
    } else {
      window.location.href = "movement_without_hands.html";
    }
  });

  DOM.homeBtn.addEventListener("click", function () {
    if (State.hasChanges) {
      createSimpleConfirmDialog(
        "您有未保存的更改，确定要离开吗？",
        function () {
          window.location.href = "../index.html";
        }
      );
    } else {
      window.location.href = "../index.html";
    }
  });

  // 为所有按钮添加悬停动画
  addButtonHoverEffects();
}

// 新的简单确认对话框实现，使用CSS类而不是内联样式
function createSimpleConfirmDialog(message, confirmCallback) {
  // 删除之前的对话框
  const oldDialog = document.getElementById("confirmDialog");
  if (oldDialog) {
    document.body.removeChild(oldDialog);
  }

  // 创建对话框容器
  const dialog = document.createElement("div");
  dialog.id = "confirmDialog";

  // 创建对话框内容
  const content = document.createElement("div");
  content.className = "dialog-content";

  // 添加消息
  const messageElement = document.createElement("p");
  messageElement.textContent = message;
  content.appendChild(messageElement);

  // 创建按钮容器
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "button-container";

  // 确认按钮
  const confirmButton = document.createElement("button");
  confirmButton.textContent = "确认";
  confirmButton.className = "confirm-btn";
  confirmButton.onclick = function () {
    document.body.removeChild(dialog);
    if (confirmCallback) confirmCallback();
  };

  // 取消按钮
  const cancelButton = document.createElement("button");
  cancelButton.textContent = "取消";
  cancelButton.className = "cancel-btn";
  cancelButton.onclick = function () {
    document.body.removeChild(dialog);
  };

  // 添加按钮到容器
  buttonContainer.appendChild(confirmButton);
  buttonContainer.appendChild(cancelButton);
  content.appendChild(buttonContainer);

  // 添加内容到对话框
  dialog.appendChild(content);

  // 添加对话框到文档
  document.body.appendChild(dialog);
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
  confirmBtn.className = "dialog-btn confirm-btn pulse-effect";
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
  document.body.appendChild(dialogContainer);

  // 添加CSS样式（如果需要）
  addDialogStyles();
}

// 添加对话框所需的CSS样式
function addDialogStyles() {
  if (document.getElementById("dialog-styles")) return;

  const style = document.createElement("style");
  style.id = "dialog-styles";
  style.textContent = `
    .dialog-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .dialog-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
    }
    .custom-dialog {
      background-color: #2a2a3a;
      border-radius: 10px;
      padding: 20px;
      min-width: 300px;
      max-width: 80%;
      box-shadow: 0 0 20px rgba(100, 100, 255, 0.4);
      position: relative;
      z-index: 1001;
      text-align: center;
    }
    .dialog-buttons {
      display: flex;
      justify-content: center;
      gap: 15px;
      margin-top: 20px;
    }
    .dialog-btn {
      padding: 8px 20px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.2s;
    }
    .confirm-btn {
      background-color: rgba(70, 100, 180, 0.8);
      color: white;
    }
    .confirm-btn:hover {
      background-color: rgba(90, 120, 220, 0.9);
      transform: translateY(-2px);
    }
    .cancel-btn {
      background-color: rgba(80, 80, 100, 0.8);
      color: white;
    }
    .cancel-btn:hover {
      background-color: rgba(100, 100, 120, 0.9);
      transform: translateY(-2px);
    }
    .pulse-effect {
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(70, 100, 180, 0.4); }
      70% { box-shadow: 0 0 0 10px rgba(70, 100, 180, 0); }
      100% { box-shadow: 0 0 0 0 rgba(70, 100, 180, 0); }
    }
  `;

  document.head.appendChild(style);
}

// 为所有按钮添加悬停动画
function addButtonHoverEffects() {
  const buttons = document.querySelectorAll("button:not(.dialog-btn)");
  buttons.forEach((button) => {
    button.classList.add("hover-glow");
  });
}

// 加载技能数据
async function loadTrickData() {
  showStatusMessage("正在加载技能数据...", "info");

  try {
    const response = await fetch("../../resource/json/tricks_for_game.json");

    if (!response.ok) {
      throw new Error(`获取技能数据失败: ${response.status}`);
    }

    const data = await response.json();

    // 格式化数据
    State.trickData = Array.isArray(data) ? data : [];

    // 确保技能数据结构一致
    State.trickData = State.trickData
      .map((trick) => {
        if (typeof trick === "string") {
          return { name: trick };
        } else if (typeof trick === "object") {
          return { name: trick.name || "未命名技能" };
        }
        return null;
      })
      .filter((trick) => trick !== null);

    // 渲染列表
    renderTrickList();

    // 重置表单
    resetTrickForm();

    showStatusMessage("技能数据加载成功", "success");
  } catch (error) {
    console.error("加载技能数据失败:", error);
    showStatusMessage(`加载技能数据失败: ${error.message}`, "error");
  }
}

// 渲染技能列表
function renderTrickList() {
  if (!State.trickData || State.trickData.length === 0) {
    DOM.trickList.innerHTML = '<li class="empty">暂无技能数据</li>';
    return;
  }

  DOM.trickList.innerHTML = "";

  State.trickData.forEach((trick, index) => {
    const li = document.createElement("li");
    li.dataset.index = index;
    li.innerHTML = `
      <span class="item-name">${trick.name}</span>
      <div class="item-actions">
        <button class="edit-btn" title="编辑">✏️</button>
        <button class="delete-btn" title="删除">🗑️</button>
      </div>
    `;

    // 编辑按钮事件
    li.querySelector(".edit-btn").addEventListener("click", () => {
      editTrick(index);
    });

    // 删除按钮事件
    li.querySelector(".delete-btn").addEventListener("click", () => {
      deleteTrick(index);
    });

    DOM.trickList.appendChild(li);
  });
}

// 编辑技能
function editTrick(index) {
  const trick = State.trickData[index];
  if (trick) {
    State.isEditing = true;
    State.editingItemId = index;

    DOM.trickName.value = trick.name || "";

    // 显示正在编辑的状态
    showStatusMessage(`正在编辑技能: ${trick.name}`, "info");
  }
}

// 删除技能
function deleteTrick(index) {
  createSimpleConfirmDialog("确定要删除这个技能吗？", function () {
    State.trickData.splice(index, 1);
    renderTrickList();
    State.hasChanges = true;
    showStatusMessage("技能已删除，点击保存以提交更改", "info");
  });
}

// 处理技能表单提交
function handleTrickFormSubmit() {
  const name = DOM.trickName.value.trim();

  if (!name) {
    showStatusMessage("技能名称不能为空", "error");
    return;
  }

  if (State.isEditing && State.editingItemId !== null) {
    // 更新已有技能
    State.trickData[State.editingItemId].name = name;
  } else {
    // 添加新技能
    State.trickData.push({ name });
  }

  renderTrickList();
  resetTrickForm();
  State.hasChanges = true;
  showStatusMessage("技能已更新，点击保存以提交更改", "info");
}

// 重置技能表单
function resetTrickForm() {
  DOM.trickForm.reset();
  State.isEditing = false;
  State.editingItemId = null;
}

// 保存技能数据
async function saveTrickData() {
  if (!State.hasChanges) {
    showStatusMessage("没有需要保存的更改", "info");
    return;
  }

  showStatusMessage("正在保存技能数据...", "info");

  try {
    // 准备保存的数据格式
    const dataToSave = State.trickData.map((trick) => ({ name: trick.name }));

    // 发送请求
    const response = await fetch("http://localhost:3000/api/tricks_for_game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dataToSave),
    });

    if (!response.ok) {
      throw new Error(`保存失败: ${response.status}`);
    }

    State.hasChanges = false;
    showStatusMessage("技能数据保存成功", "success");
  } catch (error) {
    console.error("保存技能数据失败:", error);
    showStatusMessage(`保存失败: ${error.message}`, "error");
  }
}

// 显示状态消息
function showStatusMessage(message, type = "info") {
  DOM.statusMessage.textContent = message;
  DOM.statusMessage.className = "status-message";
  DOM.statusMessage.classList.add(type);
  DOM.statusMessage.classList.add("visible");

  // 自动清除成功和信息消息
  if (type === "success" || type === "info") {
    setTimeout(() => {
      DOM.statusMessage.classList.remove("visible");
    }, 3000);
  }
}

// 更新BPM显示值
function updateBpmValueDisplay(value) {
  if (DOM.bpmValue) {
    // 先保存原始值以检查是否有实际更改
    const oldValue = State.settings.beatsPerMinute;

    // 更新值
    DOM.bpmValue.textContent = value;
    State.settings.beatsPerMinute = parseInt(value);

    // 只有当值实际改变时才标记为有更改
    if (oldValue !== parseInt(value)) {
      State.hasChanges = true;
      console.log("BPM已更改为:", State.settings.beatsPerMinute);
    }

    // 如果正在试听,更新节拍速度
    if (State.metronomeTest.isPlaying) {
      restartMetronomeTest();
    }
  }
}

// 确保页面初始化时从JSON文件加载设置
document.addEventListener("DOMContentLoaded", async function () {
  try {
    // 直接从json文件加载设置
    const response = await fetch("../../resource/json/game_2_settings.json");
    if (response.ok) {
      const settings = await response.json();
      if (settings && settings.beatsPerMinute) {
        State.settings.beatsPerMinute = parseInt(settings.beatsPerMinute);
        console.log("从JSON文件加载BPM设置:", State.settings.beatsPerMinute);

        // 更新UI显示
        if (DOM.bpmSetting) {
          DOM.bpmSetting.value = State.settings.beatsPerMinute;
          DOM.bpmValue.textContent = State.settings.beatsPerMinute;
        }
      }
    }
  } catch (error) {
    console.error("直接从JSON文件加载设置失败:", error);
  }
});

// 加载设置数据
async function loadSettingsData() {
  try {
    // 如果GameData已定义且包含settings，则使用它
    if (window.GameData && GameData.settings) {
      State.settings = { ...State.settings, ...GameData.settings };
      console.log("从GameData加载设置:", State.settings);
    } else {
      // 否则调用API加载
      const settings = await loadGameSettings();
      if (settings) {
        State.settings = { ...State.settings, ...settings };
        console.log("从API加载设置:", State.settings);
      }
    }

    // 更新UI显示
    if (DOM.bpmSetting) {
      DOM.bpmSetting.value = State.settings.beatsPerMinute;
      updateBpmValueDisplay(State.settings.beatsPerMinute);
    }

    // 重置更改标志，因为初始加载不算更改
    State.hasChanges = false;

    console.log("设置数据加载成功:", State.settings);
  } catch (error) {
    console.error("加载设置数据失败:", error);
    showStatusMessage("加载设置数据失败", "error");
  }
}

// 保存设置
async function saveSettings() {
  try {
    if (!State.hasChanges) {
      showStatusMessage("没有需要保存的设置更改", "info");
      return;
    }

    showStatusMessage("正在保存设置...", "info");
    console.log("准备保存设置:", State.settings);

    // 保存设置到服务器
    const success = await saveGameSettings(State.settings);

    if (success) {
      State.hasChanges = false;
      showStatusMessage("设置保存成功", "success");

      // 给设置面板一个保存成功的动画效果
      const settingsPanel = document.querySelector(".settings-panel");
      if (settingsPanel) {
        settingsPanel.classList.add("settings-saved");
        setTimeout(() => {
          settingsPanel.classList.remove("settings-saved");
        }, 1000);
      }

      // 如果window.GameData存在，更新其settings
      if (window.GameData) {
        window.GameData.settings = {
          ...window.GameData.settings,
          ...State.settings,
        };
        console.log("已更新GameData中的设置:", window.GameData.settings);
      }
    } else {
      throw new Error("设置保存失败");
    }
  } catch (error) {
    console.error("保存设置失败:", error);
    showStatusMessage(`保存设置失败: ${error.message}`, "error");
  }
}

// 切换节拍器试听状态
function toggleMetronomeTest() {
  if (State.metronomeTest.isPlaying) {
    stopMetronomeTest();
  } else {
    startMetronomeTest();
  }
}

// 开始节拍器试听
function startMetronomeTest() {
  // 如果已经在播放中,先停止
  if (State.metronomeTest.isPlaying) {
    stopMetronomeTest();
  }

  // 初始化音频上下文
  if (!State.metronomeTest.audioContext) {
    try {
      State.metronomeTest.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
    } catch (error) {
      console.error("无法创建音频上下文:", error);
      showStatusMessage("您的浏览器不支持节拍器功能", "error");
      return;
    }
  }

  // 获取当前BPM值
  const bpm = State.settings.beatsPerMinute;

  // 计算每拍间隔(毫秒)
  const beatInterval = 60000 / bpm;

  // 重置节拍计数器
  State.metronomeTest.beatCount = 0;

  // 创建节拍器间隔
  State.metronomeTest.interval = setInterval(() => {
    // 确定当前拍子类型(第4拍是重拍)
    const beatCount = State.metronomeTest.beatCount % 4;
    const beatType = beatCount === 3 ? "heavy" : "light";

    // 播放节拍音效
    playTestBeat(beatType);

    // 显示视觉反馈
    highlightBeat(beatCount);

    // 递增拍子计数
    State.metronomeTest.beatCount++;
  }, beatInterval);

  // 更新状态和UI
  State.metronomeTest.isPlaying = true;
  DOM.testMetronomeBtn.disabled = true;
  DOM.stopMetronomeBtn.disabled = false;

  showStatusMessage(`正在试听 ${bpm} BPM 的节拍器`, "info");
}

// 停止节拍器试听
function stopMetronomeTest() {
  if (State.metronomeTest.interval) {
    clearInterval(State.metronomeTest.interval);
    State.metronomeTest.interval = null;
  }

  // 重置拍子高亮显示
  resetBeatsHighlight();

  // 更新状态和UI
  State.metronomeTest.isPlaying = false;
  DOM.testMetronomeBtn.disabled = false;
  DOM.stopMetronomeBtn.disabled = true;
}

// 重启节拍器试听(用于BPM值变化时)
function restartMetronomeTest() {
  if (State.metronomeTest.isPlaying) {
    stopMetronomeTest();
    startMetronomeTest();
  }
}

// 播放测试节拍音效
function playTestBeat(type = "light") {
  const audioCtx = State.metronomeTest.audioContext;
  if (!audioCtx) return;

  // 定义拍子频率
  const beatsFreq = {
    light: 880, // A5音
    heavy: 587.33, // D5音
  };

  // 创建振荡器
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  // 设置方波音色(8bit风格)
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(beatsFreq[type], audioCtx.currentTime);

  // 音量设置(重拍更响)
  const volume = type === "heavy" ? 0.3 : 0.2;
  // 音量衰减
  gainNode.gain.exponentialRampToValueAtTime(
    0.01,
    audioCtx.currentTime + (type === "heavy" ? 0.3 : 0.15)
  );

  // 连接节点
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  // 开始和结束
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + (type === "heavy" ? 0.3 : 0.15));
}

// 显示节拍高亮效果
function highlightBeat(beatIndex) {
  // 重置所有拍子显示
  resetBeatsHighlight();

  // 获取所有拍子元素
  const beats = document.querySelectorAll(".metronome-pattern .beat");

  // 如果拍子元素存在,高亮当前拍子
  if (beats && beats.length > beatIndex) {
    beats[beatIndex].classList.add("active");
  }
}

// 重置所有拍子的高亮显示
function resetBeatsHighlight() {
  const beats = document.querySelectorAll(".metronome-pattern .beat");
  beats.forEach((beat) => {
    beat.classList.remove("active");
  });
}

// 按钮点击效果
function addButtonClickEffect(button) {
  button.classList.add("btn-click-effect");
  setTimeout(() => {
    button.classList.remove("btn-click-effect");
  }, 300);
}

// 从服务器加载游戏设置的辅助函数
async function loadGameSettings() {
  try {
    // 先尝试使用游戏数据模块中的加载函数
    if (window.GameData && typeof window.GameData.loadSettings === "function") {
      console.log("使用GameData.loadSettings加载...");
      return await window.GameData.loadSettings();
    }

    // 如果游戏模块未提供加载函数，则使用API
    console.log("通过API加载设置...");
    const response = await fetch("http://localhost:3000/api/game_2_settings");
    if (!response.ok) {
      throw new Error(`获取设置失败: ${response.status}`);
    }
    const settings = await response.json();

    // 检查是否有备份可以合并
    try {
      const localSettings = localStorage.getItem(
        "movement_without_hands_settings"
      );
      if (localSettings) {
        const parsedLocalSettings = JSON.parse(localSettings);
        console.log("发现本地备份设置:", parsedLocalSettings);

        // 如果服务器没有BPM设置但本地有，使用本地的
        if (!settings.beatsPerMinute && parsedLocalSettings.beatsPerMinute) {
          settings.beatsPerMinute = parsedLocalSettings.beatsPerMinute;
          console.log("从本地备份恢复BPM设置:", settings.beatsPerMinute);
        }
      }
    } catch (e) {
      console.warn("无法从本地存储读取设置:", e);
    }

    return settings;
  } catch (error) {
    console.error("加载游戏设置失败:", error);

    // 尝试从本地存储恢复
    try {
      const localSettings = localStorage.getItem(
        "movement_without_hands_settings"
      );
      if (localSettings) {
        const parsedSettings = JSON.parse(localSettings);
        console.log("从本地存储恢复设置:", parsedSettings);
        return parsedSettings;
      }
    } catch (e) {
      console.warn("无法从本地存储恢复设置:", e);
    }

    return { beatsPerMinute: 120 }; // 返回默认设置
  }
}

// 保存游戏设置的辅助函数
async function saveGameSettings(settings) {
  try {
    console.log("正在保存游戏设置:", settings);

    // 确保BPM是数字类型
    const settingsToSave = {
      ...settings,
      beatsPerMinute: parseInt(settings.beatsPerMinute, 10),
    };

    // 先尝试使用游戏数据模块中的保存函数
    if (window.GameData && typeof window.GameData.saveSettings === "function") {
      console.log("使用GameData.saveSettings保存...");
      return await window.GameData.saveSettings(settingsToSave);
    }

    // 如果游戏模块未提供保存函数，则使用API
    console.log("通过API保存设置...");
    const response = await fetch("http://localhost:3000/api/game_2_settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settingsToSave),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("服务器返回错误:", response.status, errorText);
      throw new Error(`服务器返回错误 ${response.status}: ${errorText}`);
    }

    // 如果需要，可以向LocalStorage保存一份备份
    try {
      localStorage.setItem(
        "movement_without_hands_settings",
        JSON.stringify(settingsToSave)
      );
      console.log("设置已保存到本地存储作为备份");
    } catch (e) {
      console.warn("无法保存设置到本地存储:", e);
    }

    console.log("设置保存成功");
    return true;
  } catch (error) {
    console.error("保存游戏设置失败:", error);
    return false;
  }
}
