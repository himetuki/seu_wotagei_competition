/**
 * web/lib/undo.mjs —— 撤销快照栈（L1 共享资产，P11-B2）
 *
 * 分层归属：L1 —— 纯数据结构（无 DOM/无定时器/无网络），与 /web/icons.mjs 同级，
 * 可直接 import，不注册插件、不进清单。可在 node 中单测（web/lib/undo.test.js）。
 *
 * 对应 AGENTS §3.4 约定："在每次改变状态前 push 快照到 undoStack，双击已操作的元素触发回滚"。
 * 收敛 drag / group-battle 手写的 `State.undoStack.push/pop`（P11 §1.2 ④）。
 *
 * 用法（模块前端插件内，origin 相对路径 import）：
 *   import { createUndoStack } from "/web/lib/undo.mjs";
 *   const undo = createUndoStack();                 // 缺省上限 50
 *   undo.push({ fromId, prevFromState });           // 变更前：存"变更前"快照
 *   if (undo.canUndo()) applySnapshot(undo.undo()); // 回滚：弹出并返回该快照
 *
 * 上限策略（已文档化）：缺省 MAX_HISTORY = 50，超出丢**最旧**（FIFO 淘汰，保最新可回滚步数）；
 * 传 Infinity 不限；非法 limit（非数字/小于 1/NaN）回退缺省值。
 * 快照按**引用**保存：调用方负责传入已定型的对象（既有实现 push 的是字面量快照或
 * JSON 深拷贝副本）；本库不做隐式深拷贝，避免大状态每次入栈都付序列化成本。
 * 需要持久化的模块用 toArray() 取出副本、load() 灌回（drag 的 undoStack 就随 State 落盘）。
 */

/** 缺省历史上的限（超出丢最旧） */
export const MAX_HISTORY = 50;

/**
 * @param {{ limit?: number }} [opts] limit：最大快照数（缺省 50，可 Infinity）
 * @returns {{
 *   push: (snapshot:any) => number, undo: () => any|null, peek: () => any|null,
 *   canUndo: () => boolean, size: () => number, clear: () => void,
 *   toArray: () => any[], load: (list:any[]) => number
 * }}
 */
export function createUndoStack(opts = {}) {
  const raw = opts && opts.limit;
  const limit = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : raw === Infinity ? Infinity : MAX_HISTORY;
  const stack = [];

  return {
    /** 压入"变更前"快照，返回入栈后的步数（超上限丢最旧） */
    push(snapshot) {
      stack.push(snapshot);
      while (stack.length > limit) stack.shift();
      return stack.length;
    },

    /** 弹出并返回最近快照；栈空 → null（调用方先 canUndo 判定，或据 null 自行兜底） */
    undo() {
      return stack.length > 0 ? stack.pop() : null;
    },

    /** 查看栈顶但不弹出；栈空 → null（用于按钮态/预览，不产生副作用） */
    peek() {
      return stack.length > 0 ? stack[stack.length - 1] : null;
    },

    canUndo() {
      return stack.length > 0;
    },

    size() {
      return stack.length;
    },

    /** 清空（重置流程调用；不影响调用方自身状态） */
    clear() {
      stack.length = 0;
    },

    /** 快照副本（旧→新顺序，防御性拷贝：可用于随 State 落盘） */
    toArray() {
      return stack.slice();
    },

    /** 灌回快照（旧→新顺序；只保留**最新** limit 条，返回装载后步数） */
    load(list) {
      const src = Array.isArray(list) ? list : [];
      const kept = Number.isFinite(limit) ? src.slice(-limit) : src.slice();
      stack.length = 0;
      // 逐条灌入（push 自带超限裁剪）：spread 展开在 limit:Infinity 且数组巨大时
      // 会因实参数超限抛 RangeError（V8 约数万即崩），load 是持久化恢复入口不能崩
      for (const item of kept) stack.push(item);
      return stack.length;
    },
  };
}
