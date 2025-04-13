/**
 * 一年加组对战系统
 * 完全重构版 - 修复各种功能问题
 * 此文件功能已被拆分为多个模块，多模块JS文件目录为 js/bg1/
 * 其中包含的文件有bg1-core.js、bg1-data.js、bg1-ui.js、bg1-events.js、bg1-game.js
 */

// =============== 全局状态管理 ===============
const BattleState = {
  // 基础数据
  players: [],
  originalPlayers: [],
  tricks: [],
  musicList: [],

  // 对战状态
  currentChapter: 1,
  currentRound: 1,
  currentWinner: null,
  participatedPlayers: [],
  chapterWinners: [],

  // 加载状态
  playersLoaded: false,
  tricksLoaded: false,
  musicLoaded: false,

  // 音乐播放状态
  isMusicPlaying: false,

  // 选中的技能状态
  selectedPlayer1Trick: null,
  selectedPlayer2Trick: null,
};

// =============== DOM 元素引用缓存 ===============
const DOM = {};

// =============== 初始化函数 ===============
// 主入口函数 - 页面加载完成时执行
document.addEventListener("DOMContentLoaded", function () {
  console.log("页面加载完成，初始化系统...");

  // 缓存DOM元素引用
  cacheDOMReferences();

  // 绑定事件监听器
  setupEventListeners();

  // 加载数据
  initializeData();
});

// 缓存DOM元素引用
function cacheDOMReferences() {
  // 章节和轮次
  DOM.chapterNumber = document.getElementById("chapter-number");
  DOM.roundNumber = document.getElementById("round-number");

  // 选手区域
  DOM.player1 = document.getElementById("player1");
  DOM.player2 = document.getElementById("player2");
  DOM.player1Name = document.getElementById("player1-name");
  DOM.player2Name = document.getElementById("player2-name");

  // 功能按钮
  DOM.drawPlayersBtn = document.getElementById("draw-players-btn");
  DOM.drawMusicBtn = document.getElementById("draw-music-btn");
  DOM.drawTricksBtn = document.getElementById("draw-tricks-btn");
  DOM.playMusicBtn = document.getElementById("play-music-btn");
  DOM.nextRoundBtn = document.getElementById("next-round-btn");
  DOM.resetGameBtn = document.getElementById("reset-game-btn");
  DOM.homeBtn = document.getElementById("home-btn");
  DOM.clearCacheBtn = document.getElementById("clear-cache-btn");

  // 显示区域
  DOM.musicName = document.getElementById("music-name");
  DOM.musicPlayer = document.getElementById("music-player");
  DOM.randomTricksDisplay = document.getElementById("random-tricks-display");

  // 技池区域
  DOM.tricksPoolPlayer1 = document.getElementById("tricks-pool-list-player1");
  DOM.tricksPoolPlayer2 = document.getElementById("tricks-pool-list-player2");
}

// 设置事件监听器
function setupEventListeners() {
  // 检查DOM元素是否已缓存
  if (
    !DOM.drawPlayersBtn ||
    !DOM.drawMusicBtn ||
    !DOM.drawTricksBtn ||
    !DOM.playMusicBtn ||
    !DOM.nextRoundBtn ||
    !DOM.resetGameBtn
  ) {
    console.error("无法找到必要的DOM元素，请检查HTML结构");
    showToast("页面加载错误，请刷新重试", "error");
    return;
  }

  // 功能按钮事件监听
  DOM.drawPlayersBtn.addEventListener("click", handleDrawPlayers);
  DOM.drawMusicBtn.addEventListener("click", handleDrawMusic);
  DOM.drawTricksBtn.addEventListener("click", handleDrawTricks);
  DOM.playMusicBtn.addEventListener("click", handlePlayMusic);
  DOM.nextRoundBtn.addEventListener("click", handleNextRound);

  // 重置按钮
  DOM.resetGameBtn.addEventListener("click", function () {
    if (confirm("确定要重置当前对战进度吗？将开始新的章节。")) {
      resetGame();
    }
  });

  // 导航按钮
  DOM.homeBtn.addEventListener("click", function () {
    window.location.href = "index.html";
  });

  // 添加清除缓存按钮事件监听
  if (DOM.clearCacheBtn) {
    DOM.clearCacheBtn.addEventListener("click", clearCache);
  }

  // 选手区域点击事件由HTML内联事件处理 (onclick="setWinner")

  // 页面卸载前保存状态
  window.addEventListener("beforeunload", saveGameState);

  // 添加自动保存
  setupAutoSave();
}

// 初始化数据
function initializeData() {
  // 显示加载提示
  showToast("正在加载数据...", "info");

  // 并行加载所有数据
  Promise.all([loadPlayers(), loadTricks(), loadMusic()])
    .then(() => {
      console.log("所有数据加载完成");
      showToast("数据加载完成", "success");

      // 初始化游戏
      initializeGameState();
    })
    .catch((error) => {
      console.error("数据加载失败:", error);
      showToast("数据加载失败，请刷新页面重试", "error");
    });
}

// =============== 数据加载函数 ===============
// 加载选手数据
function loadPlayers() {
  console.log("加载选手数据...");

  return fetch("../resource/json/player1.json")
    .then((response) => {
      if (!response.ok) throw new Error("选手数据加载失败");
      return response.json();
    })
    .then((data) => {
      BattleState.players = data;
      BattleState.originalPlayers = [...data];
      BattleState.playersLoaded = true;
      console.log(`成功加载 ${data.length} 名选手`);

      // 保存备份
      localStorage.setItem("backupPlayers", JSON.stringify(data));
      return data;
    })
    .catch((error) => {
      console.error("选手数据加载失败:", error);
      // 尝试从备份恢复
      return loadPlayersFromBackup();
    });
}

// 从备份加载选手数据
function loadPlayersFromBackup() {
  try {
    const backup = localStorage.getItem("backupPlayers");
    if (backup) {
      const data = JSON.parse(backup);
      if (data && data.length > 0) {
        BattleState.players = data;
        BattleState.originalPlayers = [...data];
        BattleState.playersLoaded = true;
        console.log(`从备份加载 ${data.length} 名选手`);
        return data;
      }
    }
    throw new Error("无备份数据");
  } catch (error) {
    console.error("从备份加载选手数据失败:", error);
    showToast("选手数据加载失败", "error");
    return [];
  }
}

// 加载技能数据
function loadTricks() {
  console.log("加载技能数据...");

  return fetch("../resource/json/tricks.json")
    .then((response) => {
      if (!response.ok) throw new Error("技能数据加载失败");
      return response.json();
    })
    .then((data) => {
      BattleState.tricks = data;
      BattleState.tricksLoaded = true;
      console.log(`成功加载 ${data.length} 个技能`);
      return data;
    })
    .catch((error) => {
      console.error("技能数据加载失败:", error);
      showToast("技能数据加载失败", "error");
      return [];
    });
}

// 加载音乐数据
function loadMusic() {
  console.log("加载音乐数据...");

  return fetch("../resource/json/musics_list.json")
    .then((response) => {
      if (!response.ok) throw new Error("音乐数据加载失败");
      return response.json();
    })
    .then((data) => {
      BattleState.musicList = data;
      BattleState.musicLoaded = true;
      console.log(`成功加载 ${data.length} 首音乐`);
      return data;
    })
    .catch((error) => {
      console.error("音乐数据加载失败:", error);
      showToast("音乐数据加载失败", "error");
      return [];
    });
}

// =============== 游戏状态管理 ===============
// 初始化游戏状态
function initializeGameState() {
  console.log("初始化游戏状态...");

  // 先显示加载提示
  showToast("正在加载游戏状态...", "info");

  // 定义跳转函数以避免重复代码
  function handleChapterRedirect(chapter) {
    if (chapter !== 1) {
      console.log(`检测到非第一章节 (${chapter})，但保持在第一章节...`);
      showToast(`检测到进度：第${chapter}章，保持在第一章节`, "info");

      // 修改为不跳转，但设置为第一章节的最后一轮(第4轮)
      BattleState.currentChapter = 1;
      BattleState.currentRound = 4; // 设置为第4轮

      return false; // 表示未跳转
    }
    return false; // 表示未跳转
  }

  // 尝试从服务器获取状态
  fetch("http://localhost:3000/api/battle-group1-process")
    .then((response) => response.json())
    .then((data) => {
      if (data && data.currentState) {
        // 恢复当前状态
        const chapter = data.currentState.currentChapter || 1;
        BattleState.currentChapter = chapter;
        BattleState.currentRound = data.currentState.currentRound || 1;
        BattleState.participatedPlayers =
          data.currentState.participatedPlayers || [];
        BattleState.chapterWinners = data.currentState.chapterWinners || [];

        // 恢复已选择的技能
        if (data.currentState.selectedPlayer1Trick) {
          BattleState.selectedPlayer1Trick =
            data.currentState.selectedPlayer1Trick;
        }
        if (data.currentState.selectedPlayer2Trick) {
          BattleState.selectedPlayer2Trick =
            data.currentState.selectedPlayer2Trick;
        }

        // 恢复当前选手
        if (data.currentState.currentPlayers) {
          setTimeout(() => {
            if (
              DOM.player1Name &&
              DOM.player2Name &&
              data.currentState.currentPlayers
            ) {
              DOM.player1Name.innerText =
                data.currentState.currentPlayers.player1 || "";
              DOM.player2Name.innerText =
                data.currentState.currentPlayers.player2 || "";

              // 如果有当前获胜者，恢复获胜者样式
              if (data.currentState.currentWinner) {
                BattleState.currentWinner = data.currentState.currentWinner;
                const playerId =
                  data.currentState.currentWinner ===
                  data.currentState.currentPlayers.player1
                    ? "player1"
                    : "player2";
                const winnerElement = document.getElementById(playerId);
                const loserElement = document.getElementById(
                  playerId === "player1" ? "player2" : "player1"
                );

                if (winnerElement && loserElement) {
                  winnerElement.classList.add("winner");
                  loserElement.classList.add("loser");
                }
              }
            }
          }, 500);
        }

        console.log("游戏状态已从服务器恢复:", data.currentState);

        // 处理跳转逻辑，但保持在第一章节
        return handleChapterRedirect(chapter);
      }
      return false; // 没有状态数据，不需要跳转
    })
    .catch((error) => {
      console.error("从服务器恢复状态失败:", error);
      // 从本地存储恢复
      const savedState = localStorage.getItem("battleGameState");
      if (savedState) {
        try {
          const state = JSON.parse(savedState);

          // 恢复章节和轮次
          const chapter = state.currentChapter || 1;
          BattleState.currentChapter = chapter;
          BattleState.currentRound = state.currentRound || 1;
          BattleState.participatedPlayers = state.participatedPlayers || [];
          BattleState.chapterWinners = state.chapterWinners || [];

          // 如果有选择的技能，也恢复
          if (state.selectedPlayer1Trick) {
            BattleState.selectedPlayer1Trick = state.selectedPlayer1Trick;
          }
          if (state.selectedPlayer2Trick) {
            BattleState.selectedPlayer2Trick = state.selectedPlayer2Trick;
          }

          console.log("游戏状态已从本地存储恢复:", state);

          // 处理跳转逻辑，但保持在第一章节
          if (chapter > 1) {
            BattleState.currentChapter = 1;
            BattleState.currentRound = 4; // 设置为第4轮
            showToast(`检测到第${chapter}章进度，已重置为第1章第4轮`, "info");
            return false;
          }
          return false; // 从本地恢复失败，不需要跳转
        } catch (error) {
          console.error("恢复游戏状态失败:", error);
        }
      }
      return false; // 从本地恢复失败，不需要跳转
    })
    .then((hasRedirected) => {
      // 如果已经跳转，则不需要继续初始化
      if (hasRedirected) return;

      // 完成剩余初始化
      completeInitialization();
    });
}

// 分离出初始化的剩余部分，避免在跳转时执行
function completeInitialization() {
  // 初始化技能选择状态（如果尚未初始化）
  if (BattleState.selectedPlayer1Trick === undefined) {
    BattleState.selectedPlayer1Trick = null;
  }
  if (BattleState.selectedPlayer2Trick === undefined) {
    BattleState.selectedPlayer2Trick = null;
  }

  // 更新UI显示
  updateRoundDisplay();

  // 初始抽取选手（如果当前没有选手）
  if (!DOM.player1Name.innerText || !DOM.player2Name.innerText) {
    handleDrawPlayers();
  } else {
    // 如果有当前选手，更新技池
    updateTrickPools();

    // 如果有已选择的技能，显示技能对决
    if (BattleState.selectedPlayer1Trick && BattleState.selectedPlayer2Trick) {
      displayTrickMatch(
        BattleState.selectedPlayer1Trick,
        BattleState.selectedPlayer2Trick
      );
    }
  }

  // 显示加载完成提示
  showToast("游戏状态加载完成", "success");
}

// 保存游戏状态
function saveGameState() {
  try {
    const state = {
      currentChapter: BattleState.currentChapter,
      currentRound: BattleState.currentRound,
      participatedPlayers: BattleState.participatedPlayers,
      chapterWinners: BattleState.chapterWinners,
      players: BattleState.players,
      currentWinner: BattleState.currentWinner,
      selectedPlayer1Trick: BattleState.selectedPlayer1Trick,
      selectedPlayer2Trick: BattleState.selectedPlayer2Trick,
      currentPlayers: {
        player1: DOM.player1Name.innerText,
        player2: DOM.player2Name.innerText,
      },
    };

    // 保存到本地存储
    localStorage.setItem("battleGameState", JSON.stringify(state));

    // 保存到服务器
    fetch("http://localhost:3000/api/battle-group1-process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state),
    })
      .then((response) => {
        if (!response.ok) throw new Error("保存进度失败");
        console.log("比赛状态已成功保存到服务器");
      })
      .catch((error) => {
        console.error("服务器保存失败:", error);
        showToast("自动保存失败，请检查网络连接", "error");
      });
  } catch (error) {
    console.error("保存游戏状态失败:", error);
    showToast("自动保存失败", "error");
  }
}

// 清除缓存
function clearCache() {
  try {
    // 确认对话框
    if (!confirm("确定要清除所有缓存数据吗？此操作将无法恢复。")) {
      return;
    }

    // 清除本地存储
    localStorage.removeItem("battleGameState");
    localStorage.removeItem("backupPlayers");

    // 清除服务器缓存
    Promise.all([
      // 清除battle-group1进度
      fetch("http://localhost:3000/api/clear-battle-group1-process", {
        method: "POST",
      }),
      // 重置winners数据
      fetch("http://localhost:3000/api/reset-winners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: true }),
      }),
    ])
      .then(() => {
        console.log("所有缓存已清除");
        showToast("缓存已清除", "success");
        // 重置游戏状态
        resetGame();
        // 延迟刷新页面
        setTimeout(() => location.reload(), 1000);
      })
      .catch((error) => {
        console.error("清除缓存失败:", error);
        showToast("清除缓存失败", "error");
      });
  } catch (error) {
    console.error("清除缓存失败:", error);
    showToast("清除缓存失败", "error");
  }
}

// 重置游戏
function resetGame() {
  BattleState.currentChapter = 1;
  BattleState.currentRound = 1;
  BattleState.currentWinner = null;
  BattleState.participatedPlayers = [];
  BattleState.chapterWinners = [];

  // 恢复原始选手数据
  if (BattleState.originalPlayers.length > 0) {
    BattleState.players = [...BattleState.originalPlayers];
  }

  // 重置选中的技能状态
  BattleState.selectedPlayer1Trick = null;
  BattleState.selectedPlayer2Trick = null;

  // 更新UI
  updateRoundDisplay();

  // 重新抽取选手
  handleDrawPlayers();

  // 清空技名和音乐
  DOM.randomTricksDisplay.innerHTML = "请抽取动作";
  DOM.musicName.innerText = "音乐名称";
  DOM.musicPlayer.src = "";

  // 重置选手区域样式
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");

  // 初始化winners.json文件
  resetWinnersData()
    .then(() => {
      showToast("游戏已重置，获胜者记录已清空", "success");
    })
    .catch((error) => {
      console.error("清空获胜者记录失败:", error);
      showToast("游戏已重置，但获胜者记录清空失败", "warning");
    });

  // 保存状态
  saveGameState();
}

// 添加重置winners.json的函数
function resetWinnersData() {
  return new Promise((resolve, reject) => {
    // 清空本地存储中的获胜者记录
    localStorage.removeItem("battleWinners");

    // 调用服务器API重置winners.json
    fetch("http://localhost:3000/api/reset-winners", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("服务器重置失败");
        }
        return response.text();
      })
      .then(() => {
        console.log("获胜者记录已成功重置");
        resolve();
      })
      .catch((error) => {
        console.error("重置获胜者记录失败:", error);
        reject(error);
      });
  });
}

// 更新轮次显示
function updateRoundDisplay() {
  if (!DOM.chapterNumber || !DOM.roundNumber) return;

  DOM.chapterNumber.innerText = BattleState.currentChapter;

  // 计算剩余选手
  const availablePlayers = BattleState.players.filter(
    (player) => !BattleState.participatedPlayers.includes(player.name)
  );

  // 计算总轮次数
  const totalMatches = Math.ceil(BattleState.players.length / 2);

  DOM.roundNumber.innerText = `${BattleState.currentRound}/${totalMatches} (剩余选手: ${availablePlayers.length})`;
}

// =============== 事件处理函数 ===============
// 处理抽取选手
function handleDrawPlayers() {
  console.log("执行抽取选手");

  if (!BattleState.playersLoaded) {
    showToast("选手数据正在加载，请稍候", "info");
    return;
  }

  if (BattleState.players.length < 2) {
    showToast("选手数量不足，无法进行对战", "error");
    return;
  }

  // 抽取未参战选手
  drawAvailablePlayers();
  saveGameState();
}

// 处理抽取音乐
function handleDrawMusic() {
  console.log("执行抽取音乐");

  if (!BattleState.musicLoaded) {
    showToast("音乐数据正在加载，请稍候", "info");
    return;
  }

  if (BattleState.musicList.length === 0) {
    showToast("音乐列表为空", "error");
    return;
  }

  // 随机抽取音乐
  const randomIndex = Math.floor(Math.random() * BattleState.musicList.length);
  const selectedMusic = BattleState.musicList[randomIndex];

  // 更新UI
  DOM.musicName.innerText = selectedMusic;
  DOM.musicPlayer.src = `../resource/musics/1yearplus/${selectedMusic}`;

  showToast(`已抽取音乐: ${selectedMusic}`, "success");
}

// 处理抽取动作
function handleDrawTricks() {
  console.log("执行抽取动作");

  if (!BattleState.tricksLoaded) {
    showToast("技能数据正在加载，请稍候", "info");
    return;
  }

  // 确保技池已显示
  if (
    !DOM.tricksPoolPlayer1.children.length ||
    !DOM.tricksPoolPlayer2.children.length
  ) {
    updateTrickPools();
    setTimeout(handleDrawTricks, 500);
    return;
  }

  // 获取未划线的技能
  const player1Tricks = Array.from(
    DOM.tricksPoolPlayer1.querySelectorAll(".trick-item:not(.crossed)")
  );
  const player2Tricks = Array.from(
    DOM.tricksPoolPlayer2.querySelectorAll(".trick-item:not(.crossed)")
  );

  if (player1Tricks.length === 0 || player2Tricks.length === 0) {
    showToast("技池中没有可用的技能", "error");
    return;
  }

  // 随机选择技能
  const player1Trick =
    player1Tricks[Math.floor(Math.random() * player1Tricks.length)].innerText;
  const player2Trick =
    player2Tricks[Math.floor(Math.random() * player2Tricks.length)].innerText;

  // 更新选中的技能状态
  BattleState.selectedPlayer1Trick = player1Trick;
  BattleState.selectedPlayer2Trick = player2Trick;

  // 显示结果
  displayTrickMatch(player1Trick, player2Trick);
  saveGameState();
}

// 处理播放音乐
function handlePlayMusic() {
  console.log("执行播放音乐");

  if (!DOM.musicPlayer.src) {
    showToast("请先抽取音乐", "warning");
    return;
  }

  if (DOM.musicPlayer.paused) {
    // 如果已在播放模式，先停止
    if (BattleState.isMusicPlaying) {
      stopMusicMode();
      return;
    }

    // 启动音乐播放模式
    startMusicMode();
  } else {
    // 停止播放
    stopMusicMode();
  }
}

// 启动音乐播放模式
function startMusicMode() {
  // 添加音乐播放模式类
  document.body.classList.add("music-playing-mode");

  // 创建遮罩
  const overlay = document.createElement("div");
  overlay.classList.add("battle-overlay");
  document.body.appendChild(overlay);

  // 添加震动效果
  document.body.classList.add("shake");
  setTimeout(() => document.body.classList.remove("shake"), 500);

  // 创建 Battle Start 动画
  const battleStart = document.createElement("div");
  battleStart.classList.add("battle-start");

  // 文字动画效果
  setTimeout(() => {
    battleStart.innerText = "B";
    document.body.appendChild(battleStart);
  }, 200); // 延长至200ms

  setTimeout(() => {
    battleStart.innerText = "BA";
  }, 300); // 延长至300ms

  setTimeout(() => {
    battleStart.innerText = "BAT";
  }, 400); // 延长至400ms

  setTimeout(() => {
    battleStart.innerText = "BATT";
  }, 500); // 延长至500ms

  setTimeout(() => {
    battleStart.innerText = "BATTL";
  }, 600); // 延长至600ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE";
  }, 700); // 延长至700ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE ";
  }, 800); // 延长至800ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE S";
  }, 900); // 延长至900ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE ST";
  }, 1000); // 延长至1000ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE STA";
  }, 1100); // 延长至1100ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE STAR";
  }, 1200); // 延长至1200ms

  setTimeout(() => {
    battleStart.innerText = "BATTLE START";
    battleStart.classList.add("shake");
  }, 1300); // 延长至1300ms

  // 动画结束后播放音乐
  setTimeout(() => {
    if (document.body.contains(battleStart)) {
      document.body.removeChild(battleStart);

      // 移除遮罩
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }

      // 添加点击提示
      const clickToStop = document.createElement("div");
      clickToStop.classList.add("click-to-stop");
      clickToStop.innerText = "点击任意位置停止";
      clickToStop.id = "click-to-stop-hint";
      document.body.appendChild(clickToStop);

      // 播放音乐
      DOM.musicPlayer.play();
      DOM.musicPlayer.style.display = "block";

      // 更新状态
      BattleState.isMusicPlaying = true;

      // 添加事件监听
      DOM.musicPlayer.onended = stopMusicMode;
      document.addEventListener("click", handleDocumentClick);
    }
  }, 4500); // 延长至4500ms
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

  // 移除提示
  const hint = document.getElementById("click-to-stop-hint");
  if (hint && hint.parentNode) {
    hint.parentNode.removeChild(hint);
  }

  // 隐藏播放器
  DOM.musicPlayer.style.display = "none";

  // 更新状态
  BattleState.isMusicPlaying = false;

  console.log("音乐播放模式已停止");
}

// 处理页面点击事件
function handleDocumentClick(event) {
  if (BattleState.isMusicPlaying) {
    // 确保不是点击播放器或提示
    if (
      !DOM.musicPlayer.contains(event.target) &&
      event.target.id !== "click-to-stop-hint"
    ) {
      stopMusicMode();
    }
  }
}

// 处理下一轮
function handleNextRound() {
  if (!BattleState.currentWinner) {
    showToast("请先选择本轮胜者", "warning");
    return;
  }

  // 记录当前对战的选手
  const player1 = DOM.player1Name.innerText;
  const player2 = DOM.player2Name.innerText;

  // 添加到已参战列表
  if (!BattleState.participatedPlayers.includes(player1)) {
    BattleState.participatedPlayers.push(player1);
  }
  if (!BattleState.participatedPlayers.includes(player2)) {
    BattleState.participatedPlayers.push(player2);
  }

  // 记录获胜者
  if (!BattleState.chapterWinners.includes(BattleState.currentWinner)) {
    BattleState.chapterWinners.push(BattleState.currentWinner);
  }

  // 保存获胜数据
  saveWinnerData({
    chapter: BattleState.currentChapter,
    round: BattleState.currentRound,
    winner: BattleState.currentWinner,
  });

  // 进入下一轮
  proceedToNextRound();
  saveGameState();
}

// 进入下一轮
function proceedToNextRound() {
  // 更新轮次
  BattleState.currentRound++;

  // 检查是否已完成足够多的轮次，而不是仅仅检查可用选手
  // 第一章节应该至少进行4轮比赛
  const minRequiredRounds = 4;
  const maxRoundsChapter1 = 4;

  if (BattleState.currentRound > minRequiredRounds) {
    // 检查可用选手
    const availablePlayers = BattleState.players.filter(
      (player) => !BattleState.participatedPlayers.includes(player.name)
    );

    if (
      availablePlayers.length < 2 ||
      BattleState.currentRound > maxRoundsChapter1
    ) {
      // 显示提示，但不自动跳转
      showNextChapterPrompt();
      return;
    }
  }

  // 更新显示
  updateRoundDisplay();

  // 重置获胜者状态
  resetWinnerDisplay();

  // 抽取下一轮选手
  drawAvailablePlayers();

  // 保存游戏状态
  saveGameState();
}

// 添加一个新函数，显示下一章节提示，让用户手动决定
function showNextChapterPrompt() {
  // 保存当前状态，但保持在第一章节
  BattleState.currentRound = 4; // 固定在第4轮
  saveGameState();

  // 创建一个提示框
  const promptDiv = document.createElement("div");
  promptDiv.className = "next-chapter-prompt";
  promptDiv.innerHTML = `
    <div class="prompt-content">
      <h3>第一章节已完成</h3>
      <p>您已经完成了第一章节的比赛。</p>
      <div class="prompt-buttons">
        <button id="stay-button">留在当前页面</button>
        <button id="next-chapter-button">进入第二章节</button>
      </div>
    </div>
  `;
  document.body.appendChild(promptDiv);

  // 按钮事件
  document.getElementById("stay-button").addEventListener("click", function () {
    document.body.removeChild(promptDiv);
  });

  document
    .getElementById("next-chapter-button")
    .addEventListener("click", function () {
      // 准备下一章节数据
      const chapterWinnersData = {
        winners: BattleState.chapterWinners,
      };
      localStorage.setItem(
        "chapter1Winners",
        JSON.stringify(chapterWinnersData)
      );

      // 跳转
      window.location.href = "battle-group1-2.html";
    });
}

// 修改开始新章节函数
function startNextChapter() {
  // 如果是第一章节结束，显示提示但不自动跳转
  if (BattleState.currentChapter === 1) {
    // 保存当前状态
    saveGameState();

    // 保存获胜者信息到 localStorage，以便在新页面中恢复
    const chapterWinnersData = {
      winners: BattleState.chapterWinners,
    };
    localStorage.setItem("chapter1Winners", JSON.stringify(chapterWinnersData));

    // 显示提示并让用户选择是否跳转
    showNextChapterPrompt();
    return;
  }

  // 对于其他情况，显示完成信息并跳转到结果页面
  showToast("比赛已结束！", "success");
  setTimeout(() => {
    window.location.href = "rank.html";
  }, 1500);
}

// =============== 辅助功能函数 ===============
// 抽取未参战选手
function drawAvailablePlayers() {
  // 过滤出未参战选手
  const availablePlayers = BattleState.players.filter(
    (player) => !BattleState.participatedPlayers.includes(player.name)
  );

  if (availablePlayers.length < 2) {
    showToast("可用选手不足，将进入下一章节", "warning");
    startNextChapter();
    return;
  }

  // 随机抽取两名未参战选手
  const shuffled = [...availablePlayers].sort(() => Math.random() - 0.5);
  const selectedPlayers = shuffled.slice(0, 2);

  // 更新UI
  DOM.player1Name.innerText = selectedPlayers[0].name;
  DOM.player2Name.innerText = selectedPlayers[1].name;

  // 更新技池
  updateTrickPools();

  // 重置已选中的技能
  BattleState.selectedPlayer1Trick = null;
  BattleState.selectedPlayer2Trick = null;

  console.log(
    `抽取选手: ${selectedPlayers[0].name} vs ${selectedPlayers[1].name}`
  );
}

// 显示选手技能
function displayPlayerTricks(container, player, playerKey) {
  if (!container) return;

  container.innerHTML = "";

  // 如果选手没有技能，分配随机技能
  if (
    !player.tricks ||
    !Array.isArray(player.tricks) ||
    player.tricks.length === 0
  ) {
    player.tricks = generateRandomTricks(5);
  }

  // 判断是哪个选手
  const isPlayer2 = playerKey === "player2";

  // 显示技能
  player.tricks.forEach((trick) => {
    const span = document.createElement("span");
    span.innerText = trick;
    span.classList.add("tech-highlight");
    if (isPlayer2) span.classList.add("player2");

    span.addEventListener("click", () => toggleCross(span));
    container.appendChild(span);
  });
}

// 生成随机技能
function generateRandomTricks(count) {
  if (!BattleState.tricks || BattleState.tricks.length === 0) {
    return Array(count)
      .fill()
      .map((_, i) => `默认技能${i + 1}`);
  }

  const numTricks = Math.min(count, BattleState.tricks.length);
  const shuffled = [...BattleState.tricks].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, numTricks).map((trick) => trick.name);
}

// 更新技池
function updateTrickPools() {
  if (!BattleState.tricksLoaded) {
    // 如果技能数据未加载，延迟更新
    setTimeout(updateTrickPools, 500);
    return;
  }

  if (!DOM.tricksPoolPlayer1 || !DOM.tricksPoolPlayer2) {
    console.error("找不到技池DOM元素");
    return;
  }

  // 清空现有技池
  DOM.tricksPoolPlayer1.innerHTML = "";
  DOM.tricksPoolPlayer2.innerHTML = "";

  // 获取所有技能名称
  const trickNames = BattleState.tricks.map((trick) => trick.name);

  // 显示技池
  trickNames.forEach((trick) => {
    // 选手1技池
    const span1 = document.createElement("span");
    span1.innerText = trick;
    span1.classList.add("trick-item");
    span1.addEventListener("click", () => toggleCross(span1));
    span1.addEventListener("mousedown", handleMiddleClick);
    DOM.tricksPoolPlayer1.appendChild(span1);

    // 选手2技池
    const span2 = document.createElement("span");
    span2.innerText = trick;
    span2.classList.add("trick-item");
    span2.addEventListener("click", () => toggleCross(span2));
    span2.addEventListener("mousedown", handleMiddleClick);
    DOM.tricksPoolPlayer2.appendChild(span2);
  });
}

// 修改处理中键点击函数
function handleMiddleClick(event) {
  if (event.button !== 1) return;

  event.preventDefault();

  const trickName = event.target.innerText;
  const isPlayer1Pool =
    event.target.closest("#tricks-pool-list-player1") !== null;

  // 更新选中的技能状态
  if (isPlayer1Pool) {
    BattleState.selectedPlayer1Trick = trickName;
  } else {
    BattleState.selectedPlayer2Trick = trickName;
  }

  // 显示技能对决
  displayTrickMatch(
    BattleState.selectedPlayer1Trick,
    BattleState.selectedPlayer2Trick
  );

  // 保存状态
  saveGameState();

  // 视觉反馈
  event.target.classList.add("middle-clicked");
  setTimeout(() => event.target.classList.remove("middle-clicked"), 300);
}

// 显示技能对决
function displayTrickMatch(player1Trick, player2Trick) {
  const container = document.createElement("div");
  container.className = "random-tricks-container";

  const tech1 = document.createElement("span");
  tech1.innerText = player1Trick;
  tech1.className = "tech-highlight";

  const vsText = document.createElement("span");
  vsText.innerText = "VS";
  vsText.className = "vs-text";

  const tech2 = document.createElement("span");
  tech2.innerText = player2Trick;
  tech2.className = "tech-highlight player2";

  container.appendChild(tech1);
  container.appendChild(vsText);
  container.appendChild(tech2);

  DOM.randomTricksDisplay.innerHTML = "";
  DOM.randomTricksDisplay.appendChild(container);
}

// 切换技能划线状态
function toggleCross(element) {
  element.classList.toggle("crossed");
  element.classList.add("animate");

  // 如果是技名高亮元素，特殊处理
  if (element.classList.contains("tech-highlight")) {
    if (element.classList.contains("crossed")) {
      element.style.animation = "none";
    } else {
      // 恢复动画
      const isPlayer2 = element.classList.contains("player2");
      if (isPlayer2) {
        element.style.animation =
          "techname-glow-orange 2s infinite, techname-color-orange 8s infinite, float 3s ease-in-out infinite";
      } else {
        element.style.animation =
          "techname-glow 2s infinite, techname-color 8s infinite, float 3s ease-in-out infinite";
      }
    }
  }

  setTimeout(() => element.classList.remove("animate"), 500);
}

// 设置获胜者 (HTML内联事件调用)
window.setWinner = function (playerId) {
  // 移除先前样式
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");

  // 设置获胜者
  const winnerElement = document.getElementById(playerId);
  const loserElement = document.getElementById(
    playerId === "player1" ? "player2" : "player1"
  );

  // 获取赢家名称
  BattleState.currentWinner = document.getElementById(
    `${playerId}-name`
  ).innerText;

  // 添加样式
  winnerElement.classList.add("winner");
  loserElement.classList.add("loser");

  // 显示提示
  showWinnerAnnouncement(BattleState.currentWinner);
  saveGameState();
};

// 显示获胜提示
function showWinnerAnnouncement(winnerName) {
  const announcement = document.createElement("div");
  announcement.classList.add("winner-announcement");
  announcement.innerText = `${winnerName} 获胜!`;
  document.body.appendChild(announcement);

  // 自动移除
  setTimeout(() => {
    if (document.body.contains(announcement)) {
      document.body.removeChild(announcement);
    }
  }, 3000);
}

// 重置获胜者显示
function resetWinnerDisplay() {
  DOM.player1.classList.remove("winner", "loser");
  DOM.player2.classList.remove("winner", "loser");
  BattleState.currentWinner = null;
}

// 保存获胜者数据
function saveWinnerData(winnerData) {
  // 保存到本地存储
  saveWinnerToLocalStorage(winnerData);

  // 保存到服务器
  saveWinnerToServer(winnerData).then((success) => {
    if (!success) {
      showToast("保存到服务器失败，已保存到本地", "warning");
    }
  });
}

// 修改保存到本地存储函数
function saveWinnerToLocalStorage(winnerData) {
  try {
    let savedData = localStorage.getItem("battleWinners");
    let winners = savedData ? JSON.parse(savedData) : {};

    const chapterKey = `chapter${winnerData.chapter}`;
    const roundKey = `round${winnerData.round}`;

    // 确保章节对象存在
    if (!winners[chapterKey]) {
      winners[chapterKey] = {};
    }

    // 添加新的获胜记录，保留其他记录
    winners[chapterKey][roundKey] = winnerData.winner;

    // 保存更新后的数据
    localStorage.setItem("battleWinners", JSON.stringify(winners));
    console.log("获胜者已保存到本地:", winners);
    return true;
  } catch (error) {
    console.error("保存获胜者到本地失败:", error);
    return false;
  }
}

// 修改保存到服务器函数
function saveWinnerToServer(winnerData) {
  return new Promise((resolve) => {
    try {
      // 先获取现有数据
      fetch("http://localhost:3000/api/battle-group1-process")
        .then((response) => response.json())
        .then((currentData) => {
          // 创建新的获胜记录
          const newWinnerData = {
            [`chapter${winnerData.chapter}`]: {
              [`round${winnerData.round}`]: winnerData.winner,
            },
          };

          // 发送到服务器
          return fetch("http://localhost:3000/api/winners", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(newWinnerData),
          });
        })
        .then((response) => {
          if (!response.ok) throw new Error("保存失败");
          return response.text();
        })
        .then(() => {
          console.log("获胜者已保存到服务器:", winnerData);
          showToast(`已保存获胜者: ${winnerData.winner}`, "success");
          resolve(true);
        })
        .catch((error) => {
          console.error("保存获胜者到服务器失败:", error);
          resolve(false);
        });
    } catch (error) {
      console.error("保存获胜者到服务器出错:", error);
      resolve(false);
    }
  });
}

// 显示提示
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `${type}-toast`;
  toast.innerText = message;
  document.body.appendChild(toast);

  // 自动移除
  setTimeout(() => {
    if (document.body.contains(toast)) {
      document.body.removeChild(toast);
    }
  }, 3000);
}

// 添加自动保存定时器
function setupAutoSave() {
  // 每30秒自动保存一次
  setInterval(saveGameState, 30000);
}
