/**
 * modules/rank 前端插件（P4 迁移，原 rank.js 逻辑整体迁入）
 *
 * 一年加组对战排名页：第二章节前三名 + 总冠军 + 比赛流程图 + 烟花特效。
 * 数据源 /resource/json/winners.json（失败回退 localStorage）、
 * /resource/json/battle-group1-2-process.json —— 均 origin 相对路径（AGENTS §5-2）。
 *
 * 形态适配说明（逻辑逐行保留）：
 *   - 原 DOMContentLoaded 包裹已去除（kernel 装配完成后调用 component，DOM 早已就绪）
 *   - 静态骨架按钮监听经 AbortController signal 登记，重渲染/卸载时 abort 统一解绑
 *   - 烟花表演为递归 setTimeout 波次调度（原版 ~30 秒持续），全部 setTimeout 经
 *     schedule() 登记进 timers 集合，cleanup 时逐个 clearTimeout（含烟花/粒子
 *     自移除定时器），防止卸载后继续往骨架/容器追加节点
 *   - 动态渲染节点（top3 选手、bracket 卡片）无独立监听，随 innerHTML 重写一并释放
 *   - 冠军奖杯为内联 SVG（Tabler，经 /web/icons.mjs 渲染），替代原 emoji
 *
 * P11-B7 共享化（仅两处，语义逐行等价）：
 *   - 烟花配色"等概率取 1 个" → /web/lib/random.mjs 的 pickOne（原 colors[floor(random*len)]，
 *     分布一致；ranking 页同款用法 → 满足 R2 跨模块复用）
 *   - 比赛流程图轮次栏（胜者组/败者组/决赛的等宽列）→ /web/components/grid.css 的 .grid-flow
 *     （原 flex + flex:1 等宽列 + 移动端 min-width:600px 横向滚动 hack；改后按容器宽度
 *     连续自适应，窄屏轮次纵向堆叠，不再需要横向滚动）
 *   烟花本身（30 秒波次调度 + 粒子随机角度/距离/时长）为**本页专属视觉**，保留在页面内：
 *   其随机量是数值区间（非"取 1 个"），现无共享 API；ranking 页的烟花算法不同
 *   （CSS-only 单发爆点 + body 容器），强行统一需新增 L2 组件插件（超出本次文件域与插件预算）。
 */

import { icon } from "/web/icons.mjs";
import { pickOne } from "/web/lib/random.mjs";

// HTML 转义：winners 数据可经后端接口被局域网任意客户端改写，插入 innerHTML 前须转义
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export default {
  name: "rank", // key 必须 = 模块 id，kernel 装配完按它 render
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({
      key: "rank",
      component(el, meta, ctx2) {
        // cleanup 契约：静态骨架监听经 signal 登记；所有延时任务经 schedule 登记
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

        console.log("排名页面加载完成");

        // 初始化页面
        initPage();

        // 创建烟花效果 - 增加延迟以便页面元素加载完毕
        schedule(startFireworksShow, 800);

        // 绑定按钮事件（静态骨架 → signal 登记）
        document.getElementById("home-btn").addEventListener(
          "click",
          function () {
            window.location.href = "/m/home";
          },
          { signal }
        );

        document
          .getElementById("chapter1-btn")
          .addEventListener(
            "click",
            function () {
              window.location.href = "/m/battle-group1";
            },
            { signal }
          );

        document
          .getElementById("chapter2-btn")
          .addEventListener(
            "click",
            function () {
              window.location.href = "/m/battle-group1-2";
            },
            { signal }
          );

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
          // 无数据时保留错误分支（调用方随后 showErrorMessage 覆盖容器）
          if (!winners) return;

          // ★ 缺陷修复：winners 存在但缺 chapter2 时不再提前 return ——
          //   领奖台三个槽位仍要渲染各自写好的 "- 暂无 -" 占位（与 displayChampion 的兜底一致）。
          const chapter2 = winners.chapter2 || {};

          console.log("准备显示第二章节前三名数据:", winners.chapter2);

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
            <div class="champion-trophy">${icon("trophy", { size: 50 })}</div>
            <div class="champion-name">${escapeHtml(chapter2Data.winner)}</div>
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

          let html = '<div class="bracket-rounds grid-flow winner-rounds">';

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

          let html = '<div class="bracket-rounds grid-flow loser-rounds">';

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

          let html = '<div class="bracket-rounds grid-flow final-rounds">';

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
              schedule(() => {
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
            schedule(() => {
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
          const color = pickOne(colors); // /web/lib/random.mjs（等概率取 1 个，原 colors[floor(random*len)]）

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
          schedule(() => {
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
          schedule(() => {
            if (container.contains(particle)) {
              container.removeChild(particle);
            }
          }, duration);
        }

        // cleanup（重渲染/卸载时由 ctx.ui 调用）
        return () => {
          // signal 登记的静态骨架按钮监听统一解绑
          bindAbort.abort();
          // 烟花波次/粒子等全部延时任务终止
          timers.forEach((t) => clearTimeout(t));
          timers.clear();
        };
      },
    });
  },
};
