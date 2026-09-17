/**
 * modules/setting 前端组件（P3d 插件化迁移）
 *
 * 内容级聚合自原 5 份脚本（语句顺序 = 原 index.html 的 <script> 加载顺序）：
 *   1. set-core.js    —— DOM/State/常量定义 + 页面初始化 + 功能开关 + 通用工具
 *   2. set-players.js —— 选手管理
 *   3. set-tricks.js  —— 技能管理
 *   4. set-awards.js  —— 奖励管理
 *   5. set-ui.js      —— UI 交互（快捷键/实时校验/动画）
 *
 * 形态适配仅三处，其余逐行保留：
 *   - 原 5 处 DOMContentLoaded 初始化体按监听器注册顺序改为 component 体内直接执行
 *     （原全局 function 声明提升语义在闭包内等价成立，交叉引用不变）；
 *   - window/document 级监听器（beforeunload / keydown / DOMNodeInserted）改为
 *     具名函数登记，供 cleanup 在重渲染/卸载时移除；
 *   - fetch API 端点与 localStorage key 逐字保留（/api/player1 等）。
 * 原 set-*.js 保留在磁盘（迁移期兜底参考，P5 统一清理），不再被页面加载。
 */

// ========== 1/5 set-core.js：设置中心 - 核心模块（包含通用功能和基础设置） ==========

import { icon } from "/web/icons.mjs";

export function component(el, meta, ctx) {
  // cleanup 契约：静态骨架节点的全部监听经 signal 登记，重渲染/卸载时 abort 统一解绑，
  // 防止不刷新页面的重复 render 造成双绑双触发
  // （动态节点上的监听不登记：随 innerHTML 清空连同节点一并释放）
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

  // DOM元素缓存
  const DOM = {};

  // 全局状态
  const State = {
    currentTab: "players",
    currentPlayerFile: "player1",
    currentTrickFile: "tricks",
    playerData: [],
    trickData: [],
    awardData: [],
    editingItemId: null,
    isEditing: false,
    hasChanges: false,
  };

  // 常量定义
  const API_BASE_URL = "/api";
  const ENDPOINTS = {
    player1: "/player1",
    player2: "/player2",
    tricks: "/tricks",
    tricks_for_group2: "/tricks_for_group2",
    award: "/award", // 确保这里是"/award"而不是"/awards"
  };

  const FEATURE_TOGGLE_KEYS = {
    group1DrawTrick: "feature_group1_draw_trick_enabled",
    group2DrawTrick: "feature_group2_draw_trick_enabled",
  };

  // ---- 原 set-core.js DOMContentLoaded 初始化体（第 1 个监听器） ----
  console.log("设置页面加载完成");

  // 缓存DOM元素
  cacheDOMElements();

  // 绑定通用事件
  bindCommonEvents();

  // 绑定功能开关事件
  bindFeatureToggleEvents();

  // 显示初始标签页
  showTab(State.currentTab);

  // 加载功能开关状态
  loadFeatureToggles();

  // 返回主页按钮
  DOM.homeBtn.addEventListener("click", function () {
    if (State.hasChanges) {
      showConfirmDialog("您有未保存的更改，确定要离开吗？", () => {
        window.location.href = "/m/home";
      });
    } else {
      window.location.href = "/m/home";
    }
  }, { signal });

  // 缓存DOM元素
  function cacheDOMElements() {
    // 标签页按钮
    DOM.tabButtons = document.querySelectorAll(".tab-btn");
    DOM.tabPanels = document.querySelectorAll(".tab-panel");

    // 通用元素
    DOM.statusMessage = document.getElementById("status-message");
    DOM.homeBtn = document.getElementById("home-btn");

    // 选手管理元素
    DOM.playerFileSelect = document.getElementById("player-file-select");
    DOM.playerList = document.getElementById("player-list");
    DOM.playerForm = document.getElementById("player-form");
    DOM.playerName = document.getElementById("player-name");
    // 移除对add-player-btn的引用，因为不再需要
    DOM.savePlayersBtn = document.getElementById("save-players-btn");
    DOM.cancelPlayerEdit = document.getElementById("cancel-player-edit");

    // 技能管理元素
    DOM.trickFileSelect = document.getElementById("trick-file-select");
    DOM.trickList = document.getElementById("trick-list");
    DOM.trickForm = document.getElementById("trick-form");
    DOM.trickName = document.getElementById("trick-name");
    // 移除对add-trick-btn的引用，因为不再需要
    DOM.saveTricksBtn = document.getElementById("save-tricks-btn");
    DOM.cancelTrickEdit = document.getElementById("cancel-trick-edit");

    // 奖励管理元素
    DOM.awardList = document.getElementById("award-list");
    DOM.awardForm = document.getElementById("award-form");
    DOM.awardRank = document.getElementById("award-rank");
    DOM.awardName = document.getElementById("award-name");
    DOM.awardDescription = document.getElementById("award-description"); // 新增
    DOM.addAwardBtn = document.getElementById("add-award-btn");
    DOM.saveAwardsBtn = document.getElementById("save-awards-btn");
    DOM.cancelAwardEdit = document.getElementById("cancel-award-edit");

    // 功能开关元素
    DOM.toggleGroup1DrawTrick = document.getElementById("toggle-group1-draw-trick");
    DOM.toggleGroup2DrawTrick = document.getElementById("toggle-group2-draw-trick");
    DOM.dragTotalCount = document.getElementById("drag-total-count");
    DOM.toggleDragKeepBg = document.getElementById("toggle-drag-keep-bg");
    DOM.toggleDragDoubleElim = document.getElementById("toggle-drag-double-elim");
    DOM.saveFeatureTogglesBtn = document.getElementById("save-feature-toggles-btn");

    // 静态骨架图标：批量导入标签的装饰图标（原 HTML 内 emoji，此处注入 Tabler SVG）
    document.querySelectorAll(".import-icon").forEach((node) => {
      node.innerHTML = icon("file-text", { size: 18 });
    });
  }

  function bindFeatureToggleEvents() {
    if (
      !DOM.toggleGroup1DrawTrick ||
      !DOM.toggleGroup2DrawTrick ||
      !DOM.saveFeatureTogglesBtn
    ) {
      return;
    }

    DOM.toggleGroup1DrawTrick.addEventListener("change", () => {
      State.hasChanges = true;
    }, { signal });

    DOM.toggleGroup2DrawTrick.addEventListener("change", () => {
      State.hasChanges = true;
    }, { signal });

    if (DOM.dragTotalCount) {
      DOM.dragTotalCount.addEventListener("change", () => {
        State.hasChanges = true;
      }, { signal });
    }

    if (DOM.toggleDragKeepBg) {
      DOM.toggleDragKeepBg.addEventListener("change", () => {
        State.hasChanges = true;
      }, { signal });
    }

    if (DOM.toggleDragDoubleElim) {
      DOM.toggleDragDoubleElim.addEventListener("change", () => {
        State.hasChanges = true;
      }, { signal });
    }

    DOM.saveFeatureTogglesBtn.addEventListener("click", saveFeatureToggles, { signal });
  }

  function loadFeatureToggles() {
    if (!DOM.toggleGroup1DrawTrick || !DOM.toggleGroup2DrawTrick) {
      return;
    }

    const group1Value = localStorage.getItem(FEATURE_TOGGLE_KEYS.group1DrawTrick);
    const group2Value = localStorage.getItem(FEATURE_TOGGLE_KEYS.group2DrawTrick);

    DOM.toggleGroup1DrawTrick.checked = group1Value !== "false";
    DOM.toggleGroup2DrawTrick.checked = group2Value !== "false";

    if (DOM.dragTotalCount) {
      const dragCount = localStorage.getItem("dragTotalCount");
      DOM.dragTotalCount.value = dragCount ? parseInt(dragCount) : 8;
    }

    if (DOM.toggleDragKeepBg) {
      const keepBg = localStorage.getItem("dragBattleKeepBg");
      DOM.toggleDragKeepBg.checked = keepBg !== "false";
    }

    if (DOM.toggleDragDoubleElim) {
      const doubleElim = localStorage.getItem("dragDoubleElim");
      DOM.toggleDragDoubleElim.checked = doubleElim === "true";
    }
  }

  function saveFeatureToggles() {
    if (!DOM.toggleGroup1DrawTrick || !DOM.toggleGroup2DrawTrick) {
      return;
    }

    localStorage.setItem(
      FEATURE_TOGGLE_KEYS.group1DrawTrick,
      String(DOM.toggleGroup1DrawTrick.checked)
    );
    localStorage.setItem(
      FEATURE_TOGGLE_KEYS.group2DrawTrick,
      String(DOM.toggleGroup2DrawTrick.checked)
    );

    if (DOM.dragTotalCount) {
      let count = parseInt(DOM.dragTotalCount.value) || 8;
      count = Math.max(2, Math.min(32, count));
      count = Math.round(count / 2) * 2;
      DOM.dragTotalCount.value = count;
      localStorage.setItem("dragTotalCount", String(count));

      // 同步到服务器
      fetch("/api/drag-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalCount: count }),
      }).catch(() => {});
    }

    if (DOM.toggleDragKeepBg) {
      localStorage.setItem("dragBattleKeepBg", String(DOM.toggleDragKeepBg.checked));
    }

    if (DOM.toggleDragDoubleElim) {
      localStorage.setItem("dragDoubleElim", String(DOM.toggleDragDoubleElim.checked));
      // 同步双败赛状态到服务器
      fetch("/api/drag-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doubleElim: DOM.toggleDragDoubleElim.checked }),
      }).catch(() => {});
    }

    State.hasChanges = false;
    showStatusMessage("功能开关设置已保存", "success");
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
    confirmBtn.className = "dialog-btn confirm-btn";
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

    // 点击遮罩关闭对话框（相当于取消）
    overlay.addEventListener("click", function () {
      document.body.removeChild(dialogContainer);
      if (onCancel) onCancel();
    });

    // 添加到页面
    document.body.appendChild(dialogContainer);

    // 触发动画
    setTimeout(() => {
      dialog.classList.add("show");
    }, 10);
  }

  // 绑定通用事件
  function bindCommonEvents() {
    // 标签页切换
    DOM.tabButtons.forEach((button) => {
      button.addEventListener("click", function () {
        const tabName = this.dataset.tab;
        showTab(tabName);
      }, { signal });
    });
  }

  // 显示标签页
  function showTab(tabName) {
    // 记录当前标签页
    State.currentTab = tabName;

    // 更新标签按钮状态
    DOM.tabButtons.forEach((button) => {
      if (button.dataset.tab === tabName) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });

    // 显示对应面板
    DOM.tabPanels.forEach((panel) => {
      if (panel.id === `${tabName}-panel`) {
        panel.classList.add("active");
      } else {
        panel.classList.remove("active");
      }
    });

    // 根据标签页加载数据
    switch (tabName) {
      case "players":
        loadPlayerData(State.currentPlayerFile);
        break;
      case "tricks":
        loadTrickData(State.currentTrickFile);
        break;
      case "awards":
        loadAwardData();
        break;
      case "features":
        loadFeatureToggles();
        break;
      case "musics":
        // 音乐导入面板不需要加载数据，只有跳转按钮
        break;
    }
  }

  // 显示状态消息
  function showStatusMessage(message, type = "info") {
    DOM.statusMessage.textContent = message;
    DOM.statusMessage.className = type;
    DOM.statusMessage.classList.add("show");

    setTimeout(() => {
      DOM.statusMessage.classList.remove("show");
    }, 3000);
  }

  // 通用API请求函数
  async function fetchAPI(endpoint, method = "GET", data = null) {
    try {
      const options = {
        method,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      };

      if (data && (method === "POST" || method === "PUT")) {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
      }

      // 对于DELETE请求可能没有返回内容
      if (method === "DELETE") {
        return true;
      }

      // 检查响应内容类型，决定是解析为JSON还是文本
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return await response.json();
      } else {
        // 如果不是JSON，返回文本内容
        return await response.text();
      }
    } catch (error) {
      console.error("API请求错误:", error);
      showStatusMessage(`请求失败: ${error.message}`, "error");
      throw error;
    }
  }

  // 生成唯一ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // ========== 2/5 set-players.js：设置中心 - 选手管理模块（处理选手数据的加载、编辑和保存） ==========

  // ---- 原 set-players.js DOMContentLoaded 初始化体（第 2 个监听器） ----
  // 加载初始选手数据
  loadPlayerData(State.currentPlayerFile);

  // 绑定选手相关事件
  bindPlayerEvents();

  // 绑定选手管理事件
  function bindPlayerEvents() {
    // 选手文件切换
    DOM.playerFileSelect.addEventListener("change", function () {
      if (State.hasChanges) {
        showConfirmDialog(
          "您有未保存的更改，切换文件将丢失这些更改。确定要继续吗？",
          () => {
            State.currentPlayerFile = this.value;
            loadPlayerData(State.currentPlayerFile);
            State.hasChanges = false;
          },
          () => {
            // 恢复选择
            this.value = State.currentPlayerFile;
          }
        );
      } else {
        State.currentPlayerFile = this.value;
        loadPlayerData(State.currentPlayerFile);
      }
    }, { signal });

    // 移除添加选手按钮的事件监听（因为已经不需要这个按钮了）

    // 保存选手按钮
    DOM.savePlayersBtn.addEventListener("click", function () {
      savePlayerData();
    }, { signal });

    // 选手表单提交
    DOM.playerForm.addEventListener("submit", function (e) {
      e.preventDefault();
      handlePlayerFormSubmit();
    }, { signal });

    // 取消编辑按钮
    DOM.cancelPlayerEdit.addEventListener("click", function () {
      resetPlayerForm();
    }, { signal });

    // 添加导入选手文件事件监听
    const importPlayersFile = document.getElementById("import-players-file");
    if (importPlayersFile) {
      importPlayersFile.addEventListener("change", handleFileSelect, { signal });
    }

    // 添加文件拖放事件监听
    const dropArea = document.getElementById("drop-area");
    if (dropArea) {
      dropArea.addEventListener("dragover", handleDragOver, { signal });
      dropArea.addEventListener("dragleave", handleDragLeave, { signal });
      dropArea.addEventListener("drop", handleFileDrop, { signal });
    }

    // 添加选手文件选择变更事件
    if (DOM.playerFileSelect) {
      DOM.playerFileSelect.addEventListener("change", function () {
        State.currentPlayerFile = this.value;
        loadPlayerData(State.currentPlayerFile);
      }, { signal });
    }
  }

  // 加载选手数据
  async function loadPlayerData(fileType) {
    try {
      // 显示加载中
      DOM.playerList.innerHTML = '<li class="loading">加载中...</li>';

      // 获取数据
      const data = await fetchAPI(ENDPOINTS[fileType]);

      // 格式化数据
      State.playerData = Array.isArray(data) ? data : [];
      if (fileType === "player1" || fileType === "player2") {
        // 确保数据格式一致
        State.playerData = State.playerData
          .map((player) => {
            if (typeof player === "string") {
              return { name: player };
            } else if (typeof player === "object" && player.name) {
              return player;
            }
            return null;
          })
          .filter((player) => player !== null);
      }

      // 渲染列表
      renderPlayerList();

      // 重置表单
      resetPlayerForm();

      showStatusMessage(`${fileType}.json 加载成功`);
    } catch (error) {
      console.error(`加载${fileType}.json失败:`, error);
      DOM.playerList.innerHTML = '<li class="error">加载失败，请重试</li>';
      showStatusMessage(`加载${fileType}.json失败`, "error");
    }
  }

  // 渲染选手列表
  function renderPlayerList() {
    if (!State.playerData || State.playerData.length === 0) {
      DOM.playerList.innerHTML = '<li class="empty">暂无选手数据</li>';
      return;
    }

    DOM.playerList.innerHTML = "";

    State.playerData.forEach((player, index) => {
      const li = document.createElement("li");
      li.dataset.index = index;
      li.dataset.id = player.id || index;
      li.innerHTML = `
        <span class="item-name">${player.name}</span>
        <div class="item-actions">
          <button class="edit-btn" title="编辑">${icon("pencil", { size: 16, label: "编辑" })}</button>
          <button class="delete-btn" title="删除">${icon("trash", { size: 16, label: "删除" })}</button>
        </div>
      `;

      // 编辑按钮事件
      li.querySelector(".edit-btn").addEventListener("click", () => {
        editPlayer(index);
      });

      // 删除按钮事件
      li.querySelector(".delete-btn").addEventListener("click", () => {
        deletePlayer(index);
      });

      DOM.playerList.appendChild(li);
    });
  }

  // 编辑选手
  function editPlayer(index) {
    const player = State.playerData[index];
    if (player) {
      State.isEditing = true;
      State.editingItemId = index;

      DOM.playerName.value = player.name || "";
    }
  }

  // 删除选手
  function deletePlayer(index) {
    showConfirmDialog("确定要删除这名选手吗？", () => {
      State.playerData.splice(index, 1);
      renderPlayerList();
      State.hasChanges = true;
      showStatusMessage("选手已删除，点击保存以提交更改");
    });
  }

  // 处理选手表单提交
  function handlePlayerFormSubmit() {
    const name = DOM.playerName.value.trim();

    if (!name) {
      showStatusMessage("选手名称不能为空", "error");
      return;
    }

    if (State.isEditing && State.editingItemId !== null) {
      // 更新已有选手
      State.playerData[State.editingItemId].name = name;
      showStatusMessage("选手已更新，点击保存更改以提交", "success");
    } else {
      // 添加新选手
      State.playerData.push({ name });
      showStatusMessage("选手已添加，点击保存更改以提交", "success");
    }

    renderPlayerList();
    resetPlayerForm();
    State.hasChanges = true;
  }

  // 重置选手表单
  function resetPlayerForm() {
    DOM.playerForm.reset();
    State.isEditing = false;
    State.editingItemId = null;
  }

  // 保存选手数据
  async function savePlayerData() {
    try {
      // 针对不同文件格式化数据
      let dataToSave;
      if (
        State.currentPlayerFile === "player1" ||
        State.currentPlayerFile === "player2"
      ) {
        // 修正：保存为对象格式，而不是仅保存名称
        dataToSave = State.playerData.map((player) => ({ name: player.name }));
      } else {
        dataToSave = State.playerData;
      }

      // 发送请求
      await fetchAPI(ENDPOINTS[State.currentPlayerFile], "POST", dataToSave);

      State.hasChanges = false;
      showStatusMessage(`${State.currentPlayerFile}.json 保存成功`, "success");
    } catch (error) {
      console.error(`保存${State.currentPlayerFile}.json失败:`, error);
      showStatusMessage(`保存失败: ${error.message}`, "error");
    }
  }

  // 处理文件选择
  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      processImportFile(file);
    }

    // 重置文件输入以便下次选择同一文件时也能触发change事件
    event.target.value = "";
  }

  // 处理拖拽悬停
  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById("drop-area").classList.add("dragover");
  }

  // 处理拖拽离开
  function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById("drop-area").classList.remove("dragover");
  }

  // 处理文件拖放
  function handleFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    // 移除拖拽样式
    document.getElementById("drop-area").classList.remove("dragover");

    // 获取拖放的文件
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      // 仅处理第一个文件
      const file = files[0];

      // 检查文件类型
      if (file.name.toLowerCase().endsWith(".txt")) {
        processImportFile(file);
      } else {
        showStatusMessage("请拖放TXT文本文件", "error");
      }
    }
  }

  // 处理导入文件
  function processImportFile(file) {
    // 确认当前组别
    const currentGroup = State.currentPlayerFile;
    const groupName = currentGroup === "player1" ? "一年加组" : "一年内组";

    // 获取导入模式
    const importMode = document.querySelector(
      'input[name="import-mode"]:checked'
    ).value;
    const actionText = importMode === "append" ? "添加到" : "替换";

    // 显示确认对话框
    showConfirmDialog(`确定要${actionText}${groupName}选手列表吗？`, () => {
      const reader = new FileReader();

      reader.onload = function (e) {
        const content = e.target.result;
        const playerNames = content
          .split("\n")
          .map((name) => name.trim())
          .filter((name) => name.length > 0);

        if (playerNames.length === 0) {
          showStatusMessage("导入文件为空或格式不正确", "error");
          return;
        }

        // 根据导入模式处理选手列表
        if (importMode === "replace") {
          // 替换模式：清空现有列表
          State.playerData = playerNames.map((name) => ({ name }));
          showStatusMessage(`已替换为${playerNames.length}名新选手`, "success");
        } else {
          // 添加模式：添加到现有列表
          let addedCount = 0;
          playerNames.forEach((name) => {
            // 检查重复选手
            const exists = State.playerData.some(
              (player) => player.name.toLowerCase() === name.toLowerCase()
            );

            if (!exists) {
              State.playerData.push({ name });
              addedCount++;
            }
          });

          showStatusMessage(
            `成功导入${addedCount}名新选手到${groupName}`,
            "success"
          );
        }

        // 更新列表显示
        renderPlayerList();

        // 标记为已修改
        State.hasChanges = true;
      };

      reader.onerror = function () {
        showStatusMessage("读取文件时发生错误", "error");
      };

      reader.readAsText(file);
    });
  }

  // 显示确认对话框的实现函数(如果set-core.js中已有则可省略)
  function showPlayerImportConfirmDialog(message, onConfirm) {
    // 检查是否已经存在相同功能的函数
    if (typeof showConfirmDialog === "function") {
      showConfirmDialog(message, onConfirm);
      return;
    }

    // 自定义实现（如果需要）
    if (confirm(message)) {
      onConfirm();
    }
  }

  // ========== 3/5 set-tricks.js：设置中心 - 技能管理模块（处理技能数据的加载、编辑和保存） ==========

  // ---- 原 set-tricks.js DOMContentLoaded 初始化体（第 3 个监听器） ----
  // 加载初始技能数据
  loadTrickData(State.currentTrickFile);

  // 绑定技能相关事件
  bindTrickEvents();

  // 绑定技能管理事件
  function bindTrickEvents() {
    // 技能文件切换
    DOM.trickFileSelect.addEventListener("change", function () {
      if (State.hasChanges) {
        showConfirmDialog(
          "您有未保存的更改，切换文件将丢失这些更改。确定要继续吗？",
          () => {
            State.currentTrickFile = this.value;
            loadTrickData(State.currentTrickFile);
            State.hasChanges = false;
          },
          () => {
            // 恢复选择
            this.value = State.currentTrickFile;
          }
        );
      } else {
        State.currentTrickFile = this.value;
        loadTrickData(State.currentTrickFile);
      }
    }, { signal });

    // 移除添加技能按钮的事件监听（因为已不需要这个按钮）

    // 保存技能按钮
    DOM.saveTricksBtn.addEventListener("click", function () {
      saveTrickData();
    }, { signal });

    // 技能表单提交
    DOM.trickForm.addEventListener("submit", function (e) {
      e.preventDefault();
      handleTrickFormSubmit();
    }, { signal });

    // 取消编辑按钮
    DOM.cancelTrickEdit.addEventListener("click", function () {
      resetTrickForm();
    }, { signal });

    // 添加导入技能文件事件监听
    const importTricksFile = document.getElementById("import-tricks-file");
    if (importTricksFile) {
      importTricksFile.addEventListener("change", handleTrickFileSelect, { signal });
    }

    // 添加文件拖放事件监听
    const trickDropArea = document.getElementById("trick-drop-area");
    if (trickDropArea) {
      trickDropArea.addEventListener("dragover", handleTrickDragOver, { signal });
      trickDropArea.addEventListener("dragleave", handleTrickDragLeave, { signal });
      trickDropArea.addEventListener("drop", handleTrickFileDrop, { signal });
    }
  }

  // 加载技能数据
  async function loadTrickData(fileType) {
    try {
      // 显示加载中
      DOM.trickList.innerHTML = '<li class="loading">加载中...</li>';

      // 获取数据
      const data = await fetchAPI(ENDPOINTS[fileType]);

      // 格式化数据
      State.trickData = Array.isArray(data) ? data : [];

      // 确保技能数据结构一致
      if (fileType === "tricks" || fileType === "tricks_for_group2") {
        State.trickData = State.trickData
          .map((trick) => {
            if (typeof trick === "string") {
              return { name: trick };
            } else if (typeof trick === "object") {
              // 如果是tricks.json，它的结构是{name: "技名"}
              return { name: trick.name || "未命名技能" };
            }
            return null;
          })
          .filter((trick) => trick !== null);
      }

      // 渲染列表
      renderTrickList();

      // 重置表单
      resetTrickForm();

      showStatusMessage(`${fileType}.json 加载成功`);
    } catch (error) {
      console.error(`加载${fileType}.json失败:`, error);
      DOM.trickList.innerHTML = '<li class="error">加载失败，请重试</li>';
      showStatusMessage(`加载${fileType}.json失败`, "error");
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
      li.dataset.id = trick.id || index;
      li.innerHTML = `
        <span class="item-name">${trick.name}</span>
        <div class="item-actions">
          <button class="edit-btn" title="编辑">${icon("pencil", { size: 16, label: "编辑" })}</button>
          <button class="delete-btn" title="删除">${icon("trash", { size: 16, label: "删除" })}</button>
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
    }
  }

  // 删除技能
  function deleteTrick(index) {
    showConfirmDialog("确定要删除这个技能吗？", () => {
      State.trickData.splice(index, 1);
      renderTrickList();
      State.hasChanges = true;
      showStatusMessage("技能已删除，点击保存以提交更改");
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
      showStatusMessage("技能已更新，点击保存更改以提交", "success");
    } else {
      // 添加新技能
      State.trickData.push({ name });
      showStatusMessage("技能已添加，点击保存更改以提交", "success");
    }

    renderTrickList();
    resetTrickForm();
    State.hasChanges = true;
  }

  // 重置技能表单
  function resetTrickForm() {
    DOM.trickForm.reset();
    State.isEditing = false;
    State.editingItemId = null;
  }

  // 保存技能数据
  async function saveTrickData() {
    try {
      // 针对不同文件格式化数据
      let dataToSave;

      if (State.currentTrickFile === "tricks") {
        // tricks.json 格式要求
        dataToSave = State.trickData.map((trick) => ({ name: trick.name }));
      } else if (State.currentTrickFile === "tricks_for_group2") {
        // tricks_for_group2.json 仅保存技能名称
        dataToSave = State.trickData.map((trick) => trick.name);
      } else {
        dataToSave = State.trickData;
      }

      // 发送请求
      await fetchAPI(ENDPOINTS[State.currentTrickFile], "POST", dataToSave);

      State.hasChanges = false;
      showStatusMessage(`${State.currentTrickFile}.json 保存成功`, "success");
    } catch (error) {
      console.error(`保存${State.currentTrickFile}.json失败:`, error);
      showStatusMessage(`保存失败: ${error.message}`, "error");
    }
  }

  // 处理技能文件选择
  function handleTrickFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      processTrickImportFile(file);
    }

    // 重置文件输入以便下次选择同一文件时也能触发change事件
    event.target.value = "";
  }

  // 处理技能拖拽悬停
  function handleTrickDragOver(event) {
    event.preventDefault();
    event.stopPropagation();

    // 确保dragover类应用到正确的父元素
    const trickDropArea = document.getElementById("trick-drop-area");
    if (trickDropArea) {
      trickDropArea.classList.add("dragover");
    }
  }

  // 处理技能拖拽离开
  function handleTrickDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();

    // 确保只有当鼠标真正离开整个区域时才移除样式
    const trickDropArea = document.getElementById("trick-drop-area");
    if (trickDropArea) {
      // 检查鼠标是否真的离开了整个拖放区域
      const rect = trickDropArea.getBoundingClientRect();
      const isInside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!isInside) {
        trickDropArea.classList.remove("dragover");
      }
    }
  }

  // 处理技能文件拖放
  function handleTrickFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    // 移除拖拽样式
    const trickDropArea = document.getElementById("trick-drop-area");
    if (trickDropArea) {
      trickDropArea.classList.remove("dragover");
    }

    // 获取拖放的文件
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      // 仅处理第一个文件
      const file = files[0];

      // 检查文件类型
      if (file.name.toLowerCase().endsWith(".txt")) {
        processTrickImportFile(file);
      } else {
        showStatusMessage("请拖放TXT文本文件", "error");
      }
    }
  }

  // 处理导入技能文件
  function processTrickImportFile(file) {
    // 确认当前组别
    const currentFile = State.currentTrickFile;
    const fileName =
      currentFile === "tricks" ? "tricks.json" : "tricks_for_group2.json";

    // 获取导入模式
    const importMode = document.querySelector(
      'input[name="trick-import-mode"]:checked'
    ).value;
    const actionText = importMode === "append" ? "添加到" : "替换";

    // 显示确认对话框
    showConfirmDialog(`确定要${actionText}${fileName}技能列表吗？`, () => {
      const reader = new FileReader();

      reader.onload = function (e) {
        const content = e.target.result;
        const trickNames = content
          .split("\n")
          .map((name) => name.trim())
          .filter((name) => name.length > 0);

        if (trickNames.length === 0) {
          showStatusMessage("导入文件为空或格式不正确", "error");
          return;
        }

        // 根据导入模式处理技能列表
        if (importMode === "replace") {
          // 替换模式：清空现有列表
          State.trickData = trickNames.map((name) => ({ name }));
          showStatusMessage(`已替换为${trickNames.length}个新技能`, "success");
        } else {
          // 添加模式：添加到现有列表
          let addedCount = 0;
          trickNames.forEach((name) => {
            // 检查重复技能
            const exists = State.trickData.some(
              (trick) => trick.name.toLowerCase() === name.toLowerCase()
            );

            if (!exists) {
              State.trickData.push({ name });
              addedCount++;
            }
          });

          showStatusMessage(
            `成功导入${addedCount}个新技能到${fileName}`,
            "success"
          );
        }

        // 更新列表显示
        renderTrickList();

        // 标记为已修改
        State.hasChanges = true;
      };

      reader.onerror = function () {
        showStatusMessage("读取文件时发生错误", "error");
      };

      reader.readAsText(file);
    });
  }

  // ========== 4/5 set-awards.js：设置中心 - 奖励管理模块（处理奖励数据的加载、编辑和保存） ==========

  // ---- 原 set-awards.js DOMContentLoaded 初始化体（第 4 个监听器） ----
  // 加载初始奖励数据
  loadAwardData();

  // 绑定奖励相关事件
  bindAwardEvents();

  // 绑定奖励管理事件
  function bindAwardEvents() {
    // 添加奖励按钮
    DOM.addAwardBtn.addEventListener("click", function () {
      resetAwardForm();
      State.isEditing = false;
      State.editingItemId = null;
    }, { signal });

    // 保存奖励按钮
    DOM.saveAwardsBtn.addEventListener("click", function () {
      saveAwardData();
    }, { signal });

    // 奖励表单提交
    DOM.awardForm.addEventListener("submit", function (e) {
      e.preventDefault();
      handleAwardFormSubmit();
    }, { signal });

    // 取消编辑按钮
    DOM.cancelAwardEdit.addEventListener("click", function () {
      resetAwardForm();
    }, { signal });
  }

  // 加载奖励数据
  async function loadAwardData() {
    try {
      // 显示加载中
      DOM.awardList.innerHTML = '<li class="loading">加载中...</li>';

      // 获取数据
      const data = await fetchAPI(ENDPOINTS.award);

      // 检查是否是有效数据
      if (!data) {
        throw new Error("获取到的奖励数据为空");
      }

      console.log("获取到的奖励数据:", data);

      // 确保数据是数组
      State.awardData = Array.isArray(data) ? data : [];

      // 数据清理 - 过滤掉任何非对象元素(如字符串)
      State.awardData = State.awardData.filter(
        (item) => item && typeof item === "object" && !Array.isArray(item)
      );

      // 按排名排序
      State.awardData.sort((a, b) => a.rank - b.rank);

      // 渲染列表
      renderAwardList();

      // 重置表单
      resetAwardForm();

      showStatusMessage("奖励数据加载成功");
    } catch (error) {
      console.error("加载奖励数据失败:", error);
      DOM.awardList.innerHTML = `<li class="error">加载失败: ${error.message}</li>`;
      showStatusMessage(`加载奖励数据失败: ${error.message}`, "error");
    }
  }

  // 渲染奖励列表
  function renderAwardList() {
    if (!State.awardData || State.awardData.length === 0) {
      DOM.awardList.innerHTML = '<li class="empty">暂无奖励数据</li>';
      return;
    }

    DOM.awardList.innerHTML = "";

    // 已按排名排序
    State.awardData.forEach((award, index) => {
      const li = document.createElement("li");
      li.dataset.index = index;
      li.dataset.id = award.id || index;
      li.innerHTML = `
        <span class="item-name">第${award.rank}名: ${award.name}</span>
        <div class="item-description">${award.description || ""}</div>
        <div class="item-actions">
          <button class="edit-btn" title="编辑">${icon("pencil", { size: 16, label: "编辑" })}</button>
          <button class="delete-btn" title="删除">${icon("trash", { size: 16, label: "删除" })}</button>
        </div>
      `;

      // 编辑按钮事件
      li.querySelector(".edit-btn").addEventListener("click", () => {
        editAward(index);
      });

      // 删除按钮事件
      li.querySelector(".delete-btn").addEventListener("click", () => {
        deleteAward(index);
      });

      DOM.awardList.appendChild(li);
    });
  }

  // 编辑奖励
  function editAward(index) {
    const award = State.awardData[index];
    if (award) {
      State.isEditing = true;
      State.editingItemId = index;

      DOM.awardRank.value = award.rank || "";
      DOM.awardName.value = award.name || "";
      DOM.awardDescription.value = award.description || "";
    }
  }

  // 删除奖励
  function deleteAward(index) {
    const confirmDialog = document.createElement("div");
    confirmDialog.className = "confirm-dialog";
    confirmDialog.innerHTML = `
      <p>确定要删除这个奖励吗？</p>
      <button class="confirm-yes">确定</button>
      <button class="confirm-no">取消</button>
    `;

    document.body.appendChild(confirmDialog);

    confirmDialog.querySelector(".confirm-yes").addEventListener("click", () => {
      State.awardData.splice(index, 1);
      renderAwardList();
      State.hasChanges = true;
      showStatusMessage("奖励已删除，点击保存以提交更改");
      document.body.removeChild(confirmDialog);
    });

    confirmDialog.querySelector(".confirm-no").addEventListener("click", () => {
      document.body.removeChild(confirmDialog);
    });
  }

  // 处理奖励表单提交
  function handleAwardFormSubmit() {
    const rank = parseInt(DOM.awardRank.value);
    const name = DOM.awardName.value.trim();
    const description = DOM.awardDescription.value.trim();

    if (isNaN(rank) || rank < 1 || rank > 5) {
      showStatusMessage("排名必须是1到5之间的整数", "error");
      return;
    }

    if (!name) {
      showStatusMessage("奖励名称不能为空", "error");
      return;
    }

    if (!description) {
      showStatusMessage("奖励描述不能为空", "error");
      return;
    }

    // 检查是否有相同排名的奖励
    if (!State.isEditing) {
      const existingAwardIndex = State.awardData.findIndex(
        (award) => award.rank === rank
      );
      if (existingAwardIndex !== -1) {
        if (!confirm(`已经存在第${rank}名的奖励，是否覆盖？`)) {
          return;
        }
        // 找到该排名的索引并删除
        State.awardData.splice(existingAwardIndex, 1);
      }
    }

    if (State.isEditing && State.editingItemId !== null) {
      // 更新已有奖励
      State.awardData[State.editingItemId].rank = rank;
      State.awardData[State.editingItemId].name = name;
      State.awardData[State.editingItemId].description = description;
    } else {
      // 添加新奖励
      State.awardData.push({ rank, name, description });
    }

    // 更新后重新排序
    State.awardData.sort((a, b) => a.rank - b.rank);

    renderAwardList();
    resetAwardForm();
    State.hasChanges = true;
    showStatusMessage("奖励已更新，点击保存以提交更改");
  }

  // 重置奖励表单
  function resetAwardForm() {
    DOM.awardForm.reset();
    State.isEditing = false;
    State.editingItemId = null;
  }

  // 保存奖励数据
  async function saveAwardData() {
    try {
      // 数据已经是数组格式，直接保存
      await fetchAPI(ENDPOINTS.award, "POST", State.awardData);

      State.hasChanges = false;
      showStatusMessage("奖励数据保存成功", "success");
    } catch (error) {
      console.error("保存奖励数据失败:", error);
      showStatusMessage(`保存失败: ${error.message}`, "error");
    }
  }

  // ========== 5/5 set-ui.js：设置中心 - UI交互模块（处理UI相关的交互和效果） ==========

  // ---- 原 set-ui.js DOMContentLoaded 初始化体（第 5 个监听器） ----
  // 添加页面动画（需在 set-core 缓存 DOM 之后执行）
  applyAnimations();

  // 添加页面离开提示（signal 登记，cleanup abort 统一解绑）
  window.addEventListener("beforeunload", handleBeforeUnload, { signal });

  // 添加键盘快捷键（signal 登记，cleanup abort 统一解绑）
  document.addEventListener("keydown", handleDocumentKeyDown, { signal });

  // 添加表单字段实时验证
  DOM.playerName.addEventListener("input", validatePlayerName, { signal });
  DOM.trickName.addEventListener("input", validateTrickName, { signal });
  DOM.awardRank.addEventListener("input", validateAwardRank, { signal });
  DOM.awardName.addEventListener("input", validateAwardName, { signal });
  DOM.awardDescription.addEventListener("input", validateAwardDescription, { signal }); // 新增

  // 添加动画效果
  function applyAnimations() {
    // 添加项目时的动画（signal 登记，cleanup abort 统一解绑）
    DOM.playerList.addEventListener("DOMNodeInserted", handleDOMNodeInserted, { signal });

    DOM.trickList.addEventListener("DOMNodeInserted", handleDOMNodeInserted, { signal });

    DOM.awardList.addEventListener("DOMNodeInserted", handleDOMNodeInserted, { signal });
  }

  // 页面离开提示 handler（原 set-ui.js 匿名监听器具名化）
  function handleBeforeUnload(e) {
    if (State.hasChanges) {
      // 仍然需要返回一个字符串以触发浏览器的确认对话框
      // 但具体显示的文本由浏览器控制
      e.returnValue = "";
      return "";
    }
  }

  // 键盘快捷键 handler（原 set-ui.js 匿名监听器具名化）
  function handleDocumentKeyDown(e) {
    // Ctrl+S 保存
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();

      // 根据当前标签页调用对应的保存函数
      switch (State.currentTab) {
        case "players":
          savePlayerData();
          break;
        case "tricks":
          saveTrickData();
          break;
        case "awards":
          saveAwardData();
          break;
      }
    }

    // Esc 取消编辑
    if (e.key === "Escape") {
      switch (State.currentTab) {
        case "players":
          resetPlayerForm();
          break;
        case "tricks":
          resetTrickForm();
          break;
        case "awards":
          resetAwardForm();
          break;
      }
    }
  }

  // DOMNodeInserted handler（原 set-ui.js 三处匿名监听器共用具名化，行为等价）
  function handleDOMNodeInserted(e) {
    if (e.target.tagName === "LI") {
      e.target.style.animation = "fadeIn 0.3s ease-out";
    }
  }

  // 验证选手名称
  function validatePlayerName() {
    const value = DOM.playerName.value.trim();
    if (!value) {
      DOM.playerName.setCustomValidity("选手名称不能为空");
    } else {
      DOM.playerName.setCustomValidity("");
    }
  }

  // 验证技能名称
  function validateTrickName() {
    const value = DOM.trickName.value.trim();
    if (!value) {
      DOM.trickName.setCustomValidity("技能名称不能为空");
    } else {
      DOM.trickName.setCustomValidity("");
    }
  }

  // 验证奖励排名
  function validateAwardRank() {
    const value = parseInt(DOM.awardRank.value);
    if (isNaN(value) || value < 1 || value > 5) {
      DOM.awardRank.setCustomValidity("排名必须是1到5之间的整数");
    } else {
      DOM.awardRank.setCustomValidity("");
    }
  }

  // 验证奖励名称
  function validateAwardName() {
    const value = DOM.awardName.value.trim();
    if (!value) {
      DOM.awardName.setCustomValidity("奖励名称不能为空");
    } else {
      DOM.awardName.setCustomValidity("");
    }
  }

  // 验证奖励描述
  function validateAwardDescription() {
    const value = DOM.awardDescription.value.trim();
    if (!value) {
      DOM.awardDescription.setCustomValidity("奖励描述不能为空");
    } else {
      DOM.awardDescription.setCustomValidity("");
    }
  }

  // 初始化页面动画（已移入 component 体内执行，避免 DOM 缓存未就绪）

  // ---- cleanup 契约：重渲染/卸载时解绑全部登记监听（signal abort 一次覆盖） ----
  return function cleanup() {
    bindAbort.abort();
  };
}
