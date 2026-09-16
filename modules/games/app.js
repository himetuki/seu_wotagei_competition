/**
 * games 模块（游戏中心入口）
 * 游戏卡片由 /api/modules 清单动态渲染：nav 含 "games" 的模块
 */
document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("games-grid");
  const homeButton = document.getElementById("home-btn");

  // 返回主页
  homeButton.addEventListener("click", () => {
    window.location.href = "/m/home";
  });

  // 渲染游戏卡片
  fetch("/api/modules")
    .then((r) => r.json())
    .then((modules) => {
      const list = modules
        .filter((m) => (m.nav || []).includes("games") && m.id !== "games")
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      if (list.length === 0) {
        grid.innerHTML = "<p>暂无小游戏，请在 modules/modules.json 中注册</p>";
        return;
      }

      list.forEach((m) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "game-card";
        card.dataset.game = m.id;
        card.title = m.description || "";
        card.addEventListener("click", () => {
          window.location.href = m.route;
        });
        card.addEventListener("mouseover", () => {
          card.style.transform = "translateY(-8px)";
        });
        card.addEventListener("mouseout", () => {
          card.style.transform = "translateY(-5px)";
        });

        card.innerHTML = `
          <div class="game-icon">${m.icon || "🎮"}</div>
          <h2>${m.name}</h2>
          <p>${m.description || ""}</p>
        `;
        grid.appendChild(card);
      });
    })
    .catch(() => {
      grid.innerHTML = "<p>无法连接服务器，请先启动 node server.js</p>";
    });

  // 页面淡入效果
  document.body.classList.add("fade-in");
});