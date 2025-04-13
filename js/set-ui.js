/**
 * 设置中心 - UI交互模块
 * 处理UI相关的交互和效果
 */

document.addEventListener("DOMContentLoaded", function () {
  // 添加页面离开提示
  window.addEventListener("beforeunload", function (e) {
    if (State.hasChanges) {
      // 仍然需要返回一个字符串以触发浏览器的确认对话框
      // 但具体显示的文本由浏览器控制
      e.returnValue = "";
      return "";
    }
  });

  // 添加键盘快捷键
  document.addEventListener("keydown", function (e) {
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
  });

  // 添加表单字段实时验证
  DOM.playerName.addEventListener("input", validatePlayerName);
  DOM.trickName.addEventListener("input", validateTrickName);
  DOM.awardRank.addEventListener("input", validateAwardRank);
  DOM.awardName.addEventListener("input", validateAwardName);
  DOM.awardDescription.addEventListener("input", validateAwardDescription); // 新增
});

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

// 添加动画效果
function applyAnimations() {
  // 添加项目时的动画
  DOM.playerList.addEventListener("DOMNodeInserted", function (e) {
    if (e.target.tagName === "LI") {
      e.target.style.animation = "fadeIn 0.3s ease-out";
    }
  });

  DOM.trickList.addEventListener("DOMNodeInserted", function (e) {
    if (e.target.tagName === "LI") {
      e.target.style.animation = "fadeIn 0.3s ease-out";
    }
  });

  DOM.awardList.addEventListener("DOMNodeInserted", function (e) {
    if (e.target.tagName === "LI") {
      e.target.style.animation = "fadeIn 0.3s ease-out";
    }
  });
}

// 初始化页面动画
applyAnimations();
