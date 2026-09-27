/**
 * toast 组件工厂（L2 组件实现，P12 设计 §2.2 C）
 *
 * 契约：factory(hostEl, props, ctx) => cleanup
 *   hostEl  仅作挂载锚点（可 null）：toast 容器自建 position:fixed 节点挂 document.body，
 *           不依赖宿主插槽——宿主页无需为 toast 预留 data-slot
 *   props   onReady(api) 回调：交付 { show(message, type?, duration?) }——签名与各页
 *           历史自含 showToast 逐参兼容，迁移页只换调用目标；textContent 写入（防注入）
 *   cleanup 幂等：容器 remove + 定时器注册表 dispose（之后 show 不再产生新节点）
 *
 * 生命周期（单条 toast）：append → 10ms 加 show 类（入场过渡）→ duration 后摘 show 类
 * （出场过渡）→ 300ms 后移除节点。全部定时器经 /web/lib/timers.mjs 注册表管理，
 * cleanup 一次清空——卸载后在飞的入场/出场回调不会写已移除的节点。
 *
 * 纪律（AGENTS §4.2）：无模块级可变状态（全部状态在本次 factory 调用局部内）；
 * 不 import 其他组件；页面显式 <link rel="stylesheet" href="/m/component-toast/style.css">
 * 引入兜底外观（cmp-toast__* 命名空间，旧 .toast 类名在页面 CSS 已被占用）。
 */
import { createTimerRegistry } from "/web/lib/timers.mjs";

export function createToast(hostEl, props = {}, ctx) {
  const timers = createTimerRegistry();

  // 容器：右上角固定层（沿用 records 版视觉；挂在 body，与宿主插槽解耦）
  const container = document.createElement("div");
  container.className = "cmp-toast";
  container.setAttribute("data-component", "toast");
  document.body.appendChild(container);

  /** 弹出一条 toast；type: "success"|"error"|"warning"|"info" */
  function show(message, type = "info", duration = 3000) {
    const item = document.createElement("div");
    item.className = `cmp-toast__item cmp-toast__item--${type}`;
    item.textContent = String(message); // 消息可能拼接业务字符串，textContent 防注入
    container.appendChild(item);

    // 入场（10ms 等一帧让过渡生效）→ 出场 → 摘节点
    timers.later(() => item.classList.add("cmp-toast__item--show"), 10);
    timers.later(() => {
      item.classList.remove("cmp-toast__item--show");
      timers.later(() => item.remove(), 300);
    }, duration);
    return item;
  }

  // API 交付：调用方经 props.onReady 拿到 show（onReady 抛错不影响组件自身）
  if (typeof props.onReady === "function") {
    try {
      props.onReady({ show });
    } catch (e) {
      console.error("[component-toast] onReady 回调抛错:", e);
    }
  }

  // cleanup：容器整体移除 + 在飞定时器清空（dispose 后 later 返回 null，show 安全失效）
  return () => {
    container.remove();
    timers.dispose();
  };
}
