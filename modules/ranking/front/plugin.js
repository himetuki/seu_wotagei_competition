/**
 * modules/ranking 前端插件（P4 迁移，原 ranking.js 逻辑整体迁入）
 *
 * 排行榜（一年内组）：点击选手列表项放入 1-5 名次位（从第5名起填），前三名展示
 * 奖品，可点回列表。数据源 /resource/json/player2.json、/resource/json/award.json
 * —— 均 origin 相对路径（AGENTS §5-2）。
 *
 * 形态适配说明（逻辑逐行保留）：
 *   - 原 DOMContentLoaded 包裹已去除（kernel 装配完成后调用 component，DOM 早已就绪）
 *   - 原 DOMContentLoaded 闭包内变量/函数 → 组件闭包作用域，交叉引用不变
 *   - 静态骨架按钮（homeButton / battleButton）监听经 AbortController signal 登记，
 *     重渲染/卸载时 abort 统一解绑
 *   - 全部 setTimeout（烟花爆发、奖品淡入、回列表动画/状态回滚）经 schedule()
 *     登记进 timers 集合，cleanup 时逐个 clearTimeout，防止卸载后向 body 追加
 *     烟花容器或对已释放节点回调
 *   - 选手列表 li / 排名 player-item 为动态节点（click 监听随节点释放），
 *     cleanup 时清空 #playersList；rank-award 恢复初始 opacity
 *
 * P11-B7 共享化（仅两处，语义逐行等价）：
 *   - 烟花配色"等概率取 1 个" → /web/lib/random.mjs 的 pickOne（原 colors[floor(random*len)]，
 *     分布一致；rank 页同款用法 → 满足 R2 跨模块复用）
 *   - 主区两栏（选手列表 / 排名）→ /web/components/grid.css 的 .grid-split：原 flex 固定
 *     比例（25% / 65% + max-width:250px）无任何窄屏适配，320px 下靠 flex 收缩硬挤；
 *     改后按容器宽度连续自适应、窄屏自动上下堆叠（零断点）。宽屏由 25/65 变为等宽两栏。
 *   烟花爆点（15 发 CSS-only 动画，随机 left/top 百分比）为本页专属视觉，保留在页面内：
 *   rank 页烟花为 30 秒波次 + 粒子系统，算法不同；统一需新增 L2 组件插件（超出本次文件域）。
 */

import { pickOne } from "/web/lib/random.mjs";

export default {
  name: "ranking", // key 必须 = 模块 id，kernel 装配完按它 render
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({
      key: "ranking",
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

        const playersList = document.getElementById("playersList");
        const rankPositions = document.querySelectorAll(".rank-position");
        let players = [];
        let awards = [];

        // 加载选手数据
        fetch("/resource/json/player2.json")
          .then((response) => response.json())
          .then((data) => {
            players = data;
            updatePlayersList();
          })
          .catch((error) => {
            console.error("加载选手数据失败:", error);
          });

        // 加载奖品数据
        fetch("/resource/json/award.json")
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
            // 只有前三名显示奖品（纵深防御：数据源若为旧库存量对象形态，
            // 非数组时不查奖直接跳过，避免 find 之前抛 TypeError）
            const awardElement = rankPosition.querySelector(".rank-award");
            const award = Array.isArray(awards)
              ? awards.find((a) => a.rank === rank)
              : null;

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
              schedule(() => {
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
          schedule(() => {
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
            schedule(() => {
              const firework = document.createElement("div");
              firework.className = "firework";
              firework.style.left = Math.random() * 100 + "%";
              firework.style.top = Math.random() * 100 + "%";
              firework.style.color = pickOne(colors); // /web/lib/random.mjs（等概率取 1 个）
              fireworkContainer.appendChild(firework);

              // 烟花动画结束后移除
              schedule(() => {
                firework.remove();
              }, 1000);
            }, i * 100);
          }

          // 移除烟花容器
          schedule(() => {
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
            schedule(() => {
              awardElement.innerHTML = "";
            }, 500);
          }

          // 动画效果
          event.target.style.animation = "appear 0.5s ease-out reverse";

          // 等待动画完成后移除
          schedule(() => {
            event.target.remove();

            // 更新选手状态并刷新列表
            players.find((player) => player.name === playerName).ranked = false;
            updatePlayersList();
          }, 500);
        }

        // 返回主页（静态骨架 → signal 登记）
        document.getElementById("homeButton").addEventListener(
          "click",
          () => {
            window.location.href = "/m/home";
          },
          { signal }
        );

        // 返回比赛界面
        document.getElementById("battleButton").addEventListener(
          "click",
          () => {
            window.location.href = "/m/battle-group2";
          },
          { signal }
        );

        // cleanup（重渲染/卸载时由 ctx.ui 调用）
        return () => {
          // signal 登记的静态骨架按钮监听统一解绑
          bindAbort.abort();
          // 烟花/动画等全部延时任务终止
          timers.forEach((t) => clearTimeout(t));
          timers.clear();
          // 清 timer 会连带取消烟花容器自身的 2s 移除回调——卸载窗口内补扫，
          // 否则 .firework-container 永久残留 body
          document
            .querySelectorAll(".firework-container")
            .forEach((n) => n.remove());
          // 动态节点（选手 li / 排名 player-item）连同监听一并释放
          if (playersList) playersList.innerHTML = "";
          document
            .querySelectorAll(".rank-player")
            .forEach((n) => (n.innerHTML = ""));
          // 奖品区恢复初始隐藏态，避免重渲染后残留上一轮内容
          document
            .querySelectorAll(".rank-award")
            .forEach((n) => ((n.innerHTML = ""), (n.style.opacity = "")));
        };
      },
    });
  },
};
