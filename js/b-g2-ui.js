/**
 * 一年内组比赛界面 - 上半场（UI模块）
 * 处理UI更新和交互
 */

// 更新选手列表
function updatePlayerList() {
  DOM.playerList.innerHTML = "";
  AppState.players.forEach((player, index) => {
    const li = document.createElement("li");
    li.textContent = player.name;
    // 添加动画延迟变量
    li.style.setProperty("--player-index", index);
    // 为当前选手添加高亮样式
    if (index === AppState.currentPlayerIndex) {
      li.classList.add("current");
    }
    DOM.playerList.appendChild(li);
  });
}

// 更新技名列表
function updateTrickList() {
  DOM.trickList.innerHTML = "";
  AppState.tricks.forEach((trick, index) => {
    const li = document.createElement("li");
    li.textContent = trick.name;
    // 添加动画延迟变量
    li.style.setProperty("--trick-index", index);
    // 添加浮动动画效果
    li.addEventListener("click", () => {
      li.classList.toggle("crossed");
      saveState(); // 保存技名状态
    });
    DOM.trickList.appendChild(li);
  });

  // 技名列表更新后，尝试恢复被画叉的技名
  setTimeout(() => {
    restoreCrossedTricks();
  }, 100);
}

// 显示提示信息
function showToast(message, type = "info", duration = 3000) {
  const toast = document.createElement("div");
  toast.classList.add(`${type}-toast`);
  toast.innerText = message;
  document.body.appendChild(toast);

  // 自动移除
  setTimeout(() => {
    if (document.body.contains(toast)) {
      document.body.removeChild(toast);
    }
  }, duration);
}

// 随机排序选手
function shufflePlayers() {
  AppState.players = [...AppState.players].sort(() => Math.random() - 0.5);
  AppState.currentPlayerIndex = 0;
  DOM.currentPlayer.textContent = AppState.players[0].name;
  updatePlayerList();
  saveState();

  showToast("选手已随机排序", "success");
}

// 抽取技名
function drawRandomTrick() {
  const availableTricks = Array.from(DOM.trickList.children).filter(
    (li) => !li.classList.contains("crossed")
  );

  if (availableTricks.length === 0) {
    showToast("没有可用的技名", "warning");
    return;
  }

  const randomTrick =
    availableTricks[Math.floor(Math.random() * availableTricks.length)];
  DOM.currentTrick.textContent = randomTrick.textContent;
  saveState();

  // 添加视觉反馈
  randomTrick.classList.add("highlight");
  setTimeout(() => {
    randomTrick.classList.remove("highlight");
  }, 1000);
}

// 抽取音乐
function drawRandomMusic() {
  fetch("../resource/json/musics_list-2.json")
    .then((response) => response.json())
    .then((musics) => {
      const randomMusic = musics[Math.floor(Math.random() * musics.length)];
      DOM.currentMusic.textContent = randomMusic;
      // 正确设置音乐文件路径
      AppState.currentMusicFile = `../resource/musics/1yearminus/${randomMusic}`;
      console.log("设置音乐路径:", AppState.currentMusicFile);

      // 确保音乐文件存在
      DOM.musicPlayer.src = AppState.currentMusicFile;
      // 预加载音乐
      DOM.musicPlayer.load();
      saveState();

      // 显示提示
      showToast(`已选择音乐: ${randomMusic.replace(/\.mp3$/, "")}`, "success");
    })
    .catch((error) => {
      console.error("加载音乐列表失败:", error);
      DOM.currentMusic.textContent = "无法加载音乐";
      showToast("无法加载音乐列表", "error");
    });
}

// 启动音乐播放模式
function startMusicMode() {
  // 立即添加音乐播放模式类以实现透明效果
  document.body.classList.add("music-playing-mode");
  console.log("进入音乐播放模式");

  // 创建全屏遮罩
  const overlay = document.createElement("div");
  overlay.classList.add("battle-overlay");
  document.body.appendChild(overlay);

  // 创建Battle Start效果并立即添加到DOM
  const battleStart = document.createElement("div");
  battleStart.classList.add("battle-start");
  // 先添加到DOM，再设置内容，确保动画效果显示
  document.body.appendChild(battleStart);

  // 添加震动效果
  setTimeout(() => {
    document.body.classList.add("shake");
    setTimeout(() => {
      document.body.classList.remove("shake");
    }, 500);
  }, 50);

  // 分步骤显示文字 - 元素已在DOM中，只需改变内容
  setTimeout(() => {
    battleStart.innerText = "B";
  }, 200);

  setTimeout(() => {
    battleStart.innerText = "BA";
  }, 300);
  setTimeout(() => {
    battleStart.innerText = "BAT";
  }, 400);
  setTimeout(() => {
    battleStart.innerText = "BATT";
  }, 500);
  setTimeout(() => {
    battleStart.innerText = "BATTL";
  }, 600);
  setTimeout(() => {
    battleStart.innerText = "BATTLE";
  }, 700);
  setTimeout(() => {
    battleStart.innerText = "BATTLE ";
  }, 800);
  setTimeout(() => {
    battleStart.innerText = "BATTLE S";
  }, 900);
  setTimeout(() => {
    battleStart.innerText = "BATTLE ST";
  }, 1000);
  setTimeout(() => {
    battleStart.innerText = "BATTLE STA";
  }, 1100);
  setTimeout(() => {
    battleStart.innerText = "BATTLE STAR";
  }, 1200);

  setTimeout(() => {
    battleStart.innerText = "BATTLE START";
    battleStart.classList.add("shake");
  }, 1300);

  // 在动画结束后移除元素并播放音乐 - 延长到4500毫秒
  setTimeout(() => {
    if (document.body.contains(battleStart)) {
      document.body.removeChild(battleStart);

      // 移除遮罩
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }

      // 添加点击任意位置停止的提示
      const clickToStop = document.createElement("div");
      clickToStop.classList.add("click-to-stop");
      clickToStop.innerText = "点击任意位置停止";
      clickToStop.id = "click-to-stop-hint";
      document.body.appendChild(clickToStop);

      // 播放音乐
      DOM.musicPlayer.currentTime = 0;
      DOM.musicPlayer.play();
      DOM.playMusicButton.textContent = "停止播放音乐";
      DOM.musicPlayer.style.display = "block";

      // 设置音乐播放状态
      AppState.isMusicPlaying = true;

      // 确保类仍然存在，以防在动画过程中被移除
      if (!document.body.classList.contains("music-playing-mode")) {
        document.body.classList.add("music-playing-mode");
      }

      // 添加音乐结束事件监听
      DOM.musicPlayer.onended = function () {
        stopMusicMode();
      };

      // 添加点击页面停止音乐的事件监听
      document.addEventListener("click", stopMusicOnClick);
    }
  }, 4500); //动画时长 4500ms
}

// 停止音乐播放模式
function stopMusicMode() {
  // 停止音乐
  DOM.musicPlayer.pause();
  DOM.musicPlayer.currentTime = 0;

  // 还原按钮文字
  DOM.playMusicButton.textContent = "播放音乐";

  // 移除透明模式
  document.body.classList.remove("music-playing-mode");

  // 移除点击事件监听
  document.removeEventListener("click", stopMusicOnClick);

  // 移除提示文字
  const hint = document.getElementById("click-to-stop-hint");
  if (hint && hint.parentNode) {
    hint.parentNode.removeChild(hint);
  }

  // 更新音乐播放状态
  AppState.isMusicPlaying = false;

  console.log("退出音乐播放模式");
}

// 点击页面时停止音乐的处理函数
function stopMusicOnClick(event) {
  // 确保不是点击在音乐播放器或提示文本上
  if (
    !event.target.closest("#musicPlayer") &&
    !event.target.closest("#click-to-stop-hint") &&
    !event.target.closest("#playMusicButton")
  ) {
    console.log("页面点击，停止音乐");
    stopMusicMode();
  }
}

// 进入下一位选手
function goToNextPlayer() {
  AppState.currentPlayerIndex++;
  if (AppState.currentPlayerIndex < AppState.players.length) {
    DOM.currentPlayer.textContent =
      AppState.players[AppState.currentPlayerIndex].name;
    updatePlayerList();
    saveState();
  } else {
    // 如果已经是最后一个选手，提供进入排名页面的选项
    DOM.nextPlayerButton.textContent = "进入排名页面";
    DOM.nextPlayerButton.removeEventListener("click", goToNextPlayer);
    DOM.nextPlayerButton.addEventListener("click", () => {
      window.location.href = "ranking.html";
    });
  }
}
