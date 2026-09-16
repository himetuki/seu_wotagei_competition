/**
 * home 模块（主页）
 * 入口按钮由 /api/modules 清单动态渲染：nav 含 "index" 的模块按 order 排序显示
 */
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("nav-buttons");

  fetch("/api/modules")
    .then((r) => r.json())
    .then((modules) => {
      const list = modules
        .filter((m) => (m.nav || []).includes("index") && m.id !== "home")
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      if (list.length === 0) {
        container.innerHTML =
          "<p>暂无可用功能，请先在 modules/modules.json 中注册模块</p>";
        return;
      }

      // 主次分级：select 为一级入口（全宽高亮），其余为二级入口（等宽宫格）
      list.forEach((m) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = m.id === "select" ? "start-btn" : "nav-btn";
        btn.title = m.description || "";

        const icon = document.createElement("span");
        icon.className = "btn-icon";
        icon.textContent = m.icon || "✳️";

        const label = document.createElement("span");
        label.className = "btn-label";
        label.textContent = m.name;

        btn.appendChild(icon);
        btn.appendChild(label);

        btn.addEventListener("click", () => {
          window.location.href = m.route;
        });
        container.appendChild(btn);
      });
    })
    .catch(() => {
      container.innerHTML =
        "<p>无法连接服务器，请先启动 node server.js</p>";
    });
});