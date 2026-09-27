/**
 * web/lib/timers.mjs —— 一次性定时器注册表（L1 共享资产，P12-B1）
 *
 * 分层归属：L1 —— 纯状态机 + 注入效应（无 DOM/无网络），与 /web/icons.mjs 同级，
 * 可直接 import，不注册插件、不进清单。可在 node 中单测（web/lib/timers.test.js）。
 *
 * 收敛 6 个页面逐字重复的 `pageTimers + later()` 样板（4 个 battle 页 + setting +
 * music-import，P12 设计 §1）：later 登记即跟踪、回调执行后自动出表、cleanup 一次清空。
 *
 * 用法（模块前端插件内，origin 相对路径 import）：
 *   import { createTimerRegistry } from "/web/lib/timers.mjs";
 *   const timers = createTimerRegistry();
 *   const later = (fn, ms) => timers.later(fn, ms);   // 别名：既有调用点零改动
 *   // cleanup（组件/页面卸载）：
 *   timers.dispose();
 *
 * 依赖注入：setTimeout / clearTimeout 可经 deps 注入（node 测试用假时钟）；
 * 缺省落到全局 setTimeout / clearTimeout。注入签名与全局同形：(fn, ms) → handle。
 *
 * 语义要点：
 *   - later(fn, ms) 登记即跟踪，返回注册表 id；回调**执行后**自动出表（在飞窗口最短）。
 *   - clear(id) 只清登记中的任务；clearAll() 清空全部在飞但注册表仍可用。
 *   - dispose() = clearAll + 关闭：之后 later(fn, ms) 返回 null（不抛错）——卸载后
 *     迟到的登记调用被安全拒绝，页面 teardown 不会因残留回调重新写 DOM。
 *   - 回调抛错沿用原生语义（向上传播）；出表先于 fn 执行，注册表状态始终一致。
 */

/**
 * 创建定时器注册表（每次调用产出一个独立实例，无模块级共享状态）。
 * @param {{ setTimeout?: Function, clearTimeout?: Function }} [deps] 缺省用全局定时器
 * @returns {{
 *   later: (fn: Function, ms?: number) => any|null,
 *   clear: (id: any) => boolean,
 *   clearAll: () => void,
 *   dispose: () => void,
 *   size: () => number
 * }}
 */
export function createTimerRegistry(deps = {}) {
  const setTimeoutFn =
    deps && typeof deps.setTimeout === "function" ? deps.setTimeout : (fn, ms) => setTimeout(fn, ms);
  const clearTimeoutFn =
    deps && typeof deps.clearTimeout === "function"
      ? deps.clearTimeout
      : (id) => clearTimeout(id);

  const pending = new Map(); // id → 原生 handle（clear/dispose 需要）
  let nextId = 1;
  let disposed = false;

  /** 登记一次性定时器，返回注册表 id；dispose 后返回 null（不抛错） */
  function later(fn, ms) {
    if (disposed || typeof fn !== "function") return null;
    const id = nextId++;
    let fired = false; // 防假时钟同步执行时 set 把已出表任务重新登记
    const handle = setTimeoutFn(() => {
      fired = true;
      pending.delete(id);
      fn();
    }, ms);
    if (!fired) pending.set(id, handle);
    return id;
  }

  /** 清除单个在飞任务；id 不在登记中 → false */
  function clear(id) {
    if (!pending.has(id)) return false;
    clearTimeoutFn(pending.get(id));
    pending.delete(id);
    return true;
  }

  /** 清空全部在飞任务（注册表保持可用） */
  function clearAll() {
    for (const handle of pending.values()) clearTimeoutFn(handle);
    pending.clear();
  }

  /** 清空在飞并关闭：之后 later 一律返回 null（组件/页面卸载入口） */
  function dispose() {
    clearAll();
    disposed = true;
  }

  /** 在飞任务数（调试/单测断言用） */
  function size() {
    return pending.size;
  }

  return { later, clear, clearAll, dispose, size };
}
