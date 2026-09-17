/**
 * modules/home 前端插件（P4 迁移，原 app.js 逻辑整体迁入）
 *
 * 主页：入口按钮由 /api/modules 清单动态渲染，nav 含 "index" 的模块按 order 排序。
 * 本页面由三种路径服务（"/"、"/index.html"、"/m/home/"），web/loader.mjs 将前两者
 * 的 moduleId 归一为 "home"，三种路径装配的都是本插件，行为一致。
 *
 * 形态适配说明（逻辑逐行保留）：
 *   - 原 DOMContentLoaded 包裹已去除（kernel 装配完成后调用 component，DOM 早已就绪）
 *   - 按钮 click 监听挂在动态创建节点上，随 container 清空连同节点一并释放，
 *     本页无静态骨架监听与 document/window 级监听，无需 AbortController
 *   - fetch("/api/modules") 为 origin 相对路径（AGENTS §5-2）
 */

import { icon, ICON_NAMES } from "/web/icons.mjs";

export default {
  name: "home", // key 必须 = 模块 id，kernel 装配完按它 render
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({
      key: "home",
      component(el, meta, ctx2) {
        const container = document.getElementById("nav-buttons");

        fetch("/api/modules")
          .then((r) => r.json())
          .then((modules) => {
            if (!container) return;

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

              const iconNode = document.createElement("span");
              iconNode.className = "btn-icon";
              iconNode.innerHTML = icon(
                ICON_NAMES.includes(m.icon) ? m.icon : "home",
                { size: m.id === "select" ? 26 : 20 }
              );

              const label = document.createElement("span");
              label.className = "btn-label";
              label.textContent = m.name;

              btn.appendChild(iconNode);
              btn.appendChild(label);

              btn.addEventListener("click", () => {
                window.location.href = m.route;
              });
              container.appendChild(btn);
            });
          })
          .catch(() => {
            if (!container) return;
            container.innerHTML =
              "<p>无法连接服务器，请先启动 node server.js</p>";
          });

        // 重渲染/卸载时清空动态内容（按钮节点及其监听器一并释放）
        return () => {
          if (container) container.innerHTML = "";
        };
      },
    });
  },
};
