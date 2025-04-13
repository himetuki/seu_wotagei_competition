/**
 * 一年加组对战系统 - 第二章节（数据模块）
 * 包含数据加载和状态管理函数
 */

// 加载选手数据（从winners.json）
function loadPlayers() {
  console.log("加载选手数据...");

  // 添加调试信息，查看localStorage是否有chapter1Winners
  const localStorageData = localStorage.getItem("chapter1Winners");
  console.log("localStorage中的chapter1Winners数据:", localStorageData);

  // 尝试从localStorage获取上一章的获胜者数据
  if (localStorageData) {
    try {
      const winnersData = JSON.parse(localStorageData);
      console.log("解析后的winners数据:", winnersData);

      if (
        winnersData &&
        Array.isArray(winnersData.winners) &&
        winnersData.winners.length > 0
      ) {
        // 使用上一章节的获胜者数据
        const players = winnersData.winners.map((name) => ({
          name,
          wins: 0,
          losses: 0,
        }));
        BattleState.players = players;
        BattleState.playersLoaded = true;

        console.log("成功从localStorage加载第一章节获胜者作为选手:", players);
        return Promise.resolve();
      }
    } catch (e) {
      console.error("解析localStorage中的chapter1Winners数据出错:", e);
    }
  }

  // 如果从localStorage加载失败，尝试从winners.json加载
  console.log("从localStorage加载失败，尝试从winners.json加载选手数据...");
  return fetch("../resource/json/winners.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error("获取winners.json失败");
      }
      return response.json();
    })
    .then((data) => {
      console.log("从winners.json获取的原始数据:", data);

      // 从winners.json中提取第一章节的获胜者
      if (!data || !data.chapter1) {
        console.error("winners.json数据格式不正确，缺少chapter1字段:", data);
        throw new Error("获胜者数据格式不正确");
      }

      // 从各轮次获取胜者
      const winners = [];
      for (let i = 1; i <= 4; i++) {
        const roundKey = `round${i}`;
        if (data.chapter1[roundKey]) {
          winners.push(data.chapter1[roundKey]);
          console.log(`找到第${i}轮获胜者:`, data.chapter1[roundKey]);
        } else {
          console.warn(`未找到第${i}轮获胜者`);
        }
      }

      console.log("提取出的获胜者列表:", winners);

      if (winners.length < 4) {
        console.warn(
          `获胜者数据不足，只找到${winners.length}名获胜者，需要4名`
        );

        // 添加默认选手补齐
        while (winners.length < 4) {
          winners.push(`默认选手${winners.length + 1}`);
        }
        console.log("添加默认选手后的列表:", winners);
      }

      // 转换为选手对象数组
      const players = winners.map((name) => ({ name, wins: 0, losses: 0 }));
      BattleState.players = players;
      BattleState.playersLoaded = true;

      // 保存到process.json以确保一致性
      return updateBattleProcessOnServer(players);
    })
    .catch((error) => {
      console.error("加载选手数据失败:", error);
      showToast("加载选手数据失败，将使用默认数据", "error");

      // 创建默认选手
      const defaultPlayers = [
        { name: "选手1", wins: 0, losses: 0 },
        { name: "选手2", wins: 0, losses: 0 },
        { name: "选手3", wins: 0, losses: 0 },
        { name: "选手4", wins: 0, losses: 0 },
      ];
      BattleState.players = defaultPlayers;
      BattleState.playersLoaded = true;

      return updateBattleProcessOnServer(defaultPlayers);
    });
}

// 向服务器更新battle-group1-2-process.json中的选手数据
function updateBattleProcessOnServer(players) {
  return fetch("http://localhost:3000/api/update-battle-group1-2-players", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ players }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("更新battle-group1-2-process.json中的选手数据失败");
      }
      console.log("成功更新battle-group1-2-process.json中的选手数据");
      return response.text();
    })
    .catch((error) => {
      console.error("更新选手数据到服务器失败:", error);
      return Promise.resolve(); // 继续流程
    });
}

// 加载音乐数据（从musics_list_ex.json）
function loadMusic() {
  console.log("加载音乐数据...");

  return fetch("../resource/json/musics_list_ex.json")
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

// 初始化游戏状态
function initializeGameState() {
  console.log("初始化游戏状态...");

  // 先显示加载提示
  showToast("正在加载游戏状态...", "info");

  // 尝试从服务器获取状态
  fetch("http://localhost:3000/api/battle-group1-2-process")
    .then((response) => response.json())
    .then((data) => {
      if (data && Object.keys(data).length > 0) {
        // 恢复当前状态
        restoreGameState(data);
        console.log("游戏状态已从服务器恢复:", data);
      } else {
        console.log("未找到保存的进度，初始化新游戏");
        // 初始化新游戏
        initializeNewGame();
      }
    })
    .catch((error) => {
      console.error("从服务器恢复状态失败:", error);

      // 从本地存储恢复
      const savedState = localStorage.getItem("battleGroup1-2State");
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          restoreGameState(state);
          console.log("游戏状态已从本地存储恢复:", state);
        } catch (error) {
          console.error("恢复游戏状态失败:", error);
          initializeNewGame();
        }
      } else {
        console.log("本地也没有保存的进度，初始化新游戏");
        initializeNewGame();
      }
    })
    .finally(() => {
      // 显示当前比赛
      updateBracketDisplay();
      updateRoundDisplay();

      console.log("检查当前比赛...");
      const currentMatch = getCurrentMatch();
      console.log("当前比赛:", currentMatch);

      // 强制显示选手，即使没有当前比赛
      if (currentMatch) {
        console.log("显示当前比赛选手");
        displayCurrentMatch();
      } else if (BattleState.players && BattleState.players.length >= 2) {
        // 如果没有当前比赛但有选手，显示第一对选手
        console.log("没有当前比赛，但有选手数据，显示初始对阵");
        DOM.player1Name.innerText = BattleState.players[0].name;
        DOM.player2Name.innerText = BattleState.players[1].name;
        updatePlayerStatsDisplay();
      }

      // 确保选手名称已经正确设置
      setTimeout(() => {
        if (!DOM.player1Name.innerText || !DOM.player2Name.innerText) {
          console.log("选手名称为空，尝试重新设置");
          if (BattleState.players && BattleState.players.length >= 2) {
            DOM.player1Name.innerText = BattleState.players[0].name;
            DOM.player2Name.innerText = BattleState.players[1].name;
            updatePlayerStatsDisplay();
          }
        }
      }, 500);

      // 显示加载完成提示
      showToast("游戏状态加载完成", "success");
    });
}

// 恢复游戏状态
function restoreGameState(state) {
  // 恢复基本状态
  BattleState.currentRound = state.currentRound || 1;
  BattleState.currentBracket = state.currentBracket || "winner";
  BattleState.currentMatchIndex = state.currentMatchIndex || 0;
  BattleState.currentWinner = state.currentWinner || null;

  // 恢复比赛数据
  if (state.matches && Array.isArray(state.matches)) {
    BattleState.matches = state.matches;
  }

  // 恢复选手统计
  if (state.playerStats) {
    BattleState.playerStats = state.playerStats;
  }

  // 恢复赛程数据
  if (state.bracket) {
    BattleState.bracket = state.bracket;
  }

  // 恢复选手数据（如果没有从winners.json加载）
  if (state.players && state.players.length === 4) {
    BattleState.players = state.players;
    BattleState.playersLoaded = true;
  }
}

// 初始化新游戏
function initializeNewGame() {
  console.log("初始化新游戏...");

  // 确保至少有4名选手
  if (!BattleState.playersLoaded || BattleState.players.length < 4) {
    console.error("选手数据不足，无法初始化比赛");
    showToast("选手数据不足，请检查winners.json", "error");
    return;
  }

  // 初始化选手统计
  BattleState.playerStats = {};
  BattleState.players.forEach((player) => {
    BattleState.playerStats[player.name] = { wins: 0, losses: 0 };
  });

  // 初始化比赛安排
  initializeTournamentBracket();

  // 设置初始轮次和赛程
  BattleState.currentRound = 1;
  BattleState.currentBracket = "winner";
  BattleState.currentMatchIndex = 0;
  BattleState.matches = [];

  // 保存状态
  saveGameState();
}

// 初始化双败赛制赛程表
function initializeTournamentBracket() {
  const players = BattleState.players;

  // 确保有4名选手
  if (players.length !== 4) {
    console.error(`选手数量不正确: ${players.length}，需要4名选手`);
    showToast("选手数量不正确，无法创建赛程", "error");
    return;
  }

  // 胜者组第一轮（2场比赛）
  BattleState.bracket.winner = [
    {
      round: 1,
      matches: [
        {
          player1: players[0].name,
          player2: players[1].name,
          winner: null,
          loser: null,
        },
        {
          player1: players[2].name,
          player2: players[3].name,
          winner: null,
          loser: null,
        },
      ],
    },
    // 胜者组第二轮（1场比赛）
    {
      round: 2,
      matches: [{ player1: "TBD", player2: "TBD", winner: null, loser: null }],
    },
  ];

  // 败者组（2场比赛）
  BattleState.bracket.loser = [
    {
      round: 1,
      matches: [{ player1: "TBD", player2: "TBD", winner: null, loser: null }],
    },
    {
      round: 2,
      matches: [{ player1: "TBD", player2: "TBD", winner: null, loser: null }],
    },
  ];

  // 决赛（只有1轮）
  BattleState.bracket.final = [
    {
      round: 1,
      matches: [
        {
          player1: "TBD",
          player2: "TBD",
          winner: null,
          loser: null,
          isFinal: true,
        },
      ],
    },
  ];
}

// 保存游戏状态
function saveGameState() {
  try {
    const state = {
      currentRound: BattleState.currentRound,
      currentBracket: BattleState.currentBracket,
      currentMatchIndex: BattleState.currentMatchIndex,
      currentWinner: BattleState.currentWinner,
      players: BattleState.players,
      playerStats: BattleState.playerStats,
      matches: BattleState.matches,
      bracket: BattleState.bracket,
      chapter: 2, // 明确指定章节
      lastUpdate: new Date().toISOString(),
    };

    // 保存到本地存储
    localStorage.setItem("battleGroup1-2State", JSON.stringify(state));

    // 保存到服务器
    fetch("http://localhost:3000/api/battle-group1-2-process", {
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
      });
  } catch (error) {
    console.error("保存游戏状态失败:", error);
    showToast("自动保存失败", "error");
  }
}

// 保存第二章节获胜者
function saveChapter2Winner(winnerName) {
  // 保存到localStorage，包括前三名
  localStorage.setItem(
    "chapter2Winner",
    JSON.stringify({
      winner: winnerName,
      runnerUp: BattleState.runnerUp || null,
      thirdPlace: BattleState.thirdPlace || null,
    })
  );

  // 保存到服务器
  const winnerData = {
    chapter2: {
      winner: winnerName,
      runnerUp: BattleState.runnerUp || null,
      thirdPlace: BattleState.thirdPlace || null,
    },
  };

  fetch("http://localhost:3000/api/winners", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(winnerData),
  })
    .then((response) => {
      if (!response.ok) throw new Error("保存获胜者失败");
      console.log("成功保存第二章节获胜者数据");
    })
    .catch((error) => {
      console.error("保存获胜者数据失败:", error);
      showToast("保存获胜者数据失败，但已保存到本地", "warning");
    });
}
