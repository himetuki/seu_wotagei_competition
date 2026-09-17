/**
 * 一年内组比赛第二章节（battle-group2-2）— 前端组件（P4 插件化迁移）
 *
 * 由原多脚本按加载顺序并入同一模块闭包（core → ui → data → events），
 * 函数体逐行保留；全局函数/变量 → 模块闭包作用域。原 b-g2-2-core.js 的
 * DOMContentLoaded 初始化改为组件体内直接执行（kernel render 时调用；
 * 顶层 DOM/AppState/CACHE_KEY 缓存保持模块顶层求值，此时 DOM 已就绪）。
 *
 * 迁移差异（行为零回归前提下）：
 *   1. 静态骨架监听（含 audio ended、window beforeunload）一律 { signal }
 *      （AbortController）登记，cleanup 统一解绑；
 *   2. 音乐播放模式的 document 级监听与 audio 解绑进 cleanup；
 *
 * 持久化继续用原生 fetch（/api/battle-group2-2-process 端点）与原 localStorage
 * key，保持行为零回归；ctx 仅为后续可选用途保留（组件第三参）。
 */
/**
 * 一年内组比赛界面 - 第二章节（核心模块）
 * 包含全局变量和基本初始化
 */

// 全局DOM元素引用
const DOM = {
  playerList: document.getElementById("playerList"),
  trickList: document.getElementById("trickList"),
  currentPlayer: document.getElementById("currentPlayer"),
  currentTrick: document.getElementById("currentTrick"),
  currentMusic: document.getElementById("currentMusic"),
  musicPlayer: document.getElementById("musicPlayer"),
  nextPlayerButton: document.getElementById("nextPlayerButton"),
  playMusicButton: document.getElementById("playMusicButton"),
  shuffleButton: document.getElementById("shuffleButton"),
  drawTrickButton: document.getElementById("drawTrickButton"),
  drawMusicButton: document.getElementById("drawMusicButton"),
  clearCacheButton: document.getElementById("clearCacheButton"),
  homeButton: document.getElementById("homeButton"),
  clearMusicButton: document.getElementById("clearMusicButton"),
};

// 全局状态
const AppState = {
  players: [],
  tricks: [],
  currentPlayerIndex: 0,
  currentMusicFile: "",
  isMusicPaused: false,
  isMusicPlaying: false,
  originalPlayers: [],
};

// 缓存键名定义 - 使用不同的键以避免与原页面冲突
const CACHE_KEY = {
  PLAYERS: "battle_group2_2_players",
  CURRENT_INDEX: "battle_group2_2_current_index",
  CURRENT_TRICK: "battle_group2_2_current_trick",
  CURRENT_MUSIC: "battle_group2_2_current_music",
  CROSSED_TRICKS: "battle_group2_2_crossed_tricks",
};

// 主入口函数 - 页面加载完成时执行
// （原 DOMContentLoaded 初始化已移至文件末尾组件入口）

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
  const musicUrl = "/resource/json/musics_list_2.json";
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

      // 禁用抽取按钮，防止重复点击
      const drawBtn = document.getElementById("drawMusicButton") || DOM.drawMusicButton;
      if (drawBtn) drawBtn.disabled = true;

      // 闪现效果参数
      const flashCount = 15;
      const flashInterval = 80;
      let currentFlash = 0;

      // 闪现动画
      const flashTimer = setInterval(() => {
        const randomIdx = Math.floor(Math.random() * data.length);
        const flashMusic = data[randomIdx];

        if (DOM.currentMusic) {
          DOM.currentMusic.textContent = flashMusic.replace(/\.mp3$/, "");
          DOM.currentMusic.style.color = "#fbbf24"; // 闪现时为黄色
        }

        currentFlash++;

        if (currentFlash >= flashCount) {
          clearInterval(flashTimer);

          // 最终随机选择
          const randomIndex = Math.floor(Math.random() * data.length);
          const selectedMusic = data[randomIndex];

          console.log("已选择音乐:", selectedMusic);

          // 更新显示 - 可能需要截取文件名以改善显示
          const displayName = selectedMusic.replace(/\.mp3$/, "");
          if (DOM.currentMusic) {
            DOM.currentMusic.textContent = displayName;
            DOM.currentMusic.style.color = "#10b981"; // 最终结果为绿色
          }

          // 设置音乐文件 - 不做任何编码处理，保留原始文件名
          AppState.currentMusicFile = selectedMusic;

          // 这里不预加载音乐，避免404错误
          DOM.playMusicButton.textContent = "播放音乐";
          AppState.isMusicPaused = false;
          AppState.isMusicPlaying = false;

          // 保存状态
          saveState();

          // 启用按钮
          if (drawBtn) drawBtn.disabled = false;

          showToast(`已抽取音乐: ${displayName}`, "success");
        }
      }, flashInterval);
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

/**
 * 一年内组比赛界面 - 上半场（数据模块）
 * 处理数据加载和状态管理
 */

// 加载所有数据
function loadData() {
  loadPlayerData();
  loadTrickData();
}

// 加载选手数据
function loadPlayerData() {
  fetch("/resource/json/player2.json")
    .then((response) => response.json())
    .then((data) => {
      // 保存原始选手列表
      AppState.originalPlayers = [...data];

      // 尝试加载保存的状态
      loadState();

      // 如果玩家列表为空，则使用原始数据
      if (AppState.players.length === 0) {
        AppState.players = [...AppState.originalPlayers];
        updatePlayerList();
        if (AppState.players.length > 0) {
          DOM.currentPlayer.textContent = AppState.players[0].name;
        }
      }
    })
    .catch((error) => {
      console.error("加载player2.json失败:", error);
      showToast("无法加载选手数据，请检查网络连接", "error");
    });
}

// 加载技名数据 - 修改为使用tricks.json
function loadTrickData() {
  fetch("/resource/json/tricks.json")
    .then((response) => response.json())
    .then((data) => {
      AppState.tricks = data;
      updateTrickList();
    })
    .catch((error) => {
      console.error("加载tricks.json失败:", error);
      showToast("无法加载技名数据，请检查网络连接", "error");
    });
}

// 保存状态到本地文件和浏览器缓存
function saveState() {
  try {
    const stateData = {
      players: AppState.players,
      currentIndex: AppState.currentPlayerIndex,
      currentTrick: DOM.currentTrick ? DOM.currentTrick.textContent : "",
      currentMusic: DOM.currentMusic ? DOM.currentMusic.textContent : "",
      crossedTricks: DOM.trickList
        ? Array.from(DOM.trickList.children)
            .filter((li) => li.classList.contains("crossed"))
            .map((li) => li.textContent)
        : [],
    };

    // 保存到浏览器缓存
    localStorage.setItem(CACHE_KEY.PLAYERS, JSON.stringify(AppState.players));
    localStorage.setItem(CACHE_KEY.CURRENT_INDEX, AppState.currentPlayerIndex);
    localStorage.setItem(CACHE_KEY.CURRENT_TRICK, DOM.currentTrick ? DOM.currentTrick.textContent : "");
    localStorage.setItem(CACHE_KEY.CURRENT_MUSIC, DOM.currentMusic ? DOM.currentMusic.textContent : "");
    localStorage.setItem(
      CACHE_KEY.CROSSED_TRICKS,
      JSON.stringify(stateData.crossedTricks)
    );

    // 保存到服务器
    saveStateToServer(stateData);
  } catch (error) {
    console.error("保存状态失败:", error);
  }
}

// 保存状态到服务器
function saveStateToServer(stateData) {
  fetch("/api/battle-group2-2-process", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(stateData),
  })
    .then((response) => {
      if (!response.ok) throw new Error("保存状态失败");
      console.log("状态已保存到服务器");
    })
    .catch((error) => {
      console.error("保存到服务器失败:", error);
    });
}

// 从本地和服务器加载状态
function loadState() {
  // 先尝试从浏览器缓存加载
  try {
    const savedPlayers = localStorage.getItem(CACHE_KEY.PLAYERS);
    const savedIndex = localStorage.getItem(CACHE_KEY.CURRENT_INDEX);
    const savedTrick = localStorage.getItem(CACHE_KEY.CURRENT_TRICK);
    const savedMusic = localStorage.getItem(CACHE_KEY.CURRENT_MUSIC);
    const savedCrossedTricks = localStorage.getItem(CACHE_KEY.CROSSED_TRICKS);

    // 恢复选手列表
    if (savedPlayers) {
      AppState.players = JSON.parse(savedPlayers);
      updatePlayerList();
    }

    // 恢复当前选手索引
    if (savedIndex) {
      AppState.currentPlayerIndex = parseInt(savedIndex, 10);
      if (
        AppState.players.length > 0 &&
        AppState.currentPlayerIndex < AppState.players.length
      ) {
        DOM.currentPlayer.textContent =
          AppState.players[AppState.currentPlayerIndex].name;
      }
    }

    // 恢复当前技名
    if (savedTrick && DOM.currentTrick) {
      DOM.currentTrick.textContent = savedTrick;
    }

    // 恢复当前音乐
    if (savedMusic && DOM.currentMusic) {
      DOM.currentMusic.textContent = savedMusic;
    }

    // 恢复已划线的技名
    if (savedCrossedTricks) {
      try {
        const crossedTricks = JSON.parse(savedCrossedTricks);
        updateTrickList();
        // 将保存的已划线技能标记为划线
        setTimeout(() => {
          Array.from(DOM.trickList.children).forEach((li) => {
            if (crossedTricks.includes(li.textContent)) {
              li.classList.add("crossed");
            }
          });
        }, 100);
      } catch (e) {
        console.error("解析已划线技能失败:", e);
      }
    }

    // 如果本地缓存为空，则尝试从服务器加载
    if (!savedPlayers) {
      loadStateFromServer();
    }
  } catch (error) {
    console.error("从本地加载状态失败:", error);
    // 尝试从服务器加载
    loadStateFromServer();
  }
}

// 从服务器加载状态
function loadStateFromServer() {
  fetch("/api/battle-group2-2-process")
    .then((response) => {
      if (!response.ok) throw new Error("无法从服务器加载状态");
      return response.json();
    })
    .then((data) => {
      // 恢复选手列表
      if (data && data.players && data.players.length > 0) {
        AppState.players = data.players;
        updatePlayerList();
      }

      // 恢复当前选手索引
      if (data.currentIndex !== undefined) {
        AppState.currentPlayerIndex = data.currentIndex;
        if (
          AppState.players.length > 0 &&
          AppState.currentPlayerIndex < AppState.players.length
        ) {
          DOM.currentPlayer.textContent =
            AppState.players[AppState.currentPlayerIndex].name;
        }
      }

      // 恢复当前技名和音乐
      if (data.currentTrick && DOM.currentTrick) {
        DOM.currentTrick.textContent = data.currentTrick;
      }

      if (data.currentMusic && DOM.currentMusic) {
        DOM.currentMusic.textContent = data.currentMusic;
      }

      // 恢复已划线的技名
      if (data.crossedTricks && Array.isArray(data.crossedTricks)) {
        updateTrickList();
        // 将保存的已划线技能标记为划线
        setTimeout(() => {
          Array.from(DOM.trickList.children).forEach((li) => {
            if (data.crossedTricks.includes(li.textContent)) {
              li.classList.add("crossed");
            }
          });
        }, 100);
      }
    })
    .catch((error) => {
      console.error("从服务器加载状态失败:", error);
    });
}

// 清除缓存并初始化数据
function clearCache() {
  try {
    // 先确认用户真的要清除
    if (!confirm("确定要清除所有缓存数据吗？此操作将重置所有比赛进度。")) {
      return;
    }

    // 显示进度提示
    showToast("正在初始化比赛数据...", "loading");

    // 清除浏览器缓存
    localStorage.removeItem(CACHE_KEY.PLAYERS);
    localStorage.removeItem(CACHE_KEY.CURRENT_INDEX);
    localStorage.removeItem(CACHE_KEY.CURRENT_TRICK);
    localStorage.removeItem(CACHE_KEY.CURRENT_MUSIC);
    localStorage.removeItem(CACHE_KEY.CROSSED_TRICKS);

    // 获取原始选手数据
    let originalPlayerList = [];
    fetch("/resource/json/player2.json")
      .then((response) => {
        if (!response.ok) throw new Error("无法加载选手数据");
        return response.json();
      })
      .then((data) => {
        originalPlayerList = data;

        // 准备默认的初始化数据 - 只保留选手列表，其他置空
        const defaultData = {
          players: originalPlayerList,
          currentIndex: 0,
          currentTrick: "",
          currentMusic: "",
          crossedTricks: [],
        };

        // 清除并初始化服务器缓存
        return fetch("/api/battle-group2-2-process", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(defaultData),
        });
      })
      .then((response) => {
        if (!response.ok) throw new Error("初始化服务器数据失败");
        console.log("服务器数据已重置为初始状态");

        // 重置页面上的显示内容
        if (originalPlayerList.length > 0) {
          AppState.players = [...originalPlayerList];
          updatePlayerList();
          AppState.currentPlayerIndex = 0;
          DOM.currentPlayer.textContent = AppState.players[0].name;
        }

        // 重置其他显示
        if (DOM.currentTrick) {
          DOM.currentTrick.textContent = "";
        }
        if (DOM.currentMusic) {
          DOM.currentMusic.textContent = "";
        }
        if (DOM.musicPlayer) {
          DOM.musicPlayer.src = "";
        }
        AppState.currentMusicFile = "";

        // 移除加载提示
        hideToast();

        // 显示成功提示
        showToast("比赛数据已初始化", "success", 2000);

        // 更新技名列表，清除所有交叉状态
        updateTrickList();
      })
      .catch((error) => {
        console.error("初始化服务器数据失败:", error);

        // 移除加载提示并显示错误
        hideToast();
        showToast("初始化服务器数据失败: " + error.message, "error", 3000);
      });
  } catch (error) {
    console.error("清除缓存失败:", error);
    showToast("清除缓存失败: " + error.message, "error", 3000);
  }
}

/**
 * 一年内组比赛界面 - 第二章节（事件模块）
 * 管理事件监听器
 */

// 设置所有事件监听器
function setupEventListeners(signal) {
  // 随机排序选手
  if (document.getElementById("shuffleButton")) {
    document
      .getElementById("shuffleButton")
      .addEventListener("click", shufflePlayers, { signal });
  } else if (DOM.shuffleButton) {
    DOM.shuffleButton.addEventListener("click", shufflePlayers, { signal });
  }
  /*
  // 抽取技名
  if (document.getElementById("drawTrickButton")) {
    document
      .getElementById("drawTrickButton")
      .addEventListener("click", drawRandomTrick);
  } else if (DOM.drawTrickButton) {
    DOM.drawTrickButton.addEventListener("click", drawRandomTrick);
  }*/

  // 抽取音乐
  if (document.getElementById("drawMusicButton")) {
    document
      .getElementById("drawMusicButton")
      .addEventListener("click", drawRandomMusic, { signal });
  } else if (DOM.drawMusicButton) {
    DOM.drawMusicButton.addEventListener("click", drawRandomMusic, { signal });
  }

  // 播放音乐
  if (document.getElementById("playMusicButton")) {
    document
      .getElementById("playMusicButton")
      .addEventListener("click", toggleMusicPlayback, { signal });
  } else if (DOM.playMusicButton) {
    DOM.playMusicButton.addEventListener("click", toggleMusicPlayback, { signal });
  }

  // 下一个选手
  if (document.getElementById("nextPlayerButton")) {
    document
      .getElementById("nextPlayerButton")
      .addEventListener("click", goToNextPlayer, { signal });
  } else if (DOM.nextPlayerButton) {
    DOM.nextPlayerButton.addEventListener("click", goToNextPlayer, { signal });
  }

  // 音乐播放结束事件
  DOM.musicPlayer.addEventListener("ended", handleMusicEnded, { signal });

  // 清除缓存
  DOM.clearCacheButton.addEventListener("click", clearCache, { signal });

  // 返回主页
  DOM.homeButton.addEventListener("click", () => {
    saveState();
    window.location.href = "index.html";
  }, { signal });

  // 添加离开页面前保存
  window.addEventListener("beforeunload", saveState, { signal });

  // 查找清除音乐按钮并添加事件（如果存在）
  const clearMusicButton = document.getElementById("clearMusicButton");
  if (clearMusicButton) {
    clearMusicButton.addEventListener("click", clearMusic, { signal });
  }

  // 隐藏音乐播放进度
  DOM.musicPlayer.style.display = "none";
}

// 添加音乐播放模式功能
function startMusicMode() {
  // 添加音乐播放模式类
  document.body.classList.add("music-playing-mode");

  // 创建遮罩
  const overlay = document.createElement("div");
  overlay.classList.add("battle-overlay");
  document.body.appendChild(overlay);

  // 创建 Battle Start 动画
  const battleStart = document.createElement("div");
  battleStart.classList.add("battle-start");

  // 添加文字动画效果
  setTimeout(() => {
    battleStart.innerText = "B";
    document.body.appendChild(battleStart);
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
    battleStart.innerText = "BATTLE M";
  }, 800);

  setTimeout(() => {
    battleStart.innerText = "BATTLE MO";
  }, 900);

  setTimeout(() => {
    battleStart.innerText = "BATTLE MOD";
  }, 1000);

  setTimeout(() => {
    battleStart.innerText = "BATTLE MODE";
    battleStart.classList.add("shake");
  }, 1100);

  // 添加点击提示
  const clickToStop = document.createElement("div");
  clickToStop.classList.add("click-to-stop");
  clickToStop.innerText = "双击任意位置停止";
  clickToStop.id = "click-to-stop-hint";
  document.body.appendChild(clickToStop);

  // 动画结束后播放音乐
  setTimeout(() => {
    if (document.body.contains(battleStart)) {
      document.body.removeChild(battleStart);

      // 播放音乐
      DOM.musicPlayer.play();
      DOM.musicPlayer.style.display = "block";

      // 更新状态
      AppState.isMusicPlaying = true;

      // 添加事件监听
      document.addEventListener("click", handleDocumentClick);
    }
  }, 3000);
}

// 停止音乐播放模式
function stopMusicMode() {
  // 停止音乐
  DOM.musicPlayer.pause();
  DOM.musicPlayer.currentTime = 0;

  // 移除样式
  document.body.classList.remove("music-playing-mode");

  // 移除事件监听
  document.removeEventListener("click", handleDocumentClick);

  // 移除遮罩和提示
  const overlay = document.querySelector(".battle-overlay");
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }

  const hint = document.getElementById("click-to-stop-hint");
  if (hint && hint.parentNode) {
    hint.parentNode.removeChild(hint);
  }

  // 隐藏播放器
  DOM.musicPlayer.style.display = "none";

  // 更新状态
  AppState.isMusicPlaying = false;
  DOM.playMusicButton.textContent = "播放音乐";
}

// 处理页面点击事件 (用于音乐播放模式)
function handleDocumentClick(event) {
  if (AppState.isMusicPlaying) {
    // 确保不是点击播放器或提示
    if (
      !DOM.musicPlayer.contains(event.target) &&
      event.target.id !== "click-to-stop-hint" &&
      !event.target.closest("#playMusicButton")
    ) {
      stopMusicMode();
    }
  }
}

// 重写toggleMusicPlayback处理函数，支持音乐模式
function toggleMusicPlayback() {
  console.log("切换音乐播放状态, 当前文件:", AppState.currentMusicFile);

  if (!AppState.currentMusicFile) {
    showToast("请先抽取音乐", "warning");
    return;
  }

  if (DOM.musicPlayer.src && !DOM.musicPlayer.paused) {
    // 音乐正在播放，暂停它
    console.log("停止正在播放的音乐");
    stopMusicMode();
  } else if (DOM.musicPlayer.src && AppState.isMusicPaused) {
    // 音乐已暂停，继续播放
    console.log("继续播放已暂停的音乐");
    DOM.musicPlayer.play();
    AppState.isMusicPaused = false;
    DOM.playMusicButton.textContent = "暂停播放";
    DOM.musicPlayer.style.display = "block";
  } else {
    // 加载并播放新音乐 - 确保音乐路径正确
    console.log("正在加载新音乐:", AppState.currentMusicFile);

    try {
      // 重置播放器状态
      DOM.musicPlayer.pause();
      DOM.musicPlayer.currentTime = 0;

      // 处理特殊文件名 - 构建正确的音乐路径
      // 使用原始文件名，不进行URL编码
      const musicPath = `/resource/musics/1yearminus/${AppState.currentMusicFile}`;
      console.log("音乐完整路径:", musicPath);

      // 设置src之前先移除onended和onerror事件处理器
      DOM.musicPlayer.onended = null;
      DOM.musicPlayer.onerror = null;

      // 设置新的src
      DOM.musicPlayer.src = musicPath;

      // 先检查音乐文件是否存在
      fetch(musicPath, { method: "HEAD" })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`音乐文件不存在 (${response.status})`);
          }

          // 文件存在，可以安全播放
          console.log("音乐文件存在，准备播放");

          // 预加载一小段
          DOM.musicPlayer.load();

          // 设置错误处理
          DOM.musicPlayer.onerror = function () {
            console.error("音乐播放失败:", DOM.musicPlayer.error);
            stopMusicMode();
            showToast(`音乐无法播放: ${AppState.currentMusicFile}`, "error");
          };

          // 启动音乐播放模式
          startMusicMode();
        })
        .catch((error) => {
          console.error("音乐文件检查失败:", error);
          showToast(`音乐文件不可用: ${error.message}`, "error");

          // 尝试使用替代路径
          const alternativePath = `/resource/music/${AppState.currentMusicFile}`;
          console.log("尝试替代路径:", alternativePath);

          DOM.musicPlayer.src = alternativePath;
          DOM.musicPlayer.load();
          startMusicMode();
        });
    } catch (err) {
      console.error("播放音乐时发生错误:", err);
      showToast("播放音乐时出错", "error");
    }
  }
}

/* =================================================================
 *  组件入口（原 b-g2-2-core.js DOMContentLoaded 初始化，kernel render 时执行）
 * ================================================================= */
export function battleGroup22Component(el, meta, ctx) {
  // cleanup 契约：静态骨架节点的全部监听经 signal 登记，重渲染时 abort 统一解绑，
  // 防止不刷新页面的重复 render 造成双绑双触发
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

  console.log("初始化一年内组比赛界面 - 第二章节");

  // 加载数据
  loadData();

  // 设置事件监听器
  setupEventListeners(signal);

  return () => cleanupBattleGroup22Page(bindAbort);
}

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用）
 * ================================================================= */
function cleanupBattleGroup22Page(bindAbort) {
  // signal 登记的静态骨架监听（按钮/audio ended/window beforeunload）统一解绑
  if (bindAbort) bindAbort.abort();

  // 音乐播放模式的 document 级监听与 audio 解绑（P3 定稿约定）
  document.removeEventListener("click", handleDocumentClick);
  AppState.isMusicPlaying = false;
  document.body.classList.remove("music-playing-mode");

  const player = document.getElementById("musicPlayer");
  if (player) {
    player.onended = null;
    player.onerror = null;
    player.pause();
    try { player.currentTime = 0; } catch (e) { /* 未加载媒体时可能抛错，忽略 */ }
  }
}
