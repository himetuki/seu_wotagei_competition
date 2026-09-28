/**
 * score-board 组件工厂（L2 组件实现，P14 规格 §4.2）
 *
 * 职责：多队计分——每队可编辑队名（input change 更新内存）+ 大数字分值 + 加/减按钮
 * （步进 step），底部「清零」。分值下限 0 无上限，状态仅内存、不持久化。
 *
 * 契约：factory(hostEl, props, ctx) => cleanup
 *   props.title    string          卡片头标题（缺省「计分板」）
 *   props.teams    [{ name }]      队伍（缺省 [{红方},{蓝方}]；最多取前 4 队；
 *                                  空数组/非数组/元素缺 name 时逐级回落默认）
 *   props.step     number          步进（缺省 1，收敛到 1..99 整数）
 *   props.onReady  ({ getScores }) 实例就绪即交付 { getScores: () => [{ name, score }] }
 *
 * 纪律（AGENTS §4.2）：无模块级可变状态；监听全传 { signal }；不碰 body class、
 * 不 import 其他组件、不写 style.css（外观由宿主页 CSS 提供，类名 .score-board__*）；
 * 图标一律 /web/icons.mjs 的 iconEl()（plus / minus / refresh），禁 emoji、禁内联 path。
 */
import { iconEl } from "/web/icons.mjs";

const MAX_TEAMS = 4;

/** props.teams → [{ name, score:0 }]（畸形输入逐级回落：默认双队） */
function normalizeTeams(teams) {
  if (!Array.isArray(teams) || teams.length === 0) {
    return [
      { name: "红方", score: 0 },
      { name: "蓝方", score: 0 },
    ];
  }
  return teams.slice(0, MAX_TEAMS).map((t, i) => ({
    name: t && typeof t.name === "string" && t.name.trim() ? t.name : `队伍${i + 1}`,
    score: 0,
  }));
}

/** props.step → 1..99 整数（缺省 1） */
function normalizeStep(step) {
  const n = Math.floor(Number(step));
  if (!Number.isFinite(n)) return 1;
  return Math.min(99, Math.max(1, n));
}

export function createScoreBoard(host, props = {}, ctx) {
  if (!host) return undefined;
  const ctrl = new AbortController();
  const { signal } = ctrl;

  const teams = normalizeTeams(props.teams); // 状态仅内存，工厂局部
  const step = normalizeStep(props.step);

  // ---- 静态骨架 ----
  host.innerHTML = `
    <div class="score-board" data-component="score-board">
      <div class="score-board__header">
        <span class="score-board__title"></span>
      </div>
      <div class="score-board__body"></div>
      <div class="score-board__footer">
        <button type="button" class="score-board__reset"></button>
      </div>
    </div>
  `;
  const root = host.querySelector(".score-board");
  const titleEl = root.querySelector(".score-board__title");
  const bodyEl = root.querySelector(".score-board__body");
  const resetBtn = root.querySelector(".score-board__reset");

  titleEl.textContent =
    typeof props.title === "string" && props.title.trim() ? props.title : "计分板";

  /** 图标按钮内容：iconEl 未知名/无 DOM 返回 null，守卫后再 append */
  function setIconBtn(btn, iconName, label, text) {
    btn.textContent = "";
    const svg = iconEl(iconName, text ? { size: 16 } : { size: 18, label });
    if (svg) btn.append(svg);
    if (text) {
      const span = document.createElement("span");
      span.textContent = text;
      btn.append(span);
    }
  }

  // ---- 每队一行：队名 input + 分值 + 加/减 ----
  const scoreEls = []; // 与 teams 下标一一对应
  teams.forEach((team, i) => {
    const row = document.createElement("div");
    row.className = "score-board__team";
    row.dataset.index = String(i);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "score-board__name";
    nameInput.value = team.name; // 用户数据走 value 属性，防注入
    nameInput.setAttribute("aria-label", "队名");
    nameInput.addEventListener(
      "change",
      () => {
        team.name = nameInput.value.trim() || `队伍${i + 1}`;
        nameInput.value = team.name;
      },
      { signal }
    );

    const scoreEl = document.createElement("span");
    scoreEl.className = "score-board__score";
    scoreEl.textContent = "0";
    scoreEls.push(scoreEl);

    const minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.className = "score-board__btn";
    minusBtn.dataset.act = "minus";
    setIconBtn(minusBtn, "minus", "减分");

    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className = "score-board__btn";
    plusBtn.dataset.act = "plus";
    setIconBtn(plusBtn, "plus", "加分");

    row.append(nameInput, scoreEl, minusBtn, plusBtn);
    bodyEl.append(row);
  });

  // ---- 底部清零 ----
  setIconBtn(resetBtn, "refresh", null, "清零");

  /** 分值变更统一出口：clamp 下限 0 → 写内存 → 刷显示 */
  function changeScore(i, delta) {
    const team = teams[i];
    if (!team) return;
    team.score = Math.max(0, team.score + delta);
    scoreEls[i].textContent = String(team.score);
  }

  // ---- 加/减/清零（事件委托） ----
  root.addEventListener(
    "click",
    (e) => {
      const reset = e.target.closest(".score-board__reset");
      if (reset) {
        teams.forEach((team, i) => changeScore(i, -team.score));
        return;
      }
      const btn = e.target.closest(".score-board__btn");
      if (!btn || !bodyEl.contains(btn)) return;
      const row = btn.closest(".score-board__team");
      const i = Number(row && row.dataset.index);
      if (!Number.isInteger(i) || i < 0 || i >= teams.length) return;
      if (btn.dataset.act === "plus") changeScore(i, step);
      else if (btn.dataset.act === "minus") changeScore(i, -step);
    },
    { signal }
  );

  // ---- API 交付（卸载后 getScores 仍可安全调用，读的是工厂局部闭包） ----
  if (typeof props.onReady === "function") {
    try {
      props.onReady({
        getScores: () => teams.map((t) => ({ name: t.name, score: t.score })),
      });
    } catch (e) {
      console.error("[score-board] onReady 回调抛错:", e);
    }
  }

  // ---- cleanup：abort 一次解绑全部监听 ----
  return function cleanup() {
    ctrl.abort();
  };
}
