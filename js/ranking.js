document.addEventListener("DOMContentLoaded", () => {
  const playersList = document.getElementById("playersList");
  const rankPositions = document.querySelectorAll(".rank-position");
  let players = [];
  let awards = [];

  // 加载选手数据
  fetch("../resource/json/player2.json")
    .then((response) => response.json())
    .then((data) => {
      players = data;
      updatePlayersList();
    })
    .catch((error) => {
      console.error("加载选手数据失败:", error);
    });

  // 加载奖品数据
  fetch("../resource/json/award.json")
    .then((response) => response.json())
    .then((data) => {
      awards = data;
    })
    .catch((error) => {
      console.error("加载奖品数据失败:", error);
    });

  // 更新选手列表
  function updatePlayersList() {
    playersList.innerHTML = "";
    players.forEach((player) => {
      if (!player.ranked) {
        const li = document.createElement("li");
        li.textContent = player.name;
        li.dataset.name = player.name;
        li.addEventListener("click", moveToRanking);
        playersList.appendChild(li);
      }
    });
  }

  // 显示奖品信息
  function displayAward(rankPosition, playerName) {
    const rank = parseInt(rankPosition.dataset.rank);
    if (rank <= 3) {
      // 只有前三名显示奖品
      const awardElement = rankPosition.querySelector(".rank-award");
      const award = awards.find((a) => a.rank === rank);

      if (award && awardElement) {
        const awardContainer = document.createElement("div");
        awardContainer.className = "award-container";

        const awardName = document.createElement("div");
        awardName.className = "award-name";
        awardName.textContent = award.name;

        const awardDesc = document.createElement("div");
        awardDesc.className = "award-description";
        awardDesc.textContent = award.description;

        awardContainer.appendChild(awardName);
        awardContainer.appendChild(awardDesc);

        // 清空现有内容并添加新内容
        awardElement.innerHTML = "";
        awardElement.appendChild(awardContainer);

        // 显示奖品区域，添加动画效果
        setTimeout(() => {
          awardElement.style.opacity = "1";
        }, 300);
      }
    }
  }

  // 将选手移动到排名位置
  function moveToRanking(event) {
    const playerName = event.target.dataset.name;

    // 修改：找到空排名位置，但优先选择较大的排名（从第5名开始）
    let emptyPositions = Array.from(rankPositions).filter(
      (position) => !position.querySelector(".player-item")
    );

    // 按排名从大到小排序（5,4,3,2,1）
    emptyPositions.sort((a, b) => {
      return parseInt(b.dataset.rank) - parseInt(a.dataset.rank);
    });

    const emptyPosition = emptyPositions[0];

    if (!emptyPosition) {
      alert("排名已满！");
      return;
    }

    // 创建全屏烟花效果
    createFireworks();

    // 创建将移动的元素
    const playerElement = document.createElement("div");
    playerElement.className = "player-item";
    playerElement.textContent = playerName;
    playerElement.dataset.name = playerName;
    playerElement.addEventListener("click", moveBackToList);

    // 添加元素到排名位置
    emptyPosition.querySelector(".rank-player").appendChild(playerElement);

    // 显示奖品信息（如果是前三名）
    displayAward(emptyPosition, playerName);

    // 添加特效
    playerElement.style.animation = "appear 0.8s ease-out";

    // 动画结束后重置
    setTimeout(() => {
      playerElement.style.animation = "";
    }, 800);

    // 更新选手状态并刷新列表
    players.find((player) => player.name === playerName).ranked = true;
    updatePlayersList();
  }

  // 创建全屏烟花效果
  function createFireworks() {
    const fireworkContainer = document.createElement("div");
    fireworkContainer.className = "firework-container";
    document.body.appendChild(fireworkContainer);

    const colors = [
      "#ff0000",
      "#ffff00",
      "#00ff00",
      "#00ffff",
      "#0000ff",
      "#ff00ff",
    ];

    // 创建多个烟花
    for (let i = 0; i < 15; i++) {
      setTimeout(() => {
        const firework = document.createElement("div");
        firework.className = "firework";
        firework.style.left = Math.random() * 100 + "%";
        firework.style.top = Math.random() * 100 + "%";
        firework.style.color =
          colors[Math.floor(Math.random() * colors.length)];
        fireworkContainer.appendChild(firework);

        // 烟花动画结束后移除
        setTimeout(() => {
          firework.remove();
        }, 1000);
      }, i * 100);
    }

    // 移除烟花容器
    setTimeout(() => {
      fireworkContainer.remove();
    }, 2000);
  }

  // 将选手从排名移回列表
  function moveBackToList(event) {
    const playerName = event.target.dataset.name;
    const rankPosition = event.target.closest(".rank-position");
    const awardElement = rankPosition?.querySelector(".rank-award");

    // 隐藏奖品
    if (awardElement) {
      awardElement.style.opacity = "0";
      setTimeout(() => {
        awardElement.innerHTML = "";
      }, 500);
    }

    // 动画效果
    event.target.style.animation = "appear 0.5s ease-out reverse";

    // 等待动画完成后移除
    setTimeout(() => {
      event.target.remove();

      // 更新选手状态并刷新列表
      players.find((player) => player.name === playerName).ranked = false;
      updatePlayersList();
    }, 500);
  }

  // 返回主页
  document.getElementById("homeButton").addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // 返回比赛界面
  document.getElementById("battleButton").addEventListener("click", () => {
    window.location.href = "battle-group2.html";
  });
});
