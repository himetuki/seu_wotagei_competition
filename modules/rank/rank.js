/**
 * 一年加组对战 - 排名页面
 * 显示各章节获胜者和总冠军
 */

document.addEventListener("DOMContentLoaded", function () {
  console.log("排名页面加载完成");

  // 初始化页面
  initPage();

  // 创建烟花效果 - 增加延迟以便页面元素加载完毕
  setTimeout(startFireworksShow, 800);

  // 绑定按钮事件
  document.getElementById("home-btn").addEventListener("click", function () {
    window.location.href = "/m/home";
  });

  document
    .getElementById("chapter1-btn")
    .addEventListener("click", function () {
      window.location.href = "/m/battle-group1";
    });

  document
    .getElementById("chapter2-btn")
    .addEventListener("click", function () {
      window.location.href = "/m/battle-group1-2";
    });
});

// 初始化页面
function initPage() {
  // 加载获胜者数据
  loadWinnersData()
    .then((data) => {
      // 直接显示第二章节前三名，不再显示章节获胜者列表
      displayChapter2Top3(data);
      // 显示总冠军
      displayChampion(data.chapter2);
    })
    .catch((error) => {
      console.error("加载获胜者数据失败:", error);
      showErrorMessage();
    });

  // 加载并显示第二章节比赛流程图
  loadTournamentBracket();
}

// 从服务器加载获胜者数据
function loadWinnersData() {
  return fetch("/resource/json/winners.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error("获取获胜者数据失败");
      }
      return response.json();
    })
    .catch((error) => {
      console.error("获取获胜者数据出错:", error);
      // 尝试从本地存储获取
      return loadWinnersFromLocalStorage();
    });
}

// 从本地存储获取获胜者数据
function loadWinnersFromLocalStorage() {
  console.log("尝试从本地存储获取获胜者数据");

  // 尝试获取第一章节数据
  const chapter1Data = localStorage.getItem("chapter1Winners");
  // 尝试获取第二章节数据
  const chapter2Data = localStorage.getItem("chapter2Winner");

  const winners = {};

  // 解析第一章节数据
  if (chapter1Data) {
    try {
      const data = JSON.parse(chapter1Data);
      if (data && data.winners) {
        winners.chapter1 = {};
        data.winners.forEach((winner, index) => {
          winners.chapter1[`round${index + 1}`] = winner;
        });
      }
    } catch (e) {
      console.error("解析第一章节本地数据出错:", e);
    }
  }

  // 解析第二章节数据
  if (chapter2Data) {
    try {
      const data = JSON.parse(chapter2Data);
      if (data && data.winner) {
        winners.chapter2 = {
          winner: data.winner,
          // 确保加载亚军和季军数据
          runnerUp: data.runnerUp || null,
          thirdPlace: data.thirdPlace || null,
        };

        // 调试输出，确认数据正确加载
        console.log("从localStorage加载的第二章节完整数据:", {
          winner: data.winner,
          runnerUp: data.runnerUp,
          thirdPlace: data.thirdPlace,
        });
      }
    } catch (e) {
      console.error("解析第二章节本地数据出错:", e);
    }
  }

  console.log("从本地存储获取的获胜者数据:", winners);

  if (Object.keys(winners).length === 0) {
    throw new Error("无法获取获胜者数据");
  }

  return winners;
}

// 显示第二章节前三名
function displayChapter2Top3(winners) {
  // 检查是否有第二章节数据
  if (!winners || !winners.chapter2) return;

  console.log("准备显示第二章节前三名数据:", winners.chapter2);

  // 获取第二章节数据
  const chapter2 = winners.chapter2;

  // 解决同一个人可能出现在多个名次的问题
  let usedPlayers = new Set();
  let top3Players = [];

  // 首先添加冠军
  if (chapter2.winner) {
    top3Players.push({
      rank: 1,
      name: chapter2.winner,
    });
    usedPlayers.add(chapter2.winner);
  }

  // 然后添加亚军（如果与冠军不同）
  if (chapter2.runnerUp && !usedPlayers.has(chapter2.runnerUp)) {
    top3Players.push({
      rank: 2,
      name: chapter2.runnerUp,
    });
    usedPlayers.add(chapter2.runnerUp);
  }

  // 最后添加季军（如果与冠军和亚军不同）
  if (chapter2.thirdPlace && !usedPlayers.has(chapter2.thirdPlace)) {
    top3Players.push({
      rank: 3,
      name: chapter2.thirdPlace,
    });
    usedPlayers.add(chapter2.thirdPlace);
  }

  console.log("去重后的前三名数据:", top3Players);

  // 如果没有足够的选手，添加placeholder
  while (top3Players.length < 3) {
    top3Players.push({
      rank: top3Players.length + 1,
      name: "- 暂无 -",
    });
  }

  // 显示前三名
  const rankPositions = document.querySelectorAll(".rank-position");
  top3Players.forEach((player) => {
    const position = document.querySelector(
      `.rank-position[data-rank="${player.rank}"]`
    );
    if (position) {
      const playerElement = document.createElement("div");
      playerElement.className = "player-item";
      playerElement.textContent = player.name;

      // 清空现有内容并添加新元素
      const rankPlayer = position.querySelector(".rank-player");
      if (rankPlayer) {
        rankPlayer.innerHTML = "";
        rankPlayer.appendChild(playerElement);
      }
    }
  });
}

// 显示总冠军
function displayChampion(chapter2Data) {
  const container = document.getElementById("champion-display");
  if (!container) return;

  if (!chapter2Data || !chapter2Data.winner) {
    container.innerHTML = "<p>请完成所有章节的比赛</p>";
    return;
  }

  container.innerHTML = `
    <div class="champion-trophy">🏆</div>
    <div class="champion-name">${chapter2Data.winner}</div>
    <p>恭喜获得总冠军！</p>
  `;
}

// 显示错误信息
function showErrorMessage() {
  // 简化错误信息，只显示相关部分的错误
  document.getElementById("chapter2-top3").innerHTML =
    "<p class='error'>加载数据失败，请刷新页面重试</p>";

  document.getElementById("champion-display").innerHTML =
    "<p class='error'>加载数据失败，请刷新页面重试</p>";
}

// 加载并显示第二章节比赛流程图
function loadTournamentBracket() {
  const bracketContainer = document.getElementById("bracket-container");
  if (!bracketContainer) return;

  // 尝试从服务器加载比赛流程数据
  fetch("/resource/json/battle-group1-2-process.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error("无法加载比赛流程数据");
      }
      return response.json();
    })
    .then((data) => {
      console.log("成功加载第二章节比赛流程数据:", data);
      displayTournamentBracket(data, bracketContainer);
    })
    .catch((error) => {
      console.error("加载比赛流程数据失败:", error);
      bracketContainer.innerHTML =
        "<p class='error'>无法加载比赛流程数据，请刷新页面重试。</p>";
    });
}

// 显示第二章节比赛流程图
function displayTournamentBracket(tournamentData, container) {
  if (!tournamentData || !tournamentData.bracket) {
    container.innerHTML = "<p>暂无比赛数据</p>";
    return;
  }

  // 清空容器
  container.innerHTML = "";

  // 创建整个比赛流程的HTML
  const bracketHTML = `
    <div class="tournament-flow">
      <div class="bracket-section">
        <h3 class="bracket-title winner-title">胜者组</h3>
        ${createWinnerBracket(tournamentData.bracket.winner)}
      </div>
      
      <div class="bracket-section">
        <h3 class="bracket-title loser-title">败者组</h3>
        ${createLoserBracket(tournamentData.bracket.loser)}
      </div>
      
      <div class="bracket-section">
        <h3 class="bracket-title final-title">决赛</h3>
        ${createFinalBracket(tournamentData.bracket.final)}
      </div>
    </div>
  `;

  container.innerHTML = bracketHTML;
}

// 创建胜者组的HTML
function createWinnerBracket(winnerBracket) {
  if (
    !winnerBracket ||
    !Array.isArray(winnerBracket) ||
    winnerBracket.length === 0
  ) {
    return "<p>暂无胜者组数据</p>";
  }

  let html = '<div class="bracket-rounds winner-rounds">';

  winnerBracket.forEach((round, roundIndex) => {
    html += `<div class="bracket-round" data-round="${round.round}">
      <div class="round-title">第${round.round}轮</div>
      <div class="matches-container">`;

    if (round.matches && Array.isArray(round.matches)) {
      round.matches.forEach((match, matchIndex) => {
        html += createMatchCard(match, "winner", round.round, matchIndex);
      });
    }

    html += `</div></div>`;
  });

  html += "</div>";
  return html;
}

// 创建败者组的HTML
function createLoserBracket(loserBracket) {
  if (
    !loserBracket ||
    !Array.isArray(loserBracket) ||
    loserBracket.length === 0
  ) {
    return "<p>暂无败者组数据</p>";
  }

  let html = '<div class="bracket-rounds loser-rounds">';

  loserBracket.forEach((round, roundIndex) => {
    html += `<div class="bracket-round" data-round="${round.round}">
      <div class="round-title">第${round.round}轮</div>
      <div class="matches-container">`;

    if (round.matches && Array.isArray(round.matches)) {
      round.matches.forEach((match, matchIndex) => {
        html += createMatchCard(match, "loser", round.round, matchIndex);
      });
    }

    html += `</div></div>`;
  });

  html += "</div>";
  return html;
}

// 创建决赛的HTML
function createFinalBracket(finalBracket) {
  if (
    !finalBracket ||
    !Array.isArray(finalBracket) ||
    finalBracket.length === 0
  ) {
    return "<p>暂无决赛数据</p>";
  }

  let html = '<div class="bracket-rounds final-rounds">';

  finalBracket.forEach((round, roundIndex) => {
    let roundTitle = round.round === 1 ? "决赛" : "冠军决定战";
    html += `<div class="bracket-round" data-round="${round.round}">
      <div class="round-title">${roundTitle}</div>
      <div class="matches-container">`;

    if (round.matches && Array.isArray(round.matches)) {
      round.matches.forEach((match, matchIndex) => {
        html += createMatchCard(match, "final", round.round, matchIndex);
      });
    }

    html += `</div></div>`;
  });

  html += "</div>";
  return html;
}

// 创建单场比赛卡片
function createMatchCard(match, bracketType, round, matchIndex) {
  const player1 = match.player1 || "TBD";
  const player2 = match.player2 || "TBD";
  const winner = match.winner;
  const loser = match.loser;

  let p1Class =
    player1 === winner ? "winner" : player1 === loser ? "loser" : "";
  let p2Class =
    player2 === winner ? "winner" : player2 === loser ? "loser" : "";

  // 默认和TBD选手的样式
  if (player1 === "TBD") p1Class = "tbd";
  if (player2 === "TBD") p2Class = "tbd";

  // 添加匹配类型标记
  const matchTypeClass = match.isFinal ? "final-match" : "";

  return `
    <div class="match-card ${bracketType}-match ${matchTypeClass}" data-match-index="${matchIndex}">
      <div class="match-player ${p1Class}">${player1}</div>
      <div class="match-vs">VS</div>
      <div class="match-player ${p2Class}">${player2}</div>
    </div>
  `;
}

// 启动烟花表演，减少密度和数量以降低系统负荷
function startFireworksShow() {
  // 初始启动一波较小的烟花
  createFireworks();

  // 随机间隔触发多波烟花，持续30秒但数量减少
  let totalDuration = 0;
  const maxDuration = 30000; // 减少为30秒的烟花表演

  function scheduleNextWave() {
    const interval = Math.random() * 3000 + 2000; // 2-5秒间隔，减少频率
    if (totalDuration < maxDuration) {
      setTimeout(() => {
        createFireworks();
        totalDuration += interval;
        scheduleNextWave();
      }, interval);
    }
  }

  scheduleNextWave();
}

// 创建烟花效果，减少数量
function createFireworks() {
  const fireworkContainer = document.getElementById("fireworkContainer");
  if (!fireworkContainer) return;

  // 清空过多的旧烟花元素，保持DOM树干净
  if (fireworkContainer.children.length > 100) {
    const elementsToRemove = fireworkContainer.children.length - 50;
    for (let i = 0; i < elementsToRemove; i++) {
      if (fireworkContainer.firstChild) {
        fireworkContainer.removeChild(fireworkContainer.firstChild);
      }
    }
  }

  // 创建更少的烟花
  const fireworkCount = Math.floor(Math.random() * 5) + 3; // 3-8个烟花

  for (let i = 0; i < fireworkCount; i++) {
    setTimeout(() => {
      createSingleFirework(fireworkContainer);
    }, i * 300); // 降低发射密度
  }
}

// 创建单个烟花，减少粒子数量
function createSingleFirework(container) {
  // 随机位置
  const x = Math.random() * window.innerWidth;
  const y = Math.random() * window.innerHeight * 0.8;

  // 简化颜色范围但保持视觉效果
  const colors = [
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#ffff00",
    "#ff00ff",
    "#ffd700",
    "#00ffff",
  ];
  const color = colors[Math.floor(Math.random() * colors.length)];

  // 创建烟花元素
  const firework = document.createElement("div");
  firework.className = "firework";
  firework.style.left = `${x}px`;
  firework.style.top = `${y}px`;
  firework.style.backgroundColor = color;

  container.appendChild(firework);

  // 创建更少的烟花粒子
  const particleCount = Math.floor(Math.random() * 15) + 10; // 减少到10-25个粒子
  for (let i = 0; i < particleCount; i++) {
    createParticle(x, y, color, container);
  }

  // 移除烟花元素
  setTimeout(() => {
    if (container.contains(firework)) {
      container.removeChild(firework);
    }
  }, 1500);
}

// 创建烟花粒子
function createParticle(x, y, color, container) {
  const particle = document.createElement("div");
  particle.className = "particle";

  // 设置粒子位置
  particle.style.left = `${x}px`;
  particle.style.top = `${y}px`;
  particle.style.backgroundColor = color;

  // 随机角度和距离
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * 60 + 40; // 减少飞行距离到40-100px

  // 添加随机大小
  const size = Math.random() * 3 + 1; // 减小粒子尺寸到1-4px
  particle.style.width = `${size}px`;
  particle.style.height = `${size}px`;

  // 设置粒子动画
  particle.style.setProperty("--angle", angle);
  particle.style.setProperty("--distance", `${distance}px`);

  // 随机动画时长，稍微缩短
  const duration = Math.random() * 800 + 1000; // 1.0-1.8秒
  particle.style.setProperty("--duration", `${duration}ms`);

  container.appendChild(particle);

  // 移除粒子
  setTimeout(() => {
    if (container.contains(particle)) {
      container.removeChild(particle);
    }
  }, duration);
}
