/**
 * 团体赛 - 共用工具函数
 * 所有三大轮共享的纯函数/工具
 */

function normalizePlayerName(name) {
  return (name || "").trim();
}

function extractPlayerNames(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => normalizePlayerName(item && item.name))
    .filter(Boolean);
}

function isNewPlayer(name) {
  return PlayerPools.newSet.has(normalizePlayerName(name));
}

function showToast(message, type) {
  const toast = document.createElement("div");
  toast.className = "toast " + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 2500);
}

function pushUndo(action) {
  GBState.undoStack.push(action);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
