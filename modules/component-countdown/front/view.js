/**
 * countdown 组件工厂（L2 组件实现，P14 规格 §4.3）
 *
 * 职责：mm:ss 倒计时——未运行时可 ±1 分钟调整；「开始/暂停」切换；「重置」回到
 * 配置时长。运行时以 250ms 递归 later 轮询、按墙钟差计算（记录 deadline，避免
 * setInterval 累计漂移）；到 0 停表、时间显示加 countdown__time--done 类（变红）。
 *
 * 契约：factory(hostEl, props, ctx) => cleanup
 *   props.title    string 卡片头标题（缺省「倒计时」）
 *   props.minutes  number 分钟（缺省 3，收敛到 0..600 整数）
 *   props.seconds  number 秒（缺省 0，收敛到 0..59 整数）
 *
 * 定时器：全部经 /web/lib/timers.mjs 的 createTimerRegistry——250ms 一次性 later
 * 在回调尾部续排下一次（dispose 后 later 返回 null，递归自然终止，cleanup 必回收）。
 *
 * 纪律（AGENTS §4.2）：无模块级可变状态；监听全传 { signal }；不碰 body class、
 * 不 import 其他组件、不写 style.css（外观由宿主页 CSS 提供，类名 .countdown__*）；
 * 图标一律 /web/icons.mjs 的 iconEl()（plus / minus / player-play / player-pause / refresh）。
 */
import { createTimerRegistry } from "/web/lib/timers.mjs";
import { iconEl } from "/web/icons.mjs";

const TICK_MS = 250;
const MINUTE_MS = 60000;

/** 数值 props 收敛：整数 + 区间钳制（缺省 fallback） */
function clampInt(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function createCountdown(host, props = {}, ctx) {
  if (!host) return undefined;
  const ctrl = new AbortController();
  const { signal } = ctrl;
  const timers = createTimerRegistry();

  const initialMs =
    clampInt(props.minutes, 3, 0, 600) * MINUTE_MS + clampInt(props.seconds, 0, 0, 59) * 1000;

  // 全部状态在工厂局部
  let remainingMs = initialMs; // 剩余毫秒
  let deadline = 0; // 运行中的到点墙钟（startAt + remainingMs）
  let running = false;
  let done = false;

  // ---- 静态骨架 ----
  host.innerHTML = `
    <div class="countdown" data-component="countdown">
      <div class="countdown__header">
        <span class="countdown__title"></span>
      </div>
      <div class="countdown__body">
        <span class="countdown__time"></span>
      </div>
      <div class="countdown__footer">
        <button type="button" class="countdown__btn" data-act="minus"></button>
        <button type="button" class="countdown__btn" data-act="plus"></button>
        <button type="button" class="countdown__btn countdown__btn--primary" data-act="toggle"></button>
        <button type="button" class="countdown__btn" data-act="reset"></button>
      </div>
    </div>
  `;
  const root = host.querySelector(".countdown");
  const titleEl = root.querySelector(".countdown__title");
  const timeEl = root.querySelector(".countdown__time");
  const footerEl = root.querySelector(".countdown__footer");

  titleEl.textContent =
    typeof props.title === "string" && props.title.trim() ? props.title : "倒计时";

  /** 按钮内容 = 图标（+ 可选文字）；iconEl 未知名返回 null，守卫后再 append */
  function setBtn(act, iconName, label, text) {
    const btn = footerEl.querySelector(`[data-act="${act}"]`);
    if (!btn) return;
    btn.textContent = "";
    const svg = iconEl(iconName, text ? { size: 16 } : { size: 18, label });
    if (svg) btn.append(svg);
    if (text) {
      const span = document.createElement("span");
      span.textContent = text;
      btn.append(span);
    }
  }

  function render() {
    timeEl.textContent = formatTime(remainingMs);
    timeEl.classList.toggle("countdown__time--done", done);
    setBtn("toggle", running ? "player-pause" : "player-play", "开始", running ? "暂停" : "开始");
    // 调整按钮仅未运行时可用（规格：未开始时可 ±1 分调整）
    for (const act of ["minus", "plus"]) {
      const btn = footerEl.querySelector(`[data-act="${act}"]`);
      if (btn) btn.disabled = running;
    }
  }

  /** 250ms 递归 later：按墙钟差刷新剩余；到 0 停表标红（dispose 后不再续排） */
  function scheduleTick() {
    timers.later(() => {
      if (!running) return;
      remainingMs = Math.max(0, deadline - Date.now());
      if (remainingMs <= 0) {
        running = false;
        done = true;
        render();
        return; // 停表：不再续排
      }
      render();
      scheduleTick();
    }, TICK_MS);
  }

  function start() {
    if (running || done && remainingMs <= 0) return;
    running = true;
    deadline = Date.now() + remainingMs; // 墙钟差计算，消除累计漂移
    render();
    scheduleTick();
  }

  function pause() {
    if (!running) return;
    running = false;
    remainingMs = Math.max(0, deadline - Date.now());
    render();
  }

  function adjust(deltaMs) {
    if (running) return; // 未开始/已暂停才可调
    remainingMs = Math.max(0, remainingMs + deltaMs);
    if (remainingMs > 0) done = false; // 从 0 调回正数时摘红，恢复可用
    render();
  }

  function reset() {
    running = false;
    remainingMs = initialMs;
    done = false;
    render();
  }

  footerEl.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest(".countdown__btn");
      if (!btn || btn.disabled) return;
      const act = btn.dataset.act;
      if (act === "toggle") running ? pause() : start();
      else if (act === "minus") adjust(-MINUTE_MS);
      else if (act === "plus") adjust(MINUTE_MS);
      else if (act === "reset") reset();
    },
    { signal }
  );

  // 初始按钮：minus/plus 图标（图标即唯一语义 → label）
  setBtn("minus", "minus", "减 1 分钟");
  setBtn("plus", "plus", "加 1 分钟");
  setBtn("reset", "refresh", null, "重置");
  render();

  // ---- cleanup：定时器注册表 dispose（在飞 tick 与迟到续排一并终止）+ 解绑监听 ----
  return function cleanup() {
    timers.dispose();
    ctrl.abort();
  };
}
