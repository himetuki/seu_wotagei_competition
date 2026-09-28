/**
 * 团体赛 - 第二大轮（胜者组/败者组）页面闭包（P3d 迁入）
 *
 * 原 gb_common.js + group_battle_2_{main,data,match,battle,render,persist}.js
 * 并入同一模块作用域：全局函数/变量 → 闭包作用域，函数体逐行保留。
 * 原 main 的 DOMContentLoaded 初始化改由 initPage2() 承接。
 */
import {
  normalizePlayerName,
  extractPlayerNames,
  showToast,
  makePageHelpers,
} from "./gb_common.js";

// ==================== main：状态定义 ====================
const GBState = {
  phase: "loading",
  round: 2,
  allPlayers: [],
  oldPlayers: [],
  newPlayers: [],
  groups: [],
  currentMatch: {
    group1Idx: null,
    group2Idx: null,
    defender: null,
    challenger: null,
    winner: null,
    loser: null,
    duelHistory: [],
    matchWinnerGroupIdx: null,
    matchLoserGroupIdx: null,
    nextChallengerGroupIdx: null,
  },
  bracket: { pendingMatches: [], completedMatches: [] },
  undoStack: [],
  musicListNew: [],
  musicListOld: [],
  revivalUsed: {},
  round1Data: null,
};

const DOM = {};
const PlayerPools = { oldSet: new Set(), newSet: new Set() };

// 组件实例 API 桥（front/plugin.js 传入、组件 onReady 同步回填；组件缺失时保持 null）
let apis = { music: null, draw: null };

// 原 gb_common.js 中依赖页面状态的共用函数（调用点写法不变）
const { isNewPlayer, pushUndo, playResultAnimations } = makePageHelpers({
  GBState,
  DOM,
  PlayerPools,
});

function cacheDOM() {
  DOM.statusSection = document.getElementById("status-section");
  DOM.bracketStatus = document.getElementById("bracket-status");
  DOM.systemHint = document.getElementById("system-hint");
  DOM.groupsGrid = document.getElementById("groups-grid");
  DOM.musicInfoSection = document.getElementById("music-info-section");
  DOM.currentMusicLib = document.getElementById("current-music-lib");
  DOM.currentMusicSource = document.getElementById("current-music-source");
  DOM.battleArena = document.getElementById("battle-arena");
  DOM.arenaPlayer1 = document.getElementById("arena-player1");
  DOM.arenaPlayer2 = document.getElementById("arena-player2");
  DOM.arenaPlayer1Name = document.getElementById("arena-player1-name");
  DOM.arenaPlayer2Name = document.getElementById("arena-player2-name");
  DOM.arenaGroup1Label = document.getElementById("arena-group1-label");
  DOM.arenaGroup2Label = document.getElementById("arena-group2-label");
  DOM.arenaRole1 = document.getElementById("arena-role1");
  DOM.arenaRole2 = document.getElementById("arena-role2");
  DOM.drawMusicBtn = document.getElementById("draw-music-btn");
  DOM.startBattleBtn = document.getElementById("start-battle-btn");
  DOM.clearWinnerBtn = document.getElementById("clear-winner-btn");
  DOM.nextMatchBtn = document.getElementById("next-match-btn");
  DOM.nextRoundBtn = document.getElementById("next-round-btn");
  DOM.resetMatchBtn = document.getElementById("reset-match-btn");
  DOM.prevRoundBtn = document.getElementById("prev-round-btn");
  DOM.matchHistory = document.getElementById("match-history");
  // battle-start 遮罩 / 逐字文本 / 停止提示三个骨架节点已删除（music-player 组件自建）
  DOM.animOverlay = document.getElementById("anim-overlay");
  DOM.killEffect = document.getElementById("kill-effect");
  DOM.winEffect = document.getElementById("win-effect");
}

function bindEvents(signal) {
  // cleanup 契约：静态骨架节点 + document 监听全部经 signal 登记，
  // 重渲染时 abort 统一解绑，防止不刷新页面的重复 render 双绑双触发
  // #draw-music-btn → draw-machine 组件 trigger
  // ★ #start-battle-btn 改由页面显式接管（见 handleStartBattle）：组件的 startTrigger 一律
  //   toggle()→start()（带 BATTLE START 遮罩），无法区分「首次进入」与「音乐结束后的重播」，
  //   会让重播也走 4.5s 遮罩（迁移前 replayBattleMusic 是立即播放）。
  DOM.clearWinnerBtn.addEventListener("click", handleUndo, { signal });
  DOM.nextMatchBtn.addEventListener("click", handleNextMatch, { signal });
  DOM.nextRoundBtn.addEventListener("click", handleNextRound, { signal });
  DOM.resetMatchBtn.addEventListener("click", handleResetMatch, { signal });
  DOM.prevRoundBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  }, { signal });
  document
    .getElementById("reset-game-btn")
    .addEventListener("click", handleReset, { signal });
  document.getElementById("home-btn").addEventListener("click", () => {
    window.location.href = "/m/home";
  }, { signal });
  DOM.groupsGrid.addEventListener("click", handleGroupSectionClick, { signal });
  DOM.arenaPlayer1.addEventListener("click", () => selectArenaWinner(0), { signal });
  DOM.arenaPlayer2.addEventListener("click", () => selectArenaWinner(1), { signal });
  // BATTLE START 遮罩期间点击跳过 / 播放中双击退出：由 music-player 组件接管
  //（组件在播放生命周期内用独立 AbortController 挂 document 级监听）
  // 开始比赛 / 重播按钮：页面显式接管（区分首次遮罩与重播直放）
  DOM.startBattleBtn.addEventListener("click", handleStartBattle, { signal });
}

/**
 * 开始比赛 / 重播（迁移前 handleStartBattle 的两个分支，逐行对应）：
 *   · phase === "battling"（音乐已结束 / 已被双击停止）→ 原 replayBattleMusic：
 *     重置进度立即播放，**不进遮罩**；
 *   · phase === "music_drawn"（刚抽到音乐）→ 原遮罩分支：BATTLE START 逐字 + 4500ms 待播。
 * 组件 start({ skipOverlay: true }) 即「跳过遮罩立即播放」的既有开关（B4 缺陷 4 引入），
 * 故此处不再依赖组件的 startTrigger（其 toggle() 无区分语义）。
 */
function handleStartBattle() {
  if (!apis.music) return; // 组件降级（未注册/被禁用）：与组件缺失时同样无行为
  if (GBState.phase === "battling" || GBState.phase === "music_playing") {
    apis.music.start({ skipOverlay: true });
    return;
  }
  if (GBState.phase === "music_drawn") {
    apis.music.start();
  }
}

/**
 * 原 DOMContentLoaded 初始化。
 * @param {{music: object|null, draw: object|null}} componentBridge 组件实例 API 桥（front/plugin.js 传入）
 * @returns {() => void} cleanup：解绑全部登记监听器与 audio
 */
function initPage2(componentBridge) {
  apis = componentBridge || { music: null, draw: null };
  cacheDOM();
  const bindAbort = new AbortController();
  bindEvents(bindAbort.signal);

  loadRound1Data().then(() => {
    if (!GBState.round1Data) {
      showToast("未找到第一大轮数据，请返回第一大轮", "error");
      DOM.systemHint.textContent = "请先完成第一大轮";
      return;
    }
    setupRound2();
    renderAll();
  });

  return function cleanup() {
    bindAbort.abort();
    const audio = document.getElementById("music-player");
    if (audio) {
      audio.pause();
      audio.onended = null;
    }
    // body.battle-mode 的权威清理在 music-player 组件 cleanup（引用计数）；此处兜底
    // 不回改计数——依赖组件 cleanup 幂等释放（teardown-only，重复 remove 为空操作）
    document.body.classList.remove("battle-mode");
  };
}

export { initPage2 };

// ==================== data：数据加载 + 第二轮构建 + 曲库管理 ====================
function loadRound1Data() {
  return new Promise((resolve) => {
    const local = localStorage.getItem("groupBattleRound1");
    if (local) {
      try {
        GBState.round1Data = JSON.parse(local);
        resolve();
        return;
      } catch (e) {}
    }
    fetch("/api/group-battle-process")
      .then((r) => r.json())
      .then((data) => {
        if (
          data &&
          data.currentState &&
          data.currentState.bracket &&
          data.currentState.bracket.completedMatches.length > 0
        ) {
          const gs = data.currentState.groups;
          const completed = data.currentState.bracket.completedMatches;
          GBState.round1Data = {
            groups: gs,
            completedMatches: completed,
            revivalUsed: data.currentState.revivalUsed || {},
          };
        }
        resolve();
      })
      .catch(() => resolve());
  });
}

function setupRound2() {
  const r1 = GBState.round1Data;
  GBState.groups = r1.groups.map((g) => ({
    ...g,
    eliminated: [],
    wins: g.wins,
    losses: g.losses,
    status: g.status,
  }));
  GBState.revivalUsed = r1.revivalUsed || {};

  Promise.all([
    fetch("/resource/json/player1.json").then((r) => r.json()),
    fetch("/resource/json/player2.json").then((r) => r.json()),
    fetch("/resource/json/musics_list.json")
      .then((r) => r.json())
      .catch(() => []),
    fetch("/resource/json/musics_list_2.json")
      .then((r) => r.json())
      .catch(() => []),
  ]).then(([oldData, newData, plusList, newcomerList]) => {
    GBState.oldPlayers = extractPlayerNames(oldData);
    GBState.newPlayers = extractPlayerNames(newData);
    GBState.allPlayers = [...GBState.oldPlayers, ...GBState.newPlayers];
    PlayerPools.oldSet = new Set(GBState.oldPlayers);
    PlayerPools.newSet = new Set(GBState.newPlayers);
    GBState.musicListOld = plusList;
    GBState.musicListNew = newcomerList;

    const matches = [];
    const completed = Array.isArray(r1.completedMatches)
      ? r1.completedMatches
      : [];
    const matchAB = completed.find(
      (m) =>
        (m.group1 === 0 && m.group2 === 1) ||
        (m.group1 === 1 && m.group2 === 0),
    );
    const matchCD = completed.find(
      (m) =>
        (m.group1 === 2 && m.group2 === 3) ||
        (m.group1 === 3 && m.group2 === 2),
    );

    if (matchAB && matchCD) {
      const winnerAB = matchAB.winner;
      const loserAB = winnerAB === 0 ? 1 : 0;
      const winnerCD = matchCD.winner;
      const loserCD = winnerCD === 2 ? 3 : 2;
      matches.push({
        g1: winnerAB,
        g2: winnerCD,
        played: false,
        label: "胜者组",
      });
      matches.push({
        g1: loserAB,
        g2: loserCD,
        played: false,
        label: "败者组",
      });
    } else {
      const winners = GBState.groups
        .filter((g) => g.wins >= 1)
        .sort((a, b) => b.wins - a.wins);
      const losers = GBState.groups
        .filter((g) => g.losses >= 1 && g.status !== "eliminated")
        .sort((a, b) => a.losses - b.losses);
      if (winners.length >= 2)
        matches.push({
          g1: GBState.groups.indexOf(winners[0]),
          g2: GBState.groups.indexOf(winners[1]),
          played: false,
          label: "胜者组",
        });
      if (losers.length >= 2)
        matches.push({
          g1: GBState.groups.indexOf(losers[0]),
          g2: GBState.groups.indexOf(losers[1]),
          played: false,
          label: "败者组",
        });
    }

    GBState.bracket.pendingMatches = matches;
    GBState.phase = matches.length > 0 ? "selecting_groups" : "finished";
    renderAll();
  });
}

function getMusicLibName() {
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return "1年+曲库";
  const dIsNew = isNewPlayer(match.defender.playerName);
  const cIsNew = isNewPlayer(match.challenger.playerName);
  return dIsNew && cIsNew ? "新人赛曲库" : "1年+曲库";
}

function getCurrentMusicLibrary() {
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return GBState.musicListOld;
  const dIsNew = isNewPlayer(match.defender.playerName);
  const cIsNew = isNewPlayer(match.challenger.playerName);
  return dIsNew && cIsNew ? GBState.musicListNew : GBState.musicListOld;
}

function getMusicFolder() {
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return "1yearplus";
  const dIsNew = isNewPlayer(match.defender.playerName);
  const cIsNew = isNewPlayer(match.challenger.playerName);
  return dIsNew && cIsNew ? "1yearminus" : "1yearplus";
}

function updateMusicInfo(trackName, sourceName) {
  if (DOM.currentMusicLib) {
    DOM.currentMusicLib.textContent = trackName || "-";
  }
  if (DOM.currentMusicSource) {
    DOM.currentMusicSource.textContent = sourceName
      ? "曲库：" + sourceName
      : "";
    DOM.currentMusicSource.classList.toggle("hidden", !sourceName);
  }
}

// ==================== match：选组 + 选手选择 + 复活 ====================
let selectedGroupIdxs = [];

function handleGroupSectionClick(e) {
  const card = e.target.closest(".group-card");
  if (!card) return;
  const idx = parseInt(card.dataset.groupIdx);
  if (GBState.phase === "selecting_groups") {
    handleSelectGroup(idx);
    return;
  }
}

function handleSelectGroup(idx) {
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (!pending) return;
  if (idx !== pending.g1 && idx !== pending.g2) {
    showToast("请按赛程选择指定的组", "warning");
    return;
  }
  const card = document.getElementById("group-card-" + idx);
  if (selectedGroupIdxs.includes(idx)) {
    selectedGroupIdxs = selectedGroupIdxs.filter((i) => i !== idx);
    if (card) card.classList.remove("selected-group");
  } else {
    if (selectedGroupIdxs.length >= 2) {
      const first = selectedGroupIdxs.shift();
      const firstCard = document.getElementById("group-card-" + first);
      if (firstCard) firstCard.classList.remove("selected-group");
    }
    selectedGroupIdxs.push(idx);
    if (card) card.classList.add("selected-group");
  }
  if (selectedGroupIdxs.length === 2) confirmGroupSelection();
}

function confirmGroupSelection() {
  const [idx1, idx2] = selectedGroupIdxs;
  GBState.currentMatch = {
    group1Idx: idx1,
    group2Idx: idx2,
    defender: null,
    challenger: null,
    winner: null,
    loser: null,
    duelHistory: [],
    matchWinnerGroupIdx: null,
    matchLoserGroupIdx: null,
    nextChallengerGroupIdx: null,
  };
  GBState.phase = "selecting_players";
  selectedGroupIdxs = [];
  saveState();
  renderAll();
  showToast("请从两组中各1名出战选手", "info");
}

// ==================== 选选手（可回归）====================
function handleMemberClick(groupIdx, playerName, e) {
  e.stopPropagation();
  const group = GBState.groups[groupIdx];
  if (group.eliminated.includes(playerName) && !canRevive(playerName)) return;
  const match = GBState.currentMatch;

  if (
    match.defender &&
    match.defender.groupIdx === groupIdx &&
    match.defender.playerName === playerName
  ) {
    match.defender = null;
    if (
      GBState.phase === "ready_to_battle" ||
      GBState.phase === "music_drawn"
    ) {
      GBState.phase = "selecting_players";
      match.drawnMusic = null;
    }
    pushUndo({ type: "return_defender", groupIdx, playerName });
    saveState();
    renderAll();
    return;
  }
  if (
    match.challenger &&
    match.challenger.groupIdx === groupIdx &&
    match.challenger.playerName === playerName
  ) {
    match.challenger = null;
    if (
      GBState.phase === "ready_to_battle" ||
      GBState.phase === "music_drawn"
    ) {
      GBState.phase = "selecting_players";
      match.drawnMusic = null;
    }
    pushUndo({ type: "return_challenger", groupIdx, playerName });
    saveState();
    renderAll();
    return;
  }

  if (
    GBState.phase === "selecting_players" ||
    GBState.phase === "ready_to_battle" ||
    GBState.phase === "music_drawn"
  ) {
    if (match.defender === null) {
      match.defender = { groupIdx, playerName, role: "defender" };
      pushUndo({ type: "select_defender", groupIdx, playerName });
      saveState();
      renderAll();
      return;
    }
    if (match.challenger === null && groupIdx !== match.defender.groupIdx) {
      match.challenger = { groupIdx, playerName, role: "challenger" };
      pushUndo({ type: "select_challenger", groupIdx, playerName });
      GBState.phase = "ready_to_battle";
      saveState();
      renderAll();
      showToast("选手已就位，请抽取音乐", "success");
      return;
    }
    if (match.challenger === null && groupIdx === match.defender.groupIdx) {
      showToast("请选择另一组的成员", "warning");
      return;
    }
  } else if (GBState.phase === "selecting_next_challenger") {
    if (groupIdx === match.defender.groupIdx) {
      showToast("请选择败者组的成员", "warning");
      return;
    }
    if (groupIdx !== match.nextChallengerGroupIdx) {
      showToast("请选择指定组的成员", "warning");
      return;
    }
    match.challenger = { groupIdx, playerName, role: "challenger" };
    match.winner = null;
    match.loser = null;
    pushUndo({ type: "select_next_challenger", groupIdx, playerName });
    GBState.phase = "ready_to_battle";
    saveState();
    renderAll();
  }
}

function canRevive(playerName) {
  const normalizedName = normalizePlayerName(playerName);
  return isNewPlayer(normalizedName) && !GBState.revivalUsed[normalizedName];
}

function refreshGroupStatus(groupIdx) {
  const group = GBState.groups[groupIdx];
  if (!group) return;
  group.status = group.members.some(
    (member) => !group.eliminated.includes(member),
  )
    ? "active"
    : "eliminated";
}

function reopenFinishedMatchAfterRevive() {
  const lastCompleted = GBState.bracket.completedMatches.pop();
  if (lastCompleted) {
    const lastPending = [...GBState.bracket.pendingMatches]
      .reverse()
      .find((m) => m.played);
    if (lastPending) {
      lastPending.played = false;
      delete lastPending.winner;
      delete lastPending.loser;
    }
    GBState.groups[lastCompleted.group1].wins--;
    GBState.groups[lastCompleted.group2].losses--;
    if (GBState.groups[lastCompleted.group2].losses < 2) {
      GBState.groups[lastCompleted.group2].status = "active";
    }
  }

  const match = GBState.currentMatch;
  GBState.currentMatch = {
    group1Idx: match.group1Idx,
    group2Idx: match.group2Idx,
    defender: null,
    challenger: null,
    winner: null,
    loser: null,
    duelHistory: [],
    matchWinnerGroupIdx: null,
    matchLoserGroupIdx: null,
    nextChallengerGroupIdx: null,
  };
  const player = document.getElementById("music-player");
  if (player) {
    player.pause();
    player.currentTime = 0;
    player.src = "";
  }
  // 同步组件内部 current（否则清空 drawnMusic 后仍残留上一次抽取结果）
  if (apis.music) apis.music.clearItem();
  GBState.phase = "selecting_players";
  selectedGroupIdxs = [];
}

function handleRevive(groupIdx, playerName) {
  if (!canRevive(playerName)) {
    showToast("该选手无法复活", "warning");
    return;
  }
  const normalizedName = normalizePlayerName(playerName);
  const reopenedMatch = GBState.phase === "match_end";
  const matchSnapshot = reopenedMatch
    ? JSON.parse(JSON.stringify(GBState.currentMatch))
    : null;
  const completedSnapshot = reopenedMatch
    ? JSON.parse(
        JSON.stringify(
          GBState.bracket.completedMatches[
            GBState.bracket.completedMatches.length - 1
          ] || null,
        ),
      )
    : null;
  const group = GBState.groups[groupIdx];
  group.eliminated = group.eliminated.filter(
    (n) => normalizePlayerName(n) !== normalizedName,
  );
  refreshGroupStatus(groupIdx);
  GBState.revivalUsed[normalizedName] = true;
  if (GBState.phase === "match_end") {
    reopenFinishedMatchAfterRevive();
  }
  pushUndo({
    type: "revive",
    groupIdx,
    playerName: normalizedName,
    reopenedMatch,
    matchSnapshot,
    completedSnapshot,
  });
  saveState();
  renderAll();
  showToast(normalizedName + " 已复活，可重新进入对局", "success");
}

// ==================== battle：组件接入（抽取动画 / 播放+比赛模式）+ 选胜者 + 赛后检查 + 进入下一场/下一大轮 ====================

/**
 * 运行时 props 工厂（front/plugin.js 挂载组件时取用）。
 * 只放依赖页面状态与回调的部分；静态覆盖（时序/文案/遮罩开关）由 front.json config.components 提供，
 * 运行时 props 优先级更高。
 *
 * 分工（两个组件的按钮归属刻意不重叠——共用 #draw-music-btn 会双跑动画）：
 *   draw-machine  : 接管 #draw-music-btn 的闪现动画（15 tick × 80ms，迁移前 flashCount/flashInterval）
 *   music-player  : 不接管 trigger/startTrigger，只接管 #start-battle-btn 之外的播放生命周期
 *                   （遮罩/逐字/4500ms 待播/双击退出）；#start-battle-btn 由页面 handleStartBattle
 *                   接管 —— 首次进遮罩、重播 start({ skipOverlay: true }) 立即播放
 *   串联          : draw 定格 → bridge.music.setItem(item)（同步播放器 current + 预载 audio.src）
 *
 * 迁移前 handleDrawMusic / handleStartBattle / endBattleStart / replayBattleMusic /
 * stopMusicPlaying / handleBattleModeClick / handleDoubleClick 的动画、遮罩、打字、定时器、
 * document 监听、battle-mode 类全部由组件接管；phase 状态机与业务收尾逻辑在此逐行对应保留。
 */
export function componentProps2(bridge) {
  return {
    "music-player": {
      items: () => getCurrentMusicLibrary(),
      folder: () => getMusicFolder(),
      display: "#current-music-lib",
      // 显式钉空：抽取归 draw-machine、开始/重播由页面 handleStartBattle 接管
      //（组件不自建默认按钮）
      trigger: null,
      startTrigger: null,
      overlay: {
        enabled: true,
        textContent: "BATTLE START",
        textMs: 130,
        readyMs: 4500,
        hintMs: 1500,
        hintText: "双击任意位置停止",
        hintId: null,
        skipOnClick: true,
      },
      exitOnDblclick: true,
      exitOnClick: false,
      exitOnEnded: true,
      onReady: (api) => {
        bridge.music = api;
      },
      // 原 endBattleStart 播放分支的 phase/存档/提示
      onStarted: () => {
        GBState.phase = "battling";
        saveState();
        renderAll();
        showToast("音乐播放中，可直接点胜者或双击停止音乐", "info");
      },
      // 退出收尾：ended 只提示（phase 已是 battling）；user/toggle/manual/error = 原 stopMusicPlaying
      onExited: ({ reason }) => {
        if (reason === "ended") {
          showToast(
            "音乐播放完毕，可继续判定胜者或点击开始比赛重新播放",
            "info",
          );
          return;
        }
        GBState.phase = "battling";
        saveState();
        renderAll();
        showToast("对战开始！请点击胜者", "info");
      },
      onError: (err) => {
        console.error("音乐播放失败:", err);
        showToast("音乐播放失败，已跳过音频播放", "warning");
      },
      onEmpty: () => showToast("请先抽取音乐", "warning"),
    },
    "draw-machine": {
      items: () => getCurrentMusicLibrary(),
      display: "#current-music-lib",
      trigger: "#draw-music-btn",
      ticks: 15,
      tickMs: 80,
      onReady: (api) => {
        bridge.draw = api;
      },
      // 原闪现循环里每 tick 的 updateMusicInfo(flashMusic, getMusicLibName())
      onTick: (item) => updateMusicInfo(item, getMusicLibName()),
      // 原定格分支：写 drawnMusic / 进 music_drawn / 预载 audio.src / 存档 / 渲染 / 提示
      onResult: (item) => {
        if (bridge.music) bridge.music.setItem(item);
        GBState.currentMatch.drawnMusic = item;
        GBState.phase = "music_drawn";
        updateMusicInfo(item, getMusicLibName());
        saveState();
        renderAll();
        showToast(
          "已抽取音乐：" + item + "  曲库：" + getMusicLibName(),
          "success",
        );
      },
      onEmpty: () => showToast("音乐列表为空", "error"),
    },
  };
}

// ==================== 选胜者 ====================
function selectArenaWinner(arenaIdx) {
  // "music_playing" 相位全仓无赋值点（P11 前 P4 迁移起即死代码）；停播/退比赛
  // 由 music-player 组件的 battle-mode 双击退出负责，此处不再手工操控共享 audio。
  if (GBState.phase !== "battling") return;
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return;
  const p1IsDefender = DOM.arenaRole1.textContent === "守擂者";
  let winner, loser;
  if (arenaIdx === 0) {
    winner = p1IsDefender ? match.defender : match.challenger;
    loser = p1IsDefender ? match.challenger : match.defender;
  } else {
    winner = p1IsDefender ? match.challenger : match.defender;
    loser = p1IsDefender ? match.defender : match.challenger;
  }
  match.winner = winner;
  match.loser = loser;
  const loserGroup = GBState.groups[loser.groupIdx];
  if (!loserGroup.eliminated.includes(loser.playerName))
    loserGroup.eliminated.push(loser.playerName);
  pushUndo({ type: "select_winner", winner, loser });
  GBState.phase = "selecting_winner_anim";
  saveState();
  renderAll();
  playResultAnimations(winner, loser, () => {
    handleMatchEndCheck();
  });
}

// ==================== 赛后检查 ====================
function handleMatchEndCheck() {
  const match = GBState.currentMatch;
  const loserGroup = GBState.groups[match.loser.groupIdx];
  const remaining = loserGroup.members.filter(
    (m) => !loserGroup.eliminated.includes(m),
  );
  if (remaining.length === 0) {
    finishGroupMatch(match.winner.groupIdx, match.loser.groupIdx);
  } else {
    match.duelHistory.push({
      defender: { ...match.defender },
      challenger: { ...match.challenger },
      winner: { ...match.winner },
      loser: { ...match.loser },
    });
    match.defender = { ...match.winner, role: "defender" };
    match.nextChallengerGroupIdx = match.loser.groupIdx;
    match.challenger = null;
    match.winner = null;
    match.loser = null;
    GBState.phase = "selecting_next_challenger";
    saveState();
    renderAll();
    showToast(
      loserGroup.id + "组还有 " + remaining.length + " 人，请派出下一位挑战者",
      "info",
    );
  }
}

function finishGroupMatch(winnerGroupIdx, loserGroupIdx) {
  const match = GBState.currentMatch;
  match.duelHistory.push({
    defender: { ...match.defender },
    challenger: { ...match.challenger },
    winner: { ...match.winner },
    loser: { ...match.loser },
  });
  GBState.groups[winnerGroupIdx].wins++;
  GBState.groups[loserGroupIdx].losses++;
  match.matchWinnerGroupIdx = winnerGroupIdx;
  match.matchLoserGroupIdx = loserGroupIdx;
  if (GBState.groups[loserGroupIdx].losses >= 2)
    GBState.groups[loserGroupIdx].status = "eliminated";
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (pending) {
    pending.played = true;
    pending.winner = winnerGroupIdx;
    pending.loser = loserGroupIdx;
  }
  GBState.bracket.completedMatches.push({
    round: 2,
    stage: "winners_losers",
    group1: winnerGroupIdx,
    group2: loserGroupIdx,
    winner: winnerGroupIdx,
    duelHistory: [...match.duelHistory],
    label: pending ? pending.label : "",
  });
  pushUndo({ type: "finish_match", winnerGroupIdx, loserGroupIdx });
  GBState.phase = "match_end";
  saveState();
  renderAll();
  showToast(GBState.groups[winnerGroupIdx].id + "组获胜！", "success");
}

// ==================== 进入下一场 / 下一大轮 ====================
function handleResetMatch() {
  if (!confirm("确定要重置当前对战吗？分组结果和已完成场次将保留。")) return;
  const match = GBState.currentMatch;
  if (match.loser) {
    const g = GBState.groups[match.loser.groupIdx];
    g.eliminated = g.eliminated.filter((n) => n !== match.loser.playerName);
  }
  match.duelHistory.forEach((d) => {
    if (d.loser) {
      const g = GBState.groups[d.loser.groupIdx];
      g.eliminated = g.eliminated.filter((n) => n !== d.loser.playerName);
    }
  });
  const g1 = match.group1Idx;
  const g2 = match.group2Idx;
  GBState.currentMatch = {
    group1Idx: g1,
    group2Idx: g2,
    defender: null,
    challenger: null,
    winner: null,
    loser: null,
    duelHistory: [],
    matchWinnerGroupIdx: null,
    matchLoserGroupIdx: null,
    nextChallengerGroupIdx: null,
  };
  GBState.phase = "selecting_players";
  const player = document.getElementById("music-player");
  player.pause();
  player.currentTime = 0;
  player.src = "";
  if (apis.music) apis.music.clearItem(); // 同步组件内部 current
  saveState();
  renderAll();
  DOM.startBattleBtn.disabled = false;
  showToast("当前对战已重置，请重新选择出战选手", "success");
}

function handleNextMatch() {
  if (GBState.phase !== "match_end") {
    showToast("请先完成当前场次", "warning");
    return;
  }
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (pending) {
    GBState.currentMatch = {
      group1Idx: null,
      group2Idx: null,
      defender: null,
      challenger: null,
      winner: null,
      loser: null,
      duelHistory: [],
      matchWinnerGroupIdx: null,
      matchLoserGroupIdx: null,
      nextChallengerGroupIdx: null,
    };
    GBState.phase = "selecting_groups";
    selectedGroupIdxs = [];
    saveState();
    renderAll();
    showToast("请进行下一场对战", "info");
  } else {
    showToast("第二大轮全部结束！即将自动进入第三大轮", "success");
    setTimeout(() => {
      handleNextRound();
    }, 1500);
  }
}

function handleNextRound() {
  const round2Result = {
    round: 2,
    groups: GBState.groups.map((g) => ({
      id: g.id,
      wins: g.wins,
      losses: g.losses,
      status: g.status,
      members: g.members,
    })),
    completedMatches: GBState.bracket.completedMatches,
    revivalUsed: GBState.revivalUsed,
  };
  localStorage.setItem("groupBattleRound2", JSON.stringify(round2Result));
  window.location.href = "group_battle_3.html";
}

// ==================== render：渲染函数 ====================
function renderAll() {
  renderVisibility();
  renderStatus();
  renderGroups();
  renderArena();
  renderActions();
  renderHistory();
}

function renderVisibility() {
  const p = GBState.phase;
  DOM.battleArena.classList.toggle(
    "hidden",
    p !== "selecting_players" &&
      p !== "ready_to_battle" &&
      p !== "music_drawn" &&
      p !== "battling" &&
      p !== "selecting_winner_anim" &&
      p !== "selecting_next_challenger" &&
      p !== "match_end" &&
      p !== "music_playing",
  );
  DOM.musicInfoSection.classList.toggle(
    "hidden",
    p === "selecting_groups" || p === "loading",
  );
}

function renderStatus() {
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  DOM.bracketStatus.textContent = pending
    ? "第二大轮 - " + pending.label
    : "第二大轮 - 结束";
  let hint = "";
  switch (GBState.phase) {
    case "loading":
      hint = "加载中...";
      break;
    case "selecting_groups":
      hint =
        "请选择对战的两个组" +
        (pending
          ? "（" +
            GBState.groups[pending.g1].id +
            "组 vs " +
            GBState.groups[pending.g2].id +
            "组）"
          : "");
      break;
    case "selecting_players":
      hint = "请从两组中各选1名出战选手（再次点击可回归）";
      break;
    case "ready_to_battle":
      hint = "请点击「抽取音乐」";
      break;
    case "music_drawn":
      hint = "请点击「开始比赛」开始对战";
      break;
    case "music_playing":
      hint = "音乐播放中，双击屏幕结束播放";
      break;
    case "battling":
      hint = "对战开始！请点击胜者  当前曲库：" + getMusicLibName();
      break;
    case "selecting_winner_anim":
      hint = "结果确认中...";
      break;
    case "selecting_next_challenger":
      hint =
        GBState.groups[GBState.currentMatch.nextChallengerGroupIdx].id +
        "组请派出下一位挑战者";
      break;
    case "match_end":
      hint = "本场结束";
      break;
    default:
      hint = "...";
  }
  DOM.systemHint.textContent = hint;

  const match = GBState.currentMatch;
  if (match.defender && match.challenger) {
    const musicLibName = getMusicLibName();
    const drawnMusic = match.drawnMusic || "-";
    updateMusicInfo(drawnMusic, musicLibName);
  } else {
    updateMusicInfo("-", "");
  }
}

function renderGroups() {
  DOM.groupsGrid.innerHTML = "";
  const match = GBState.currentMatch;
  const activeIdxs =
    match.group1Idx !== null && match.group2Idx !== null
      ? [match.group1Idx, match.group2Idx]
      : [];
  GBState.groups.forEach((group, idx) => {
    const card = document.createElement("div");
    card.className = "group-card";
    card.id = "group-card-" + idx;
    card.dataset.groupIdx = idx;
    if (
      GBState.phase !== "loading" &&
      GBState.phase !== "selecting_groups" &&
      activeIdxs.length > 0 &&
      !activeIdxs.includes(idx)
    ) {
      card.classList.add("hidden");
    }
    if (group.status === "eliminated") card.classList.add("eliminated");
    const title = document.createElement("h3");
    title.className = "group-title";
    title.textContent =
      "Group " + group.id + " (" + group.wins + "胜 " + group.losses + "负)";
    card.appendChild(title);
    const membersDiv = document.createElement("div");
    membersDiv.className = "group-members";
    group.members.forEach((member) => {
      const el = document.createElement("div");
      el.className = "member-name";
      el.textContent = member;
      if (group.eliminated.includes(member)) {
        el.classList.add("eliminated");
        if (canRevive(member)) {
          const reviveBtn = document.createElement("button");
          reviveBtn.textContent = "复活";
          reviveBtn.className = "revive-btn";
          reviveBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            handleRevive(idx, member);
          });
          el.appendChild(reviveBtn);
        }
      }
      if (
        match.defender &&
        match.defender.groupIdx === idx &&
        match.defender.playerName === member
      )
        el.classList.add("active-fighter");
      if (
        match.challenger &&
        match.challenger.groupIdx === idx &&
        match.challenger.playerName === member
      )
        el.classList.add("active-fighter");
      if (canSelectMember(idx, member)) {
        el.classList.add("selectable");
        el.addEventListener("click", (e) => handleMemberClick(idx, member, e));
      }
      membersDiv.appendChild(el);
    });
    card.appendChild(membersDiv);
    if (GBState.phase === "selecting_groups" && canSelectGroup(idx)) {
      card.classList.add("selectable-group");
      if (selectedGroupIdxs.includes(idx)) card.classList.add("selected-group");
    }
    DOM.groupsGrid.appendChild(card);
  });
}

function canSelectMember(groupIdx, playerName) {
  const group = GBState.groups[groupIdx];
  const match = GBState.currentMatch;
  if (
    match.defender &&
    match.defender.groupIdx === groupIdx &&
    match.defender.playerName === playerName
  )
    return true;
  if (
    match.challenger &&
    match.challenger.groupIdx === groupIdx &&
    match.challenger.playerName === playerName
  )
    return true;
  if (group.eliminated.includes(playerName)) return false;
  if (GBState.phase === "selecting_players") {
    if (match.defender === null) return true;
    if (match.challenger === null) return groupIdx !== match.defender.groupIdx;
    return false;
  }
  if (GBState.phase === "selecting_next_challenger")
    return groupIdx === match.nextChallengerGroupIdx;
  return false;
}

function canSelectGroup(idx) {
  if (GBState.phase !== "selecting_groups") return false;
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (!pending) return false;
  return idx === pending.g1 || idx === pending.g2;
}

function renderArena() {
  const match = GBState.currentMatch;
  DOM.arenaPlayer1.classList.remove("winner-anim", "loser-anim", "filled");
  DOM.arenaPlayer2.classList.remove("winner-anim", "loser-anim", "filled");
  if (!match.defender && !match.challenger) {
    DOM.arenaPlayer1Name.textContent = "?";
    DOM.arenaPlayer2Name.textContent = "?";
    DOM.arenaGroup1Label.textContent = "-";
    DOM.arenaGroup2Label.textContent = "-";
    DOM.arenaRole1.textContent = "-";
    DOM.arenaRole2.textContent = "-";
    return;
  }
  if (match.defender) {
    DOM.arenaPlayer1Name.textContent = match.defender.playerName;
    DOM.arenaGroup1Label.textContent =
      GBState.groups[match.defender.groupIdx].id + "组";
    DOM.arenaRole1.textContent = "守擂者";
    DOM.arenaPlayer1.classList.add("filled");
  } else {
    DOM.arenaPlayer1Name.textContent = "?";
    DOM.arenaGroup1Label.textContent = "-";
    DOM.arenaRole1.textContent = "-";
  }
  if (match.challenger) {
    DOM.arenaPlayer2Name.textContent = match.challenger.playerName;
    DOM.arenaGroup2Label.textContent =
      GBState.groups[match.challenger.groupIdx].id + "组";
    DOM.arenaRole2.textContent = "挑战者";
    DOM.arenaPlayer2.classList.add("filled");
  } else {
    DOM.arenaPlayer2Name.textContent = "?";
    DOM.arenaGroup2Label.textContent = "-";
    DOM.arenaRole2.textContent = "-";
  }
}

function renderActions() {
  const p = GBState.phase;
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  DOM.drawMusicBtn.classList.toggle(
    "hidden",
    p !== "ready_to_battle" &&
      p !== "music_drawn" &&
      p !== "music_playing" &&
      p !== "battling",
  );
  DOM.startBattleBtn.classList.toggle(
    "hidden",
    p !== "music_drawn" && p !== "music_playing" && p !== "battling",
  );
  DOM.clearWinnerBtn.disabled =
    p !== "battling" &&
    p !== "selecting_next_challenger" &&
    p !== "match_end" &&
    p !== "ready_to_battle" &&
    p !== "music_playing";
  DOM.resetMatchBtn.classList.toggle(
    "hidden",
    p !== "selecting_players" &&
      p !== "ready_to_battle" &&
      p !== "battling" &&
      p !== "selecting_next_challenger" &&
      p !== "match_end" &&
      p !== "music_drawn" &&
      p !== "music_playing",
  );
  DOM.nextMatchBtn.classList.toggle("hidden", p !== "match_end" || !pending);
  DOM.nextRoundBtn.classList.toggle("hidden", p !== "match_end" || !!pending);
}

function renderHistory() {
  DOM.matchHistory.innerHTML = "";
  GBState.bracket.completedMatches.forEach((m) => {
    const item = document.createElement("div");
    item.className = "history-item";
    const g1 = GBState.groups[m.group1].id;
    const g2 = GBState.groups[m.group2].id;
    const winner = GBState.groups[m.winner].id;
    item.textContent =
      (m.label || "") +
      " " +
      g1 +
      "组 vs " +
      g2 +
      "组 -> " +
      winner +
      "组胜 (" +
      m.duelHistory.length +
      "场单挑";
    DOM.matchHistory.appendChild(item);
  });
}

// ==================== persist：撤消 + 重置 + 持久化 ====================

// ==================== 撤消 ====================
function handleUndo() {
  if (GBState.undoStack.length === 0) {
    showToast("没有可撤消的操作", "info");
    return;
  }
  const action = GBState.undoStack.pop();
  const match = GBState.currentMatch;
  switch (action.type) {
    case "select_defender":
      match.defender = null;
      GBState.phase = "selecting_players";
      break;
    case "select_challenger":
      match.challenger = null;
      GBState.phase = "selecting_players";
      break;
    case "return_defender":
      match.defender = {
        groupIdx: action.groupIdx,
        playerName: action.playerName,
        role: "defender",
      };
      break;
    case "return_challenger":
      match.challenger = {
        groupIdx: action.groupIdx,
        playerName: action.playerName,
        role: "challenger",
      };
      break;
    case "select_next_challenger":
      if (match.duelHistory.length > 0) {
        const last = match.duelHistory.pop();
        match.defender = last.defender;
        match.challenger = last.challenger;
        match.winner = last.winner;
        match.loser = last.loser;
      }
      GBState.phase = "selecting_next_challenger";
      break;
    case "select_winner":
      {
        const g = GBState.groups[action.loser.groupIdx];
        g.eliminated = g.eliminated.filter(
          (n) => n !== action.loser.playerName,
        );
        match.winner = null;
        match.loser = null;
      }
      GBState.phase = "battling";
      break;
    case "finish_match":
      GBState.groups[action.winnerGroupIdx].wins--;
      GBState.groups[action.loserGroupIdx].losses--;
      if (GBState.groups[action.loserGroupIdx].losses < 2)
        GBState.groups[action.loserGroupIdx].status = "active";
      {
        const last = GBState.bracket.completedMatches.pop();
        if (last) {
          const p = GBState.bracket.pendingMatches.find((m) => m.played);
          if (p) p.played = false;
        }
      }
      match.matchWinnerGroupIdx = null;
      match.matchLoserGroupIdx = null;
      GBState.phase = "match_end";
      break;
    case "revive":
      {
        const g = GBState.groups[action.groupIdx];
        if (!g.eliminated.includes(action.playerName))
          g.eliminated.push(action.playerName);
        GBState.revivalUsed[action.playerName] = false;
        refreshGroupStatus(action.groupIdx);
        if (action.reopenedMatch && action.completedSnapshot) {
          GBState.bracket.completedMatches.push(action.completedSnapshot);
          const pending = [...GBState.bracket.pendingMatches]
            .reverse()
            .find((m) => !m.played);
          if (pending) {
            pending.played = true;
            pending.winner = action.completedSnapshot.group1;
            pending.loser = action.completedSnapshot.group2;
          }
          GBState.groups[action.completedSnapshot.group1].wins++;
          GBState.groups[action.completedSnapshot.group2].losses++;
          if (GBState.groups[action.completedSnapshot.group2].losses >= 2) {
            GBState.groups[action.completedSnapshot.group2].status =
              "eliminated";
          }
          GBState.currentMatch = action.matchSnapshot || GBState.currentMatch;
          GBState.phase = "match_end";
        }
      }
      break;
  }
  saveState();
  renderAll();
  showToast("已撤消上一步操作", "success");
}

// ==================== 重置 & 持久化 ====================
function handleReset() {
  if (!confirm("确定要重置第二大轮吗？")) return;
  localStorage.removeItem("groupBattleRound2");
  setupRound2();
  renderAll();
  showToast("已重置", "success");
}

function saveState() {
  const persisted = { ...GBState };
  delete persisted.oldPlayers;
  delete persisted.newPlayers;
  delete persisted.allPlayers;
  try {
    localStorage.setItem("groupBattleStateR2", JSON.stringify(persisted));
  } catch (e) {}
}
