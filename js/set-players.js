/**
 * 设置中心 - 选手管理模块
 * 处理选手数据的加载、编辑和保存
 */

document.addEventListener("DOMContentLoaded", function () {
  // 加载初始选手数据
  loadPlayerData(State.currentPlayerFile);

  // 绑定选手相关事件
  bindPlayerEvents();
});

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
  });

  // 移除添加选手按钮的事件监听（因为已经不需要这个按钮了）

  // 保存选手按钮
  DOM.savePlayersBtn.addEventListener("click", function () {
    savePlayerData();
  });

  // 选手表单提交
  DOM.playerForm.addEventListener("submit", function (e) {
    e.preventDefault();
    handlePlayerFormSubmit();
  });

  // 取消编辑按钮
  DOM.cancelPlayerEdit.addEventListener("click", function () {
    resetPlayerForm();
  });

  // 添加导入选手文件事件监听
  const importPlayersFile = document.getElementById("import-players-file");
  if (importPlayersFile) {
    importPlayersFile.addEventListener("change", handleFileSelect);
  }

  // 添加文件拖放事件监听
  const dropArea = document.getElementById("drop-area");
  if (dropArea) {
    dropArea.addEventListener("dragover", handleDragOver);
    dropArea.addEventListener("dragleave", handleDragLeave);
    dropArea.addEventListener("drop", handleFileDrop);
  }

  // 添加选手文件选择变更事件
  if (DOM.playerFileSelect) {
    DOM.playerFileSelect.addEventListener("change", function () {
      State.currentPlayerFile = this.value;
      loadPlayerData(State.currentPlayerFile);
    });
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
        <button class="edit-btn" title="编辑">✏️</button>
        <button class="delete-btn" title="删除">🗑️</button>
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
