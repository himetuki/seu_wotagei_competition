/**
 * select 模块（赛制选择，导航枢纽）
 * 分组卡片由 /api/modules 清单动态渲染：nav 含 "select" 的模块按组展示
 * 行为与原版保持一致：
 *   - 左键点击 → 进入模块
 *   - 中键点击 → 进入演出页（performance）
 */

// 分组定义：组名 → 该组包含的模块 id（按呈现顺序）
// 设置类入口不混入赛制卡片，单独渲染为底部通栏入口，避免"工具混进玩法"的认知冲突
const GROUPS = [
  {
    label: "单人赛",
    ids: ["battle-group1", "battle-group1-2", "battle-group2", "battle-group2-2"],
  },
  {
    label: "团体与表演",
    ids: ["group-battle", "drag", "music-draw"],
  },
];

// 模块 id → 卡片配色 class（沿用原版各赛制主色调）
const colorClass = {
  "battle-group1": "card--g1",
  "battle-group1-2": "card--g1-alt",
  "battle-group2": "card--g2",
  "battle-group2-2": "card--g2-alt",
  "group-battle": "card--team",
  drag: "card--drag",
  "music-draw": "card--music",
};

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("mode-sections");

  const open = (route) => {
    window.location.href = route;
  };

  const openPerformance = () => {
    // 与原版一致：中键点击进入演出页
    window.location.href = "/m/performance";
  };

  fetch("/api/modules")
    .then((r) => r.json())
    .then((modules) => {
      const byId = {};
      modules.forEach((m) => (byId[m.id] = m));

      GROUPS.forEach((group) => {
        const items = group.ids
          .map((id) => byId[id])
          .filter((m) => m && (m.nav || []).includes("select"))
          .sort((a, b) => (a.order || 0) - (b.order || 0));

        if (items.length === 0) return;

        const section = document.createElement("section");
        section.className = "mode-group";
        section.setAttribute("aria-label", group.label);

        const label = document.createElement("h3");
        label.className = "group-label";
        label.textContent = group.label;
        section.appendChild(label);

        const grid = document.createElement("div");
        grid.className = "mode-grid";

        items.forEach((m) => {
          const card = document.createElement("button");
          card.type = "button";
          card.className = `mode-card ${colorClass[m.id] || "card--neutral"}`;
          card.setAttribute("aria-label", m.description || m.name);
          card.title = m.description || "";

          const icon = document.createElement("span");
          icon.className = "card-icon";
          icon.textContent = m.icon || "🏆";

          const body = document.createElement("span");
          body.className = "card-body";

          const name = document.createElement("span");
          name.className = "card-name";
          name.textContent = m.name;

          const desc = document.createElement("span");
          desc.className = "card-desc";
          desc.textContent = m.description || "";

          body.appendChild(name);
          body.appendChild(desc);
          card.appendChild(icon);
          card.appendChild(body);

          card.addEventListener("click", () => open(m.route));
          card.addEventListener("mousedown", (e) => {
            if (e.button === 1) openPerformance();
          });
          card.addEventListener("auxclick", (e) => e.preventDefault());

          grid.appendChild(card);
        });

        section.appendChild(grid);
        container.appendChild(section);
      });

      // 单独渲染设置入口：底部通栏大按钮，和赛制卡片形成清晰层级
      const settingMod = byId["setting"];
      if (settingMod && (settingMod.nav || []).includes("select")) {
        const footerSection = document.createElement("section");
        footerSection.className = "mode-group mode-group--footer";

        const footerBtn = document.createElement("button");
        footerBtn.type = "button";
        footerBtn.className = "setting-footer-btn";
        footerBtn.title = settingMod.description || "";

        const icon = document.createElement("span");
        icon.className = "btn-icon";
        icon.textContent = settingMod.icon || "⚙️";

        const label = document.createElement("span");
        label.textContent = settingMod.name;

        footerBtn.appendChild(icon);
        footerBtn.appendChild(label);
        footerBtn.addEventListener("click", () => open(settingMod.route));

        footerSection.appendChild(footerBtn);
        container.appendChild(footerSection);
      }

      if (!container.children.length) {
        container.innerHTML =
          "<p class='empty-hint'>暂无赛制，请先在 modules/modules.json 中注册模块</p>";
      }
    })
    .catch(() => {
      container.innerHTML =
        "<p class='empty-hint'>无法连接服务器，请先启动 node server.js</p>";
    });
});