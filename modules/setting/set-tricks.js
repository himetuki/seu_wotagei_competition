/**
 * 设置中心 - 技能管理模块
 * 处理技能数据的加载、编辑和保存
 */

document.addEventListener("DOMContentLoaded", function () {
  // 加载初始技能数据
  loadTrickData(State.currentTrickFile);

  // 绑定技能相关事件
  bindTrickEvents();
});

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
  });

  // 移除添加技能按钮的事件监听（因为已不需要这个按钮）

  // 保存技能按钮
  DOM.saveTricksBtn.addEventListener("click", function () {
    saveTrickData();
  });

  // 技能表单提交
  DOM.trickForm.addEventListener("submit", function (e) {
    e.preventDefault();
    handleTrickFormSubmit();
  });

  // 取消编辑按钮
  DOM.cancelTrickEdit.addEventListener("click", function () {
    resetTrickForm();
  });

  // 添加导入技能文件事件监听
  const importTricksFile = document.getElementById("import-tricks-file");
  if (importTricksFile) {
    importTricksFile.addEventListener("change", handleTrickFileSelect);
  }

  // 添加文件拖放事件监听
  const trickDropArea = document.getElementById("trick-drop-area");
  if (trickDropArea) {
    trickDropArea.addEventListener("dragover", handleTrickDragOver);
    trickDropArea.addEventListener("dragleave", handleTrickDragLeave);
    trickDropArea.addEventListener("drop", handleTrickFileDrop);
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
