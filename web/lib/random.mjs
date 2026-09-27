/**
 * web/lib/random.mjs —— 随机抽取纯函数（L1 共享资产，P11-B2）
 *
 * 分层归属：L1（与 /web/icons.mjs 同级）——纯函数、无 DOM、无定时器、无网络、无内部状态，
 * 可直接被任意页面/组件 import，不注册插件、不进清单。判定见 P11 §2.1：
 * "有没有生命周期"是 L1/L2 的边界（此处没有）。
 *
 * 用法（模块前端插件内，origin 相对路径 import）：
 *   import { shuffle, pickN, pickOne } from "/web/lib/random.mjs";
 *   const order = shuffle(State.allPlayers);      // 新数组，原数组不动
 *   const round = pickN(State.allPlayers, 3);     // 不重复抽 3 人
 *
 * 算法契约：shuffle 为 Fisher–Yates（等概率），**替代** `sort(() => Math.random() - 0.5)`
 * 这类有偏洗牌（P11 §1.2 ③：battle-group1 等 5 处仍在用有偏写法）。
 * 三个函数均不改动入参（返回新数组），入参非数组按空数组处理（不抛错）。
 * 可选 rng 参数默认 Math.random，预期返回 [0,1)；注入固定序列即可做确定性测试。
 */

/** 洗牌：返回打乱后的新数组（Fisher–Yates，等概率）；rng 可注入 */
export function shuffle(arr, rng = Math.random) {
  const a = Array.isArray(arr) ? arr.slice() : [];
  for (let i = a.length - 1; i > 0; i--) {
    // 双向钳制到 [0, i]：rng 返回 1（超上界）或负值（超下界）都不产生越界写入——
    // 负 j 会把元素写到 "-1" 键上，元素静默丢失
    const j = Math.min(Math.max(Math.floor(rng() * (i + 1)), 0), i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 不重复抽 n 个：返回新数组，长度 = min(max(floor(n),0), arr.length)。
 * n 非法（NaN/负数）→ []；n ≥ 长度 → 全量洗牌副本；n 小数向下取整。
 */
export function pickN(arr, n, rng = Math.random) {
  const list = Array.isArray(arr) ? arr : [];
  const k = Math.min(Math.max(Math.floor(Number(n)) || 0, 0), list.length);
  if (k === 0) return [];
  return shuffle(list, rng).slice(0, k);
}

/** 抽 1 个：空数组 → null（不是 undefined，便于 JSON 往返）；等概率、不修改入参 */
export function pickOne(arr, rng = Math.random) {
  const list = Array.isArray(arr) ? arr : [];
  if (list.length === 0) return null;
  return list[Math.min(Math.floor(rng() * list.length), list.length - 1)];
}
