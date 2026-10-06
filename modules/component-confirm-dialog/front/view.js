/**
 * confirm-dialog 组件工厂（L2 组件实现，P12 设计 §2.2 D）
 *
 * 契约：factory(hostEl, props, ctx) => cleanup
 *   hostEl  仅作挂载锚点（可 null）：遮罩 + 对话框自建节点挂 document.body
 *   props   onReady(api) 回调：交付 { confirm(message, onConfirm, onCancel?) }——覆盖三套
 *           历史自含实现的公共语义（textContent 写消息 / 确认回调 / 取消与遮罩点击回调 /
 *           10ms visible 显形 / 300ms 后移除节点）；onConfirm/onCancel 均可选
 *   cleanup 幂等：移除任何在开对话框 + 定时器注册表 dispose
 *           （出场 300ms 窗口内的节点经实例级登记表兜底移除，不滞留 DOM）
 *
 * 单弹窗语义：confirm() 先**同步**移除现存对话框节点再建新（不等 300ms 出场动画）——
 * 与三套历史实现"先关旧的"行为一致。遮罩点击 = onCancel（取消语义）。
 *
 * 全部定时器经 /web/lib/timers.mjs 注册表管理（显形 10ms / 出场移除 300ms），
 * cleanup 一次清空；节点上的监听经 AbortController signal 登记，cleanup 一次解绑。
 *
 * 纪律（AGENTS §4.2）：无模块级可变状态；不 import 其他组件；页面显式
 * <link rel="stylesheet" href="/m/component-confirm-dialog/style.css"> 引入兜底外观
 * （cmp-confirm__* 命名空间，旧 .dialog-container/.confirm-dialog 类名已被页面占用）。
 */
import { createTimerRegistry } from "/web/lib/timers.mjs";

export function createConfirmDialog(hostEl, props = {}, ctx) {
  const timers = createTimerRegistry();
  const ctrl = new AbortController(); // 当前对话框节点上的监听（cleanup 统一解绑）
  const { signal } = ctrl;
  const overlays = []; // 本实例仍在场的遮罩节点（含正在出场的）；cleanup 兜底全移除
  let current = null; // 在开（或正在出场）对话框的根节点；null = 无

  /** 移除节点并出登记表（已摘离 DOM 的节点 remove 为安全空操作） */
  function dropOverlay(node) {
    node.remove();
    const i = overlays.indexOf(node);
    if (i !== -1) overlays.splice(i, 1);
  }

  /** 同步移除现存对话框（单弹窗语义；已移除/已在出场中的节点 remove 为安全空操作） */
  function removeCurrent() {
    if (!current) return;
    dropOverlay(current);
    current = null;
  }

  /** 回调错误隔离：抛错不外泄成未捕获异常（对齐 draw-machine/music-player 的 call() 包装） */
  function call(fn) {
    if (typeof fn !== "function") return;
    try {
      fn();
    } catch (e) {
      console.error("[component-confirm-dialog] 回调抛错:", e);
    }
  }

  /**
   * 弹出确认对话框；确认 → onConfirm()，取消按钮/遮罩点击 → onCancel()（均可选）
   * @returns {HTMLElement} 对话框根节点（调试/断言用）
   */
  function confirm(message, onConfirm, onCancel) {
    // 先关旧的（同步移除节点；旧节点的在飞定时器由"节点已摘离 DOM"兜底为空操作）
    removeCurrent();

    const overlay = document.createElement("div");
    overlay.className = "cmp-confirm";
    overlay.setAttribute("data-component", "confirm-dialog");

    const box = document.createElement("div");
    box.className = "cmp-confirm__box";

    const messageEl = document.createElement("p");
    messageEl.className = "cmp-confirm__message";
    messageEl.textContent = String(message); // 消息可能拼接业务字符串，防注入

    const actions = document.createElement("div");
    actions.className = "cmp-confirm__actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "cmp-confirm__btn cmp-confirm__btn--cancel";
    cancelBtn.textContent = "取消";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "cmp-confirm__btn cmp-confirm__btn--confirm";
    confirmBtn.textContent = "确认";

    actions.append(cancelBtn, confirmBtn);
    box.append(messageEl, actions);
    overlay.append(box);
    document.body.appendChild(overlay);
    overlays.push(overlay); // 登记后 cleanup 兜底可移除（含出场窗口内的）
    current = overlay;

    // 关闭：同步置空 current（300ms 窗口内再点不二次触发）→ 摘 visible → 300ms 后移除节点
    const close = (cb) => {
      if (current !== overlay) return;
      current = null; // 同步置空：双击确认/取消不会重复回调（审查 P2-1 修复）
      overlay.classList.remove("cmp-confirm--visible");
      timers.later(() => dropOverlay(overlay), 300);
      call(cb);
    };

    confirmBtn.addEventListener("click", () => close(onConfirm), { signal });
    cancelBtn.addEventListener("click", () => close(onCancel), { signal });
    overlay.addEventListener(
      "click",
      (e) => {
        if (e.target === overlay) close(onCancel); // 遮罩点击 = 取消
      },
      { signal }
    );

    // 显形动画（10ms 等一帧让过渡生效；定时器登记，cleanup 统一清理）
    timers.later(() => overlay.classList.add("cmp-confirm--visible"), 10);
    return overlay;
  }

  // API 交付（onReady 抛错不影响组件自身）
  if (typeof props.onReady === "function") {
    try {
      props.onReady(confirm); // 交付函数本身（三个消费方 confirmApi(message, ...) 直接调用）
    } catch (e) {
      console.error("[component-confirm-dialog] onReady 回调抛错:", e);
    }
  }

  // cleanup：移除在开对话框（含正在出场的）+ 在飞定时器与监听一次清空
  return () => {
    removeCurrent();
    // 兜底：close() 置空 current 后 300ms 出场窗口内的节点，其移除定时器被下方
    // dispose 取消——按本实例登记表全量移除，防不可见遮罩滞留 DOM 拦截点击
    for (const node of overlays.splice(0)) node.remove();
    ctrl.abort();
    timers.dispose();
  };
}
