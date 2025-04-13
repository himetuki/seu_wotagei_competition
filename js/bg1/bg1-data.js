/**
 * 一年加组对战系统 - 数据模块
 * 包含数据加载和状态管理函数
 */

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
