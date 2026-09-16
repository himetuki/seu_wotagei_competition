/**
 * 设置中心 - 奖励管理模块
 * 处理奖励数据的加载、编辑和保存
 */

document.addEventListener("DOMContentLoaded", function () {
  // 加载初始奖励数据
  loadAwardData();

  // 绑定奖励相关事件
  bindAwardEvents();
});

// 绑定奖励管理事件
function bindAwardEvents() {
  // 添加奖励按钮
  DOM.addAwardBtn.addEventListener("click", function () {
    resetAwardForm();
    State.isEditing = false;
    State.editingItemId = null;
  });

  // 保存奖励按钮
  DOM.saveAwardsBtn.addEventListener("click", function () {
    saveAwardData();
  });

  // 奖励表单提交
  DOM.awardForm.addEventListener("submit", function (e) {
    e.preventDefault();
    handleAwardFormSubmit();
  });

  // 取消编辑按钮
  DOM.cancelAwardEdit.addEventListener("click", function () {
    resetAwardForm();
  });
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
        <button class="edit-btn" title="编辑">✏️</button>
        <button class="delete-btn" title="删除">🗑️</button>
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
