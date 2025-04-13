/**
 * 一年内组比赛界面 - 上半场（数据模块）
 * 处理数据加载和状态管理
 */

// 加载所有数据
function loadData() {
  // 读取选手数据
  fetch("../resource/json/player2.json")
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
  fetch("../resource/json/tricks_for_group2.json")
    .then((response) => response.json())
    .then((data) => {
      AppState.tricks = data;
      updateTrickList();
    })
    .catch((error) => {
      console.error("加载技名数据失败:", error);
    });

  // 读取音乐列表数据 - 从musics_list-2.json加载
  fetch("../resource/json/musics_list-2.json")
    .then((response) => {
      if (!response.ok) throw new Error("无法加载musics_list-2.json");
      return response.json();
    })
    .then((data) => {
      console.log("从musics_list-2.json加载音乐数据:", data);
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
    fetch("http://localhost:3000/api/battle-group2-process", {
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
  fetch("http://localhost:3000/resource/json/battle-group2-process.json")
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
      AppState.currentMusicFile = `../resource/musics/1yearminus/${musicFileName}`;
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
      AppState.currentMusicFile = `../resource/musics/1yearminus/${cachedMusic}`;
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

// 随机抽取音乐
function drawRandomMusic() {
  if (!AppState.musicList || AppState.musicList.length === 0) {
    console.error("音乐列表为空，无法抽取音乐");
    // 尝试重新加载音乐列表，由-2改成_2
    fetch("../resource/json/musics_list_2.json")
      .then((response) => {
        if (!response.ok) throw new Error("无法加载音乐列表");
        return response.json();
      })
      .then((data) => {
        console.log("重新加载音乐列表成功:", data);
        AppState.musicList = data;
        // 递归调用，重试抽取
        drawRandomMusic();
      })
      .catch((error) => {
        console.error("重新加载音乐列表失败:", error);
        showToast("音乐列表加载失败，请刷新页面重试", "error");
      });
    return;
  }

  // 随机选择一首音乐
  const randomIndex = Math.floor(Math.random() * AppState.musicList.length);
  const selectedMusic = AppState.musicList[randomIndex];

  // 更新UI和状态
  DOM.currentMusic.textContent = selectedMusic;
  AppState.currentMusicFile = `../resource/musics/1yearminus/${selectedMusic}`;
  DOM.musicPlayer.src = AppState.currentMusicFile;

  // 保存状态
  saveState();

  console.log(`随机抽取音乐: ${selectedMusic}`);
  showToast(`已抽取音乐: ${selectedMusic.replace(/\.mp3$/, "")}`, "success");
  return selectedMusic;
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
    fetch("../resource/json/player2.json")
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
        return fetch("http://localhost:3000/api/battle-group2-process", {
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
