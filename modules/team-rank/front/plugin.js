/**
 * modules/team-rank 前端插件（P4 迁移，原 team_rank.js 逻辑整体迁入）
 *
 * 团体赛最终排名页：优先读 localStorage "groupBattleFinal"，否则请求
 * /api/group-battle-process，按胜场降序/负场升序逐项动画展示（400ms 间隔）。
 *
 * 形态适配说明（逻辑逐行保留）：
 *   - 原 DOMContentLoaded 包裹已去除（kernel 装配完成后调用 component，DOM 早已就绪）
 *   - 静态骨架按钮（home-btn）监听经 AbortController signal 登记，重渲染/卸载时
 *     abort 统一解绑
 *   - 排名项 400ms 逐个落位与 50ms 显形延时经 schedule() 登记，cleanup 时逐个
 *     clearTimeout 并清空 #rank-list（动态节点连同无监听一并释放）
 *   - fetch("/api/group-battle-process") 为 origin 相对路径（AGENTS §5-2）
 *   - 标题与奖牌图标为内联 SVG（Tabler，经 /web/icons.mjs 渲染），替代原 emoji
 */

import { iconEl } from "/web/icons.mjs";

export default {
  name: "team-rank", // key 必须 = 模块 id，kernel 装配完按它 render
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({
      key: "team-rank",
      component(el, meta, ctx2) {
        // cleanup 契约：静态骨架监听经 signal 登记；延时任务经 schedule 登记
        const bindAbort = new AbortController();
        const { signal } = bindAbort;
        const timers = new Set();
        const schedule = (fn, ms) => {
          const t = setTimeout(() => {
            timers.delete(t);
            fn();
          }, ms);
          timers.add(t);
          return t;
        };

        loadAndDisplayResults();

        bindEvents();

        // 标题装饰图标（静态骨架占位 span → 内联 SVG，纯装饰 aria-hidden）
        document.querySelectorAll("header h1 [data-icon]").forEach((host) => {
          const name = host.getAttribute("data-icon");
          const svg = iconEl(name, { size: 40, class: "title-icon-svg" });
          if (svg) host.replaceChildren(svg);
        });

        function bindEvents() {
          document.getElementById("home-btn").addEventListener(
            "click",
            () => {
              window.location.href = "/m/home";
            },
            { signal }
          );
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
            fetch("/api/group-battle-process")
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
            schedule(() => {
              const item = createRankItem(group, index);
              rankList.appendChild(item);

              // 触发动画
              schedule(() => {
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

          // 奖牌：Tabler outline 图标 + 名次配色（金/银/铜复用 .rank-position 既有色值）
          // 1 名用 trophy，2/3 名同形 award 以颜色区分，4 名及以后用 medal 弱化兜底
          const medal = document.createElement("div");
          medal.className = `rank-medal medal-${
            index === 0 ? "gold" : index === 1 ? "silver" : index === 2 ? "bronze" : "plain"
          }`;
          const medalIcon = iconEl(
            index === 0 ? "trophy" : index <= 2 ? "award" : "medal",
            { size: 48 }
          );
          if (medalIcon) medal.appendChild(medalIcon);

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

        // cleanup（重渲染/卸载时由 ctx.ui 调用）
        return () => {
          // signal 登记的静态骨架按钮监听统一解绑
          bindAbort.abort();
          // 排名项落位/显形延时任务终止
          timers.forEach((t) => clearTimeout(t));
          timers.clear();
          // 动态节点（rank-item）释放
          const rankList = document.getElementById("rank-list");
          if (rankList) rankList.innerHTML = "";
        };
      },
    });
  },
};
