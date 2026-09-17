/**
 * 一年内组比赛（battle-group2）— 前端组件（P4 插件化迁移）
 *
 * 由原多脚本按加载顺序并入同一模块闭包（core → data → ui → events），
 * 函数体逐行保留；全局函数/变量 → 模块闭包作用域。原 b-g2-core.js 的
 * DOMContentLoaded 初始化改为组件体内直接执行（kernel render 时调用；
 * 顶层 DOM/AppState/CACHE_KEY 缓存保持模块顶层求值，此时 DOM 已就绪）。
 * 原 data/ui 两文件重复定义的 drawRandomMusic，按脚本加载语义后声明者
 * （ui.js）生效；data.js 的早声明副本在经典脚本中本就被覆盖（死代码），
 * 模块严格模式不允许重复声明，故删除之（行为不变）。
 *
 * 迁移差异（行为零回归前提下）：
 *   1. 静态骨架监听（含 window beforeunload）一律 { signal }（AbortController）
 *      登记，cleanup 统一解绑；
 *   2. 音乐播放模式的 document 级监听与 audio 解绑进 cleanup；
 *   3. 跨模块跳转按 P3 约定改 /m/<id>（原 "ranking.html" 为平铺 HTML 时代路径，
 *      模块化后 404）。
 *
 * 持久化继续用原生 fetch（/api/battle-group2-process 端点）与原 localStorage
 * key，保持行为零回归；ctx 仅为后续可选用途保留（组件第三参）。
 */
/**
 * 一年内组比赛界面 - 上半场（核心模块）
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
};

const FEATURE_TOGGLE_KEYS = {
  group2DrawTrick: "feature_group2_draw_trick_enabled",
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

// 缓存键名定义
const CACHE_KEY = {
  PLAYERS: "battle_group2_players",
  CURRENT_INDEX: "battle_group2_current_index",
  CURRENT_TRICK: "battle_group2_current_trick",
  CURRENT_MUSIC: "battle_group2_current_music",
  CROSSED_TRICKS: "battle_group2_crossed_tricks",
};

// 主入口函数 - 页面加载完成时执行
// （原 DOMContentLoaded 初始化已移至文件末尾组件入口）

function applyFeatureToggles() {
  const drawTrickEnabled =
    localStorage.getItem(FEATURE_TOGGLE_KEYS.group2DrawTrick) !== "false";

  if (DOM.drawTrickButton) {
    DOM.drawTrickButton.style.display = drawTrickEnabled ? "" : "none";
  }

  if (DOM.currentTrick) {
    DOM.currentTrick.style.display = drawTrickEnabled ? "" : "none";
  }
}

/**
 * 一年内组比赛界面 - 上半场（数据模块）
 * 处理数据加载和状态管理
 */

// 加载所有数据
function loadData() {
  // 读取选手数据
  fetch("/resource/json/player2.json")
    .then((response) => {
      if (!response.ok) throw new Error("无法加载player2.json");
      return response.json();
    })
    .then((data) => {
      console.log("从player2.json加载选手数据:", data);
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
      alert("无法加载选手数据，请检查网络连接");
    });

  // 读取技名数据
  fetch("/resource/json/tricks_for_group2.json")
    .then((response) => response.json())
    .then((data) => {
      AppState.tricks = data;
      updateTrickList();
    })
    .catch((error) => {
      console.error("加载技名数据失败:", error);
    });

  // 读取音乐列表数据 - 从musics_list_2.json加载
  fetch("/resource/json/musics_list_2.json")
    .then((response) => {
      if (!response.ok) throw new Error("无法加载musics_list_2.json");
      return response.json();
    })
    .then((data) => {
      console.log("从musics_list_2.json加载音乐数据:", data);
      AppState.musicList = data;
    })
    .catch((error) => {
      console.error("加载音乐列表失败:", error);
    });
}

// 保存状态到本地文件和浏览器缓存
function saveState() {
  try {
    const stateData = {
      players: AppState.players,
      currentIndex: AppState.currentPlayerIndex,
      currentTrick: DOM.currentTrick.textContent,
      currentMusic: DOM.currentMusic.textContent,
      crossedTricks: Array.from(DOM.trickList.children)
        .filter((li) => li.classList.contains("crossed"))
        .map((li) => li.textContent),
    };

    // 保存到浏览器缓存
    localStorage.setItem(CACHE_KEY.PLAYERS, JSON.stringify(AppState.players));
    localStorage.setItem(CACHE_KEY.CURRENT_INDEX, AppState.currentPlayerIndex);
    localStorage.setItem(CACHE_KEY.CURRENT_TRICK, DOM.currentTrick.textContent);
    localStorage.setItem(CACHE_KEY.CURRENT_MUSIC, DOM.currentMusic.textContent);
    localStorage.setItem(
      CACHE_KEY.CROSSED_TRICKS,
      JSON.stringify(stateData.crossedTricks)
    );

    // 保存到服务器
    fetch("/api/battle-group2-process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(stateData),
    })
      .then((response) => {
        if (!response.ok) throw new Error("保存进度失败");
        return response.text();
      })
      .then(() => console.log("比赛状态已保存到服务器"))
      .catch((error) => console.error("服务器保存失败:", error));

    console.log("比赛状态已保存到本地");
  } catch (error) {
    console.error("保存状态失败:", error);
  }
}

// 尝试从服务器加载状态，如果失败则从本地缓存恢复
function loadState() {
  fetch("/resource/json/battle-group2-process.json")
    .then((response) => {
      if (!response.ok) throw new Error("无法从服务器加载进度");
      return response.json();
    })
    .then((data) => {
      console.log("成功从服务器加载进度:", data);
      restoreFromData(data);
    })
    .catch((error) => {
      console.error("服务器加载失败，尝试从本地恢复:", error);
      restoreFromLocalStorage();
    });
}

// 从数据对象恢复状态
function restoreFromData(data) {
  if (!data) return false;

  try {
    // 恢复玩家列表
    if (data.players && data.players.length > 0) {
      AppState.players = data.players;
      updatePlayerList();
    }

    // 恢复当前索引
    if (
      typeof data.currentIndex === "number" &&
      data.currentIndex >= 0 &&
      data.currentIndex < AppState.players.length
    ) {
      AppState.currentPlayerIndex = data.currentIndex;
      DOM.currentPlayer.textContent =
        AppState.players[AppState.currentPlayerIndex].name;
    }

    // 恢复当前技能
    if (data.currentTrick) {
      DOM.currentTrick.textContent = data.currentTrick;
    }

    // 恢复当前音乐
    if (data.currentMusic) {
      DOM.currentMusic.textContent = data.currentMusic;
      // 确保音乐文件路径正确
      const musicFileName = data.currentMusic;
      AppState.currentMusicFile = `/resource/musics/1yearminus/${musicFileName}`;
      DOM.musicPlayer.src = AppState.currentMusicFile;
    }

    // 恢复划掉的技能
    if (data.crossedTricks && data.crossedTricks.length > 0) {
      setTimeout(() => {
        restoreCrossedTricks(data.crossedTricks);
      }, 500); // 延迟执行，确保技能列表已加载
    }

    return true;
  } catch (error) {
    console.error("恢复进度数据失败:", error);
    return false;
  }
}

// 从本地存储恢复状态
function restoreFromLocalStorage() {
  try {
    // 检查是否有缓存数据
    if (!localStorage.getItem(CACHE_KEY.PLAYERS)) {
      console.log("没有找到本地缓存数据");
      return false;
    }

    // 恢复选手列表
    const cachedPlayers = JSON.parse(localStorage.getItem(CACHE_KEY.PLAYERS));
    if (cachedPlayers && cachedPlayers.length > 0) {
      AppState.players = cachedPlayers;
      updatePlayerList();
    }

    // 恢复当前选手索引
    const cachedIndex = parseInt(localStorage.getItem(CACHE_KEY.CURRENT_INDEX));
    if (
      !isNaN(cachedIndex) &&
      cachedIndex >= 0 &&
      cachedIndex < AppState.players.length
    ) {
      AppState.currentPlayerIndex = cachedIndex;
      DOM.currentPlayer.textContent =
        AppState.players[AppState.currentPlayerIndex].name;
    }

    // 恢复当前技名
    const cachedTrick = localStorage.getItem(CACHE_KEY.CURRENT_TRICK);
    if (cachedTrick) {
      DOM.currentTrick.textContent = cachedTrick;
    }

    // 恢复当前音乐
    const cachedMusic = localStorage.getItem(CACHE_KEY.CURRENT_MUSIC);
    if (cachedMusic) {
      DOM.currentMusic.textContent = cachedMusic;
      // 确保音乐文件路径正确设置
      AppState.currentMusicFile = `/resource/musics/1yearminus/${cachedMusic}`;
      DOM.musicPlayer.src = AppState.currentMusicFile;
    }

    // 恢复被画叉的技名
    setTimeout(() => {
      restoreCrossedTricks();
    }, 500);

    console.log("比赛状态已从本地恢复");
    return true;
  } catch (error) {
    console.error("恢复本地状态失败:", error);
    return false;
  }
}


// 播放当前音乐
function playCurrentMusic() {
  if (!AppState.currentMusicFile) {
    showToast("请先抽取音乐", "warning");
    return false;
  }

  try {
    // 确保音乐播放器的源已正确设置
    if (DOM.musicPlayer.src !== AppState.currentMusicFile) {
      DOM.musicPlayer.src = AppState.currentMusicFile;
    }

    // 播放音乐
    DOM.musicPlayer
      .play()
      .then(() => {
        console.log("音乐播放中:", DOM.currentMusic.textContent);
        showToast("音乐播放中", "success");
      })
      .catch((error) => {
        console.error("音乐播放失败:", error);
        showToast("音乐播放失败，请重试", "error");
      });

    return true;
  } catch (error) {
    console.error("音乐播放出错:", error);
    showToast("音乐播放出错", "error");
    return false;
  }
}

// 恢复被画叉的技名
function restoreCrossedTricks(crossedTricks) {
  try {
    if (!crossedTricks) {
      crossedTricks = JSON.parse(
        localStorage.getItem(CACHE_KEY.CROSSED_TRICKS)
      );
    }

    if (crossedTricks && crossedTricks.length > 0) {
      Array.from(DOM.trickList.children).forEach((li) => {
        if (crossedTricks.includes(li.textContent)) {
          li.classList.add("crossed");
        }
      });
    }
  } catch (error) {
    console.error("恢复技名状态失败:", error);
  }
}

// 清除缓存并初始化数据
function clearCache() {
  try {
    // 先确认用户真的要清除
    if (!confirm("确定要清除所有缓存数据吗？此操作将重置所有比赛进度。")) {
      return;
    }

    // 显示进度提示
    const loadingMsg = document.createElement("div");
    loadingMsg.classList.add("loading-toast");
    loadingMsg.innerText = "正在初始化比赛数据...";
    document.body.appendChild(loadingMsg);

    // 清除浏览器缓存
    localStorage.removeItem(CACHE_KEY.PLAYERS);
    localStorage.removeItem(CACHE_KEY.CURRENT_INDEX);
    localStorage.removeItem(CACHE_KEY.CURRENT_TRICK);
    localStorage.removeItem(CACHE_KEY.CURRENT_MUSIC);
    localStorage.removeItem(CACHE_KEY.CROSSED_TRICKS);

    // 获取原始选手数据
    fetch("/resource/json/player2.json")
      .then((response) => {
        if (!response.ok) throw new Error("无法加载选手数据");
        return response.json();
      })
      .then((data) => {
        // 保存原始选手列表
        const originalPlayerList = data;

        // 准备默认的初始化数据 - 只保留选手列表，其他置空
        const defaultData = {
          players: originalPlayerList,
          currentIndex: 0,
          currentTrick: "",
          currentMusic: "",
          crossedTricks: [],
        };

        // 清除并初始化服务器缓存
        return fetch("/api/battle-group2-process", {
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
        if (AppState.originalPlayers.length > 0) {
          AppState.players = [...AppState.originalPlayers];
          AppState.currentPlayerIndex = 0;
          DOM.currentPlayer.textContent = AppState.players[0].name;
          updatePlayerList();
        }

        // 重置其他显示
        DOM.currentTrick.textContent = "";
        DOM.currentMusic.textContent = "";
        DOM.musicPlayer.src = "";
        AppState.currentMusicFile = "";

        // 移除加载提示
        if (document.body.contains(loadingMsg)) {
          document.body.removeChild(loadingMsg);
        }

        // 显示成功提示
        showToast("比赛数据已初始化", "success");

        // 更新技名列表，清除所有交叉状态
        updateTrickList();
      })
      .catch((error) => {
        console.error("初始化服务器数据失败:", error);

        // 移除加载提示
        if (document.body.contains(loadingMsg)) {
          document.body.removeChild(loadingMsg);
        }

        // 显示错误提示
        showToast("初始化服务器数据失败: " + error.message, "error");
      });
  } catch (error) {
    console.error("清除缓存失败:", error);
    alert("清除缓存失败: " + error.message);
  }
}

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
  if (localStorage.getItem("feature_group2_draw_trick_enabled") === "false") {
    showToast("抽取动作功能已在设置页关闭", "info");
    return;
  }

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
  fetch("/resource/json/musics_list_2.json")
    .then((response) => response.json())
    .then((musics) => {
      if (!musics || musics.length === 0) {
        showToast("音乐列表为空", "error");
        return;
      }

      // 禁用抽取按钮，防止重复点击
      if (DOM.drawMusicButton) DOM.drawMusicButton.disabled = true;

      // 闪现效果参数
      const flashCount = 15;
      const flashInterval = 80;
      let currentFlash = 0;

      // 闪现动画
      const flashTimer = setInterval(() => {
        const randomIdx = Math.floor(Math.random() * musics.length);
        const flashMusic = musics[randomIdx];

        if (DOM.currentMusic) {
          DOM.currentMusic.textContent = flashMusic.replace(/\.mp3$/, "");
          DOM.currentMusic.style.color = "#fbbf24"; // 闪现时为黄色
        }

        currentFlash++;

        if (currentFlash >= flashCount) {
          clearInterval(flashTimer);

          // 最终随机选择
          const finalIdx = Math.floor(Math.random() * musics.length);
          const randomMusic = musics[finalIdx];

          // 更新UI
          if (DOM.currentMusic) {
            DOM.currentMusic.textContent = randomMusic.replace(/\.mp3$/, "");
            DOM.currentMusic.style.color = "#10b981"; // 最终结果为绿色
          }

          // 正确设置音乐文件路径
          AppState.currentMusicFile = `/resource/musics/1yearminus/${randomMusic}`;
          console.log("设置音乐路径:", AppState.currentMusicFile);

          // 确保音乐文件存在
          DOM.musicPlayer.src = AppState.currentMusicFile;
          // 预加载音乐
          DOM.musicPlayer.load();
          saveState();

          // 启用按钮
          if (DOM.drawMusicButton) DOM.drawMusicButton.disabled = false;

          showToast(`已选择音乐: ${randomMusic.replace(/\.mp3$/, "")}`, "success");
        }
      }, flashInterval);
    })
    .catch((error) => {
      console.error("加载音乐列表失败:", error);
      if (DOM.currentMusic) {
        DOM.currentMusic.textContent = "无法加载音乐";
      }
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

      // 添加双击任意位置停止的提示
      const clickToStop = document.createElement("div");
      clickToStop.classList.add("click-to-stop");
      clickToStop.innerText = "双击任意位置停止";
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
      window.location.href = "/m/ranking";
    });
  }
}

/**
 * 一年内组比赛界面 - 上半场（事件模块）
 * 处理事件监听和回调
 */

// 设置事件监听器
function setupEventListeners(signal) {
  // 随机排序选手按钮
  DOM.shuffleButton.addEventListener("click", shufflePlayers, { signal });

  // 抽取技名按钮
  DOM.drawTrickButton.addEventListener("click", drawRandomTrick, { signal });

  // 抽取音乐按钮
  DOM.drawMusicButton.addEventListener("click", drawRandomMusic, { signal });

  // 播放音乐按钮
  DOM.playMusicButton.addEventListener("click", handlePlayMusic, { signal });

  // 下一位选手按钮
  DOM.nextPlayerButton.addEventListener("click", goToNextPlayer, { signal });

  // 返回主页按钮
  DOM.homeButton.addEventListener("click", () => {
    saveState(); // 保存状态
    window.location.href = "index.html";
  }, { signal });

  // 清除缓存按钮
  DOM.clearCacheButton.addEventListener("click", clearCache, { signal });
}

// 处理播放音乐按钮点击
function handlePlayMusic() {
  console.log("点击播放按钮, 当前文件:", AppState.currentMusicFile);

  if (!AppState.currentMusicFile) {
    showToast("请先抽取音乐", "warning");
    return;
  }

  try {
    // 如果已在播放模式，先停止
    if (AppState.isMusicPlaying) {
      stopMusicMode();
      return;
    }

    if (DOM.musicPlayer.paused) {
      // 启动音乐播放动画模式，而不是直接播放
      startMusicMode();
    } else {
      // 暂停音乐
      DOM.musicPlayer.pause();
      DOM.playMusicButton.textContent = "播放音乐";
      console.log("音乐已暂停");
    }
  } catch (error) {
    console.error("播放音乐错误:", error);
    showToast("播放音乐时出错", "error");
  }
}

/* =================================================================
 *  组件入口（原 b-g2-core.js DOMContentLoaded 初始化，kernel render 时执行）
 * ================================================================= */
export function battleGroup2Component(el, meta, ctx) {
  // cleanup 契约：静态骨架节点的全部监听经 signal 登记，重渲染时 abort 统一解绑，
  // 防止不刷新页面的重复 render 造成双绑双触发
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

  console.log("初始化一年内组比赛界面");

  // 隐藏音乐播放进度
  DOM.musicPlayer.style.display = "none";

  // 应用功能开关
  applyFeatureToggles();

  // 加载数据
  loadData();

  // 设置事件监听器
  setupEventListeners(signal);

  // 添加离开页面前保存
  window.addEventListener("beforeunload", () => {
    saveState();
  }, { signal });

  return () => cleanupBattleGroup2Page(bindAbort);
}

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用）
 * ================================================================= */
function cleanupBattleGroup2Page(bindAbort) {
  // signal 登记的静态骨架监听（按钮/window beforeunload）统一解绑
  if (bindAbort) bindAbort.abort();

  // 音乐播放模式的 document 级监听与 audio 解绑（P3 定稿约定）
  document.removeEventListener("click", stopMusicOnClick);
  AppState.isMusicPlaying = false;
  document.body.classList.remove("music-playing-mode");

  const player = document.getElementById("musicPlayer");
  if (player) {
    player.onended = null;
    player.pause();
    try { player.currentTime = 0; } catch (e) { /* 未加载媒体时可能抛错，忽略 */ }
  }
}
