/**
 * 团体赛 - 共用工具函数（原 gb_common.js 迁入，函数体逐行保留）
 *
 * 纯函数直接具名导出；引用页面闭包状态（GBState/DOM/PlayerPools）的四个函数
 * 经 makePageHelpers 注入，各页面解构后调用点写法与原全局函数完全一致。
 *
 * P11-B5：`shuffle` 收敛到 L1 共享库 /web/lib/random.mjs（二选一裁决——原实现已是
 * 正确的 Fisher-Yates，这里改为 re-export 以消除本模块最后一份 Math.random 与重复实现；
 * 语义等价：等概率洗牌、返回新数组、不改入参。random.mjs 额外把随机下标夹到 i 以内，
 * 注入越界 rng 时也不越界）。本模块内无调用点（纯导出），故 re-export 零行为影响。
 */
import { shuffle } from "/web/lib/random.mjs";

export { shuffle };

export function normalizePlayerName(name) {
  return (name || "").trim();
}

export function extractPlayerNames(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => normalizePlayerName(item && item.name))
    .filter(Boolean);
}

export function showToast(message, type) {
  const toast = document.createElement("div");
  toast.className = "toast " + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 2500);
}

/**
 * 页面作用域共用函数工厂（原 gb_common.js 中引用 GBState/DOM 的部分）
 * @param {{ GBState: object, DOM: object, PlayerPools: object }} page 页面闭包状态
 */
export function makePageHelpers({ GBState, DOM, PlayerPools }) {
  function isNewPlayer(name) {
    return PlayerPools.newSet.has(normalizePlayerName(name));
  }

  function pushUndo(action) {
    GBState.undoStack.push(action);
  }

  function getArenaElementForPlayer(groupIdx, playerName) {
    const match = GBState.currentMatch;
    const role1 = DOM.arenaRole1.textContent;
    const p1IsDefender = role1 === "守擂者" || role1 === "选手1";
    if (p1IsDefender) {
      if (
        match.defender &&
        match.defender.groupIdx === groupIdx &&
        match.defender.playerName === playerName
      )
        return DOM.arenaPlayer1;
      if (
        match.challenger &&
        match.challenger.groupIdx === groupIdx &&
        match.challenger.playerName === playerName
      )
        return DOM.arenaPlayer2;
    } else {
      if (
        match.challenger &&
        match.challenger.groupIdx === groupIdx &&
        match.challenger.playerName === playerName
      )
        return DOM.arenaPlayer1;
      if (
        match.defender &&
        match.defender.groupIdx === groupIdx &&
        match.defender.playerName === playerName
      )
        return DOM.arenaPlayer2;
    }
    return null;
  }

  /**
   * 播放胜负结果动画（共用）
   */
  function playResultAnimations(winner, loser, onComplete) {
    const loserArena = getArenaElementForPlayer(loser.groupIdx, loser.playerName);
    if (loserArena) loserArena.classList.add("loser-anim");
    DOM.animOverlay.classList.remove("hidden");
    DOM.animOverlay.classList.add("kill-active");
    document.body.classList.add("screen-shake");
    DOM.killEffect.classList.remove("hidden");

    setTimeout(() => {
      DOM.killEffect.classList.add("hidden");
      DOM.animOverlay.classList.remove("kill-active");
      document.body.classList.remove("screen-shake");
      const winnerArena = getArenaElementForPlayer(
        winner.groupIdx,
        winner.playerName,
      );
      if (winnerArena) winnerArena.classList.add("winner-anim");
      DOM.animOverlay.classList.add("win-active");
      DOM.winEffect.classList.remove("hidden");
      setTimeout(() => {
        DOM.winEffect.classList.add("hidden");
        DOM.animOverlay.classList.remove("win-active");
        DOM.animOverlay.classList.add("hidden");
        if (loserArena) loserArena.classList.remove("loser-anim");
        if (winnerArena) winnerArena.classList.remove("winner-anim");
        onComplete();
      }, 1200);
    }, 1200);
  }

  return {
    isNewPlayer,
    pushUndo,
    getArenaElementForPlayer,
    playResultAnimations,
  };
}
