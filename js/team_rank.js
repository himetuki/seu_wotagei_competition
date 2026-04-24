/**
 * 团体赛最终排名展示页面
 */

document.addEventListener("DOMContentLoaded", () => {
  loadAndDisplayResults();
  bindEvents();
});

function bindEvents() {
  document.getElementById("home-btn").addEventListener("click", () => {
    window.location.href = "../html/index.html";
  });
}

function loadAndDisplayResults() {
  // 从 localStorage 或服务器加载结果
  let finalResult = null;

  try {
    const stored = localStorage.getItem("groupBattleFinal");
    if (stored) {
      finalResult = JSON.parse(stored);
    }
  } catch (e) {
    console.error("读取本地存储失败:", e);
  }

  if (!finalResult) {
    // 尝试从服务器加载
    fetch("http://localhost:3000/api/group-battle-process")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.finalResult) {
          displayResults(data.finalResult);
        } else {
          showError();
        }
      })
      .catch(() => {
        showError();
      });
  } else {
    displayResults(finalResult);
  }
}

function displayResults(result) {
  const rankList = document.getElementById("rank-list");
  rankList.innerHTML = "";

  if (!result || !result.groups || result.groups.length === 0) {
    showError();
    return;
  }

  // 按胜场排序（降序），胜场相同则按负场排序（升序）
  const sorted = [...result.groups].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.losses - b.losses;
  });

  // 逐个显示排名项，带动画延迟
  sorted.forEach((group, index) => {
    setTimeout(() => {
      const item = createRankItem(group, index);
      rankList.appendChild(item);

      // 触发动画
      setTimeout(() => {
        item.classList.add("visible");
      }, 50);
    }, index * 400); // 每个排名项延迟400ms
  });
}

function createRankItem(group, index) {
  const item = document.createElement("div");
  item.className = "rank-item";

  // 添加排名类名
  if (index === 0) item.classList.add("first");
  else if (index === 1) item.classList.add("second");
  else if (index === 2) item.classList.add("third");

  // 排名位置
  const position = document.createElement("div");
  position.className = "rank-position";
  position.textContent = `#${index + 1}`;

  // 组信息
  const info = document.createElement("div");
  info.className = "rank-info";

  const groupName = document.createElement("div");
  groupName.className = "rank-group";
  groupName.textContent = `${group.id}组`;

  const stats = document.createElement("div");
  stats.className = "rank-stats";
  stats.textContent = `${group.wins}胜 ${group.losses}负`;

  info.appendChild(groupName);
  info.appendChild(stats);

  // 奖牌
  const medal = document.createElement("div");
  medal.className = "rank-medal";
  if (index === 0) medal.textContent = "🥇";
  else if (index === 1) medal.textContent = "🥈";
  else if (index === 2) medal.textContent = "🥉";
  else medal.textContent = "🏅";

  item.appendChild(position);
  item.appendChild(info);
  item.appendChild(medal);

  return item;
}

function showError() {
  const rankList = document.getElementById("rank-list");
  rankList.innerHTML = `
    <div style="text-align: center; padding: 40px; color: #ef4444;">
      <h2>未找到比赛结果</h2>
      <p style="margin-top: 20px; color: #888;">请先完成团体赛</p>
    </div>
  `;
}
