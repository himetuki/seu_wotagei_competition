/**
 * 一年内组比赛界面 - 第二章节（UI模块）
 * 处理UI更新和交互
 */

// 更新选手列表
function updatePlayerList() {
  DOM.playerList.innerHTML = "";
  AppState.players.forEach((player, index) => {
    const li = document.createElement("li");
    li.textContent = player.name;
    // 添加CSS变量来控制动画延迟
    li.style.setProperty("--player-index", index);
    if (index === AppState.currentPlayerIndex) {
      li.classList.add("current");
    }
    DOM.playerList.appendChild(li);
  });
}

// 更新技名列表
function updateTrickList() {
  if (!AppState.tricks || AppState.tricks.length === 0) return;

  DOM.trickList.innerHTML = "";
  AppState.tricks.forEach((trick, index) => {
    const li = document.createElement("li");
    li.textContent = trick.name;
    // 添加CSS变量来控制动画延迟
    li.style.setProperty("--item-index", index);
    li.addEventListener("click", () => {
      li.classList.toggle("crossed");
      saveState();
    });
    DOM.trickList.appendChild(li);
  });
}

// 显示提示信息 - 修改为顶部显示
function showToast(message, type = "info", duration = 3000) {
  // 先移除任何现有的提示
  hideToast();

  // 创建提示元素
  const toast = document.createElement("div");
  toast.classList.add("toast", `${type}-toast`);
  toast.id = "app-toast";
  toast.innerText = message;
  document.body.appendChild(toast);

  // 自动移除提示（除非是loading类型）
  if (type !== "loading" && duration > 0) {
    setTimeout(hideToast, duration);
  }

  return toast;
}

// 隐藏提示信息
function hideToast() {
  const existingToast = document.getElementById("app-toast");
  if (existingToast && document.body.contains(existingToast)) {
    document.body.removeChild(existingToast);
  }
}

// 进入下一位选手
function goToNextPlayer() {
  if (AppState.players.length === 0) return;

  // 检查是否为最后一个选手
  if (AppState.currentPlayerIndex === AppState.players.length - 1) {
    // 如果是最后一位选手，显示自定义确认弹窗
    showConfirmDialog(
      "已到达最后一位选手，是否返回第一位选手?",
      () => {
        // 确认回调
        AppState.currentPlayerIndex = 0;
        DOM.currentPlayer.textContent =
          AppState.players[AppState.currentPlayerIndex].name;
        updatePlayerList();
        saveState();
      },
      () => {
        // 取消回调
        showToast("已到最后一位选手", "info");
      }
    );
  } else {
    // 常规的下一位选手
    AppState.currentPlayerIndex =
      (AppState.currentPlayerIndex + 1) % AppState.players.length;
    DOM.currentPlayer.textContent =
      AppState.players[AppState.currentPlayerIndex].name;
    updatePlayerList();
    saveState();
  }
}

// 显示自定义确认对话框
function showConfirmDialog(message, onConfirm, onCancel) {
  // 移除可能已存在的对话框
  const existingDialog = document.querySelector(".custom-dialog-container");
  if (existingDialog) {
    document.body.removeChild(existingDialog);
  }

  // 创建遮罩
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  // 创建对话框容器
  const dialogContainer = document.createElement("div");
  dialogContainer.className = "custom-dialog-container";

  // 创建对话框内容
  const dialog = document.createElement("div");
  dialog.className = "custom-dialog golden-glow floating";

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
  confirmBtn.addEventListener("click", function (event) {
    event.stopPropagation(); // 防止事件冒泡
    document.body.removeChild(dialogContainer);
    if (onConfirm) onConfirm();
  });

  // 取消按钮
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "取消";
  cancelBtn.className = "dialog-btn cancel-btn";
  cancelBtn.addEventListener("click", function (event) {
    event.stopPropagation(); // 防止事件冒泡
    document.body.removeChild(dialogContainer);
    if (onCancel) onCancel();
  });

  // 组装对话框
  buttonContainer.appendChild(confirmBtn);
  buttonContainer.appendChild(cancelBtn);
  dialog.appendChild(buttonContainer);
  dialogContainer.appendChild(overlay);
  dialogContainer.appendChild(dialog);

  // 添加点击事件处理
  dialog.addEventListener("click", (e) => {
    e.stopPropagation(); // 防止点击对话框关闭对话框
  });

  overlay.addEventListener("click", (e) => {
    e.stopPropagation(); // 不处理遮罩点击
  });

  // 添加到页面
  document.body.appendChild(dialogContainer);

  // 淡入效果
  setTimeout(() => {
    dialogContainer.classList.add("show");
    dialog.classList.add("show");
  }, 10);
}

// 随机排序选手
function shufflePlayers() {
  if (AppState.players.length === 0) {
    showToast("没有可排序的选手", "warning");
    return;
  }

  AppState.players = [...AppState.players].sort(() => Math.random() - 0.5);
  AppState.currentPlayerIndex = 0;
  DOM.currentPlayer.textContent = AppState.players[0].name;
  updatePlayerList();
  saveState();

  showToast("选手已随机排序", "success");
}

// 抽取技名
function drawRandomTrick() {
  if (!AppState.tricks || AppState.tricks.length === 0) {
    showToast("技名数据未加载，请稍后再试", "error");
    return;
  }

  // 获取未划线的技名
  const availableTricks = Array.from(DOM.trickList.children)
    .filter((li) => !li.classList.contains("crossed"))
    .map((li) => li.textContent);

  if (availableTricks.length === 0) {
    showToast("所有技名都已划线，请重置技名", "warning");
    return;
  }

  const randomIndex = Math.floor(Math.random() * availableTricks.length);
  DOM.currentTrick.textContent = availableTricks[randomIndex];

  // 注意：这里不再自动标记为已使用，让用户手动标记
  // 仅显示抽取结果

  saveState();
  showToast(`已抽取技名: ${availableTricks[randomIndex]}`, "success");
}

// 抽取音乐
function drawRandomMusic() {
  // 先确认musics_list-2.json是否存在或可访问
  console.log("开始抽取音乐...");

  // 使用修改后的URL路径，从musics_list_2.json抽取音乐
  const musicUrl = "../resource/json/musics_list_2.json";
  console.log("请求音乐列表:", musicUrl);

  fetch(musicUrl)
    .then((response) => {
      console.log("音乐列表响应状态:", response.status);
      if (!response.ok)
        throw new Error(`无法加载音乐列表 (${response.status})`);
      return response.json();
    })
    .then((data) => {
      console.log("成功获取音乐数据, 数量:", data.length);

      if (!data || data.length === 0) {
        showToast("音乐列表为空", "error");
        return;
      }

      const randomIndex = Math.floor(Math.random() * data.length);
      // 这里直接获取字符串，因为musics_list-2.json是字符串数组
      const selectedMusic = data[randomIndex];

      console.log("已选择音乐:", selectedMusic);

      // 更新显示 - 可能需要截取文件名以改善显示
      const displayName = selectedMusic.replace(/\.mp3$/, "");
      DOM.currentMusic.textContent = displayName;

      // 设置音乐文件 - 不做任何编码处理，保留原始文件名
      AppState.currentMusicFile = selectedMusic;

      // 这里不预加载音乐，避免404错误
      DOM.playMusicButton.textContent = "播放音乐";
      AppState.isMusicPaused = false;
      AppState.isMusicPlaying = false;

      // 保存状态
      saveState();

      showToast(`已抽取音乐: ${displayName}`, "success");
    })
    .catch((error) => {
      console.error("加载音乐列表失败:", error);
      showToast(`无法加载音乐列表: ${error.message}`, "error");
    });
}

// 清除音乐
function clearMusic() {
  // 克隆音乐播放器以清除当前状态
  const oldPlayer = DOM.musicPlayer.cloneNode(false);
  DOM.musicPlayer.parentNode.replaceChild(oldPlayer, DOM.musicPlayer);

  // 更新DOM引用
  DOM.musicPlayer = oldPlayer;

  // 重新添加事件监听器
  DOM.musicPlayer.addEventListener("ended", handleMusicEnded);

  AppState.currentMusicFile = "";
  DOM.playMusicButton.textContent = "播放音乐";
  DOM.currentMusic.textContent = "抽取音乐";
  saveState();

  showToast("音乐已清除", "info");
}

// 音乐结束事件处理
function handleMusicEnded() {
  DOM.playMusicButton.textContent = "播放音乐";
  AppState.isMusicPaused = false;
}
