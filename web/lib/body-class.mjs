/**
 * web/lib/body-class.mjs —— body class 引用计数（L1 共享资产，P12-B1）
 *
 * 分层归属：L1 —— 纯计数状态机（无定时器/无网络），与 /web/icons.mjs 同级，
 * 可直接 import，不注册插件、不进清单。可在 node 中单测（web/lib/body-class.test.js，
 * document 由 deps 注入 fake）。
 *
 * 收敛 AGENTS §4.2 组件纪律第 2 条（"body class 必须成对增删，同页多实例共享时
 * 用引用计数，最后一个退出者才移除"）——component-music-player 的模块级
 * bodyModeUsers 计数（组件纪律第 3 条的唯一豁免）由此实现承载（P12 设计 §2.1 B）。
 *
 * 用法（模块前端插件内，origin 相对路径 import）：
 *   import { createBodyClassRef } from "/web/lib/body-class.mjs";
 *   const modeRef = createBodyClassRef({ className: "battle-mode" });
 *   modeRef.acquire();              // 计数 0→1 时给 document.body 加类
 *   modeRef.release();              // 计数归零时移除；多实例共享最后一个退出者生效
 *   modeRef.count();                // 当前计数（调试/单测断言用）
 *
 * 依赖注入：document 可经 deps 注入（node 测试注入 { body: fakeElement }）；
 * 缺省 globalThis.document。className 非字符串（或空串）时只计数、不动 DOM——
 * 调用方可传非法类名安全降级为纯计数。
 *
 * 语义要点：
 *   - acquire() 计数 +1，0→1 跳变时加类；release() 计数 -1（下限钳 0），归零跳变时移除。
 *   - 类名非法时 acquire/release 照常计数，跳过 DOM 操作（对称：加不上也摘不掉）。
 */

/**
 * 创建 body class 引用计数器（每次调用产出一个独立实例，无模块级共享状态）。
 * @param {{ document?: object, className?: string }} deps className 必传（非法则纯计数）
 * @returns {{
 *   acquire: () => number,
 *   release: () => number,
 *   count: () => number
 * }}
 */
export function createBodyClassRef(deps = {}) {
  const doc = deps && deps.document !== undefined ? deps.document : globalThis.document;
  const className = deps ? deps.className : undefined;
  let n = 0;

  function bodyEl() {
    return doc && doc.body ? doc.body : null;
  }
  function add() {
    if (typeof className !== "string" || !className) return;
    const body = bodyEl();
    if (body) body.classList.add(className);
  }
  function remove() {
    if (typeof className !== "string" || !className) return;
    const body = bodyEl();
    if (body) body.classList.remove(className);
  }

  /** 计数 +1；0→1 跳变时给 body 加类，返回新计数 */
  function acquire() {
    n += 1;
    if (n === 1) add();
    return n;
  }

  /** 计数 -1（下限钳 0）；归零跳变时移除类，返回新计数 */
  function release() {
    if (n === 0) return 0;
    n -= 1;
    if (n === 0) remove();
    return n;
  }

  /** 当前计数（调试/单测断言用） */
  function count() {
    return n;
  }

  return { acquire, release, count };
}
