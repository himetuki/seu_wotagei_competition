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
  fetch("../resource/json/player2.json")
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
  fetch("../resource/json/tricks.json")
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
    saveStateToServer(stateData);
  } catch (error) {
    console.error("保存状态失败:", error);
  }
}

// 保存状态到服务器
function saveStateToServer(stateData) {
  fetch("http://localhost:3000/api/battle-group2-2-process", {
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
    if (savedTrick) {
      DOM.currentTrick.textContent = savedTrick;
    }

    // 恢复当前音乐
    if (savedMusic) {
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
  fetch("http://localhost:3000/api/battle-group2-2-process")
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
      if (data.currentTrick) {
        DOM.currentTrick.textContent = data.currentTrick;
      }

      if (data.currentMusic) {
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
    fetch("../resource/json/player2.json")
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
        return fetch("http://localhost:3000/api/battle-group2-2-process", {
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
        DOM.currentTrick.textContent = "";
        DOM.currentMusic.textContent = "";
        DOM.musicPlayer.src = "";
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
