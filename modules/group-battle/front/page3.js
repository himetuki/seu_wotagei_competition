/**
 * 团体赛 - 第三大轮（决赛）页面闭包（P3d 迁入）
 * 1v1赛制，单轮决胜，无复活
 *
 * 原 gb_common.js + group_battle_3_{main,data,battle,render,persist}.js
 * 并入同一模块作用域：全局函数/变量 → 闭包作用域，函数体逐行保留。
 * 原 main 的 DOMContentLoaded 初始化改由 initPage3() 承接。
 */
import { showToast, makePageHelpers } from "./gb_common.js";

// ==================== main：状态定义 ====================
const GBState = {
  phase: "loading",
  round: 3,
  allPlayers: [], oldPlayers: [], newPlayers: [],
  groups: [],
  currentMatch: { group1Idx: null, group2Idx: null, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null },
  bracket: { pendingMatches: [], completedMatches: [] },
  undoStack: [],
  musicListNew: [], musicListEx: [],
  round2Data: null,
  grandFinalSeedGroupIdx: null,
};

const DOM = {};
const PlayerPools = { oldSet: new Set(), newSet: new Set() };

// 组件实例 API 桥（front/plugin.js 传入、组件 onReady 同步回填；组件缺失时保持 null）
let apis = { music: null, draw: null };

// 原 gb_common.js 中依赖页面状态的共用函数（调用点写法不变）
const {
  pushUndo,
  playResultAnimations,
  clampTransientPhase,
} = makePageHelpers({
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
  DOM.finishBtn = document.getElementById("finish-btn");
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
  DOM.finishBtn.addEventListener("click", handleFinish, { signal });
  DOM.resetMatchBtn.addEventListener("click", handleResetMatch, { signal });
  DOM.prevRoundBtn.addEventListener("click", () => { window.location.href = "group_battle_2.html"; }, { signal });
  document.getElementById("reset-game-btn").addEventListener("click", handleReset, { signal });
  document.getElementById("home-btn").addEventListener("click", () => { window.location.href = "/m/home"; }, { signal });
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
function initPage3(componentBridge) {
  apis = componentBridge || { music: null, draw: null };
  cacheDOM();
  const bindAbort = new AbortController();
  bindEvents(bindAbort.signal);

  loadRound2Data().then(() => {
    if (!GBState.round2Data) {
      showToast("未找到第二大轮数据，请返回第二大轮", "error");
      DOM.systemHint.textContent = "请先完成第二大轮";
      return;
    }
    // setupRound3 完成资源拉取与新开局构建后接存档恢复链（handleReset 不链用，行为不变）
    setupRound3().then(() => {
      // 存档恢复（server → localStorage → 都无则保持 setupRound3 的新开局）
      loadStateFromServerR3().then((ok) => {
        if (!ok) loadStateR3();
        // 瞬态相位钳制：存档若落在 2.4s 结果动画窗口，回滚到 battling 重新点胜者
        clampTransientPhase();
        // 恢复到 music_drawn/battling 时同步组件的 current 与 audio.src（镜像 page1）
        if (apis.music && GBState.currentMatch && GBState.currentMatch.drawnMusic) {
          apis.music.setItem(GBState.currentMatch.drawnMusic);
        }
        renderAll();
      });
    })
    .catch(() => renderAll()); // 选手/曲库拉取失败也保证渲染（加载态），且不留未处理 rejection
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

export { initPage3 };

// ==================== data：数据加载 + 第三轮构建 + 曲库管理 ====================
// 服务端档的第二大轮形态识别：服务端会存第一大轮明文/包装态、page2 handleNextRound
// 发布的 {round2Result, currentState} 包装（内层是第二大轮末态）或第三轮包装态
// （{finalResult, currentState} 内层是第三轮态）——兜底只认 round===2 且特征键齐全
// 的第二大轮形态，拿第一轮数据兜底时判无效（否则会拿别轮 completedMatches 硬拼赛程）。
function isRound2State(state) {
  return (
    state && typeof state === "object" &&
    state.round === 2 &&
    Array.isArray(state.groups) &&
    state.bracket && typeof state.bracket === "object" &&
    Array.isArray(state.bracket.completedMatches)
  );
}

function loadRound2Data() {
  return new Promise((resolve) => {
    const local = localStorage.getItem("groupBattleRound2");
    if (local) { try { GBState.round2Data = JSON.parse(local); resolve(); return; } catch (e) {} }
    fetch("/api/group-battle-process")
      .then((r) => r.json())
      .then((data) => {
        const payload = data && data.currentState;
        const cs = isRound2State(payload && payload.currentState)
          ? payload.currentState
          : isRound2State(payload)
            ? payload
            : null;
        if (cs && cs.bracket.completedMatches.length >= 2) {
          GBState.round2Data = { groups: cs.groups, completedMatches: cs.bracket.completedMatches };
        }
        resolve();
      })
      .catch(() => resolve());
  });
}

function setupRound3() {
  const r2 = GBState.round2Data;
  GBState.groups = r2.groups.map((g) => ({ ...g, eliminated: [], members: g.members }));
  // 返回 Promise 供 initPage3 在资源加载完成后接存档恢复链
  return Promise.all([
    fetch("/resource/json/player1.json").then((r) => r.json()),
    fetch("/resource/json/player2.json").then((r) => r.json()),
    fetch("/resource/json/musics_list_ex.json").then((r) => r.json()).catch(() => []),
  ]).then(([oldData, newData, exList]) => {
    GBState.oldPlayers = oldData.map((p) => p.name);
    GBState.newPlayers = newData.map((p) => p.name);
    GBState.allPlayers = [...GBState.oldPlayers, ...GBState.newPlayers];
    GBState.musicListEx = exList;

    const completed = Array.isArray(r2.completedMatches) ? r2.completedMatches : [];
    const winnersMatch = completed.find((m) => m.label === "胜者组") || completed[0] || null;
    const losersMatch = completed.find((m) => m.label === "败者组") || completed[1] || null;

    const matches = [];
    if (winnersMatch && losersMatch) {
      const winnersLoser = winnersMatch.winner === winnersMatch.group1 ? winnersMatch.group2 : winnersMatch.group1;
      const losersWinner = losersMatch.winner;
      GBState.grandFinalSeedGroupIdx = winnersMatch.winner;
      matches.push({ g1: losersWinner, g2: winnersLoser, played: false, label: "败者组决赛" });
    }

    GBState.bracket.pendingMatches = matches;
    GBState.phase = matches.length > 0 ? "selecting_groups" : "finished";
    renderAll();
  });
}

function getMusicLibName() {
  return "四强赛曲库";
}

function getCurrentMusicLibrary() {
  return GBState.musicListEx;
}

function getMusicFolder() {
  return "1yearplus_ex";
}

function updateMusicInfo(trackName, sourceName) {
  if (DOM.currentMusicLib) {
    DOM.currentMusicLib.textContent = trackName || "-";
  }
  if (DOM.currentMusicSource) {
    DOM.currentMusicSource.textContent = sourceName ? "曲库：" + sourceName : "";
    DOM.currentMusicSource.classList.toggle("hidden", !sourceName);
  }
}

// ==================== battle：选组 + 选手选择 + 抽取音乐 + 开始比赛 + 选胜者 + 赛后处理 + handleFinish ====================

// ==================== 选组 ====================
let selectedGroupIdxs = [];

function handleGroupSectionClick(e) {
  const card = e.target.closest(".group-card");
  if (!card) return;
  const idx = parseInt(card.dataset.groupIdx);
  if (GBState.phase === "selecting_groups") { handleSelectGroup(idx); return; }
}

function handleSelectGroup(idx) {
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (!pending) return;
  if (idx !== pending.g1 && idx !== pending.g2) { showToast("请按赛程选择指定的组", "warning"); return; }
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
  GBState.currentMatch = { group1Idx: idx1, group2Idx: idx2, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null };
  GBState.phase = "selecting_players";
  selectedGroupIdxs = [];
  saveState(); renderAll();
  showToast("请从两组中各1名出战选手", "info");
}

// ==================== 选手选择 ====================
function handleMemberClick(groupIdx, playerName, e) {
  e.stopPropagation();
  const match = GBState.currentMatch;
  if (match.defender && match.defender.groupIdx === groupIdx && match.defender.playerName === playerName) {
    match.defender = null;
    // 对齐 page1/page2：ready_to_battle/music_drawn 下回归选手须回退相位并清已抽音乐，
    // 否则停在就绪相位却无出战选手，进入无法重选的单人死局
    if (GBState.phase === "ready_to_battle" || GBState.phase === "music_drawn") {
      GBState.phase = "selecting_players";
      match.drawnMusic = null;
    }
    pushUndo({ type: "return_defender", groupIdx, playerName }); saveState(); renderAll(); return;
  }
  if (match.challenger && match.challenger.groupIdx === groupIdx && match.challenger.playerName === playerName) {
    match.challenger = null;
    if (GBState.phase === "ready_to_battle" || GBState.phase === "music_drawn") {
      GBState.phase = "selecting_players";
      match.drawnMusic = null;
    }
    pushUndo({ type: "return_challenger", groupIdx, playerName }); saveState(); renderAll(); return;
  }
  if (GBState.phase === "selecting_players") {
    if (match.defender === null) {
      match.defender = { groupIdx, playerName, role: "defender" };
      pushUndo({ type: "select_defender", groupIdx, playerName });
      saveState(); renderAll();
      if (match.challenger !== null) enterReadyPhase();
      return;
    }
    if (match.challenger === null && groupIdx !== match.defender.groupIdx) {
      match.challenger = { groupIdx, playerName, role: "challenger" };
      pushUndo({ type: "select_challenger", groupIdx, playerName });
      saveState(); renderAll();
      if (match.defender !== null) enterReadyPhase();
      return;
    }
    if (match.challenger === null && groupIdx === match.defender.groupIdx) { showToast("请选择另一组的成员", "warning"); return; }
  }
}

function enterReadyPhase() {
  GBState.phase = "ready_to_battle";
  saveState(); renderAll();
  showToast("选手已就位！请先抽取音乐", "info");
}

// ==================== 组件接入（抽取动画 / 播放+比赛模式）====================
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
export function componentProps3(bridge) {
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
        saveState(); renderAll();
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
        saveState(); renderAll();
        showToast("音乐已停止，请点击胜者", "info");
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
        saveState(); renderAll();
        showToast("已抽取音乐：" + item + "  曲库：" + getMusicLibName(), "success");
      },
      onEmpty: () => showToast("音乐列表为空", "error"),
    },
  };
}

// ==================== 选胜者（1v1单轮决胜）====================
function selectArenaWinner(arenaIdx) {
  if (GBState.phase !== "battling") return;
  const match = GBState.currentMatch;
  if (!match.defender || !match.challenger) return;
  const p1IsDefender = DOM.arenaRole1.textContent === "选手1";
  let winner, loser;
  if (arenaIdx === 0) { winner = p1IsDefender ? match.defender : match.challenger; loser = p1IsDefender ? match.challenger : match.defender; }
  else { winner = p1IsDefender ? match.challenger : match.defender; loser = p1IsDefender ? match.defender : match.challenger; }
  match.winner = winner; match.loser = loser;
  pushUndo({ type: "select_winner", winner, loser });
  GBState.phase = "selecting_winner_anim";
  saveState(); renderAll();
  playResultAnimations(winner, loser, () => { finishMatch(winner.groupIdx, loser.groupIdx); });
}

function finishMatch(winnerGroupIdx, loserGroupIdx) {
  const match = GBState.currentMatch;
  match.duelHistory.push({ defender: { ...match.defender }, challenger: { ...match.challenger }, winner: { ...match.winner }, loser: { ...match.loser } });
  GBState.groups[winnerGroupIdx].wins++;
  GBState.groups[loserGroupIdx].losses++;
  match.matchWinnerGroupIdx = winnerGroupIdx;
  match.matchLoserGroupIdx = loserGroupIdx;
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (pending) { pending.played = true; pending.winner = winnerGroupIdx; pending.loser = loserGroupIdx; }
  GBState.bracket.completedMatches.push({ round: 3, stage: "final", group1: winnerGroupIdx, group2: loserGroupIdx, winner: winnerGroupIdx, duelHistory: [...match.duelHistory], label: pending ? pending.label : "" });
  pushUndo({ type: "finish_match", winnerGroupIdx, loserGroupIdx });
  GBState.phase = "match_end";
  saveState(); renderAll();
  showToast(GBState.groups[winnerGroupIdx].id + "组获胜！", "success");
}

// ==================== 进入下一场 / 比赛结束 ====================
function handleResetMatch() {
  if (!confirm("确定要重置当前对战吗？已完成场次将保留。")) return;
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
  GBState.currentMatch = { group1Idx: g1, group2Idx: g2, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null };
  GBState.phase = "selecting_players";
  const player = document.getElementById("music-player");
  player.pause(); player.currentTime = 0; player.src = "";
  if (apis.music) apis.music.clearItem(); // 同步组件内部 current
  saveState(); renderAll();
  showToast("当前对战已重置，请重新选择出战选手", "success");
}

function handleNextMatch() {
  if (GBState.phase !== "match_end") { showToast("请先完成当前场次", "warning"); return; }
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (pending) {
    GBState.currentMatch = { group1Idx: null, group2Idx: null, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null };
    GBState.phase = "selecting_groups";
    selectedGroupIdxs = [];
    saveState(); renderAll();
    showToast("请进行下一场对战", "info");
  } else {
    const hasGrandFinal = GBState.bracket.completedMatches.some((m) => m.label === "总决赛");
    if (!hasGrandFinal && GBState.grandFinalSeedGroupIdx !== null) {
      const last = GBState.bracket.completedMatches[GBState.bracket.completedMatches.length - 1];
      if (last) {
        GBState.bracket.pendingMatches.push({
          g1: GBState.grandFinalSeedGroupIdx,
          g2: last.winner,
          played: false,
          label: "总决赛",
        });
        GBState.currentMatch = { group1Idx: null, group2Idx: null, defender: null, challenger: null, winner: null, loser: null, duelHistory: [], matchWinnerGroupIdx: null, matchLoserGroupIdx: null };
        GBState.phase = "selecting_groups";
        selectedGroupIdxs = [];
        saveState(); renderAll();
        showToast("败者组决赛结束，进入总决赛", "success");
        return;
      }
    }

    showToast("全部比赛结束！即将自动跳转结果页", "success");
    setTimeout(() => {
      // 1.5s 窗口内用户撤销/重置等改变了相位则不再自动跳转（对齐 page1 同款守卫）
      if (GBState.phase === "match_end") handleFinish();
    }, 1500);
  }
}

function handleFinish() {
  const grand = GBState.bracket.completedMatches.find((m) => m.label === "总决赛");
  const lb = GBState.bracket.completedMatches.find((m) => m.label === "败者组决赛");
  let ranks = [];
  if (grand && lb) {
    const first = GBState.groups[grand.winner].id;
    const secondGroupIdx = grand.group1 === grand.winner ? grand.group2 : grand.group1;
    const second = GBState.groups[secondGroupIdx].id;
    const thirdGroupIdx = lb.group1 === lb.winner ? lb.group2 : lb.group1;
    const third = GBState.groups[thirdGroupIdx].id;
    const rest = GBState.groups.map((g) => g.id).filter((id) => id !== first && id !== second && id !== third);
    ranks = [first, second, third, ...(rest.length ? [rest[0]] : [])];
  } else {
    const sorted = [...GBState.groups].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    ranks = sorted.map((g) => g.id);
  }

  const finalResult = {
    round: 3,
    groups: GBState.groups.map((g) => ({ id: g.id, wins: g.wins, losses: g.losses })),
    completedMatches: GBState.bracket.completedMatches,
    finalRank: ranks
  };

  localStorage.setItem("groupBattleFinal", JSON.stringify(finalResult));

  fetch("/api/group-battle-process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ finalResult, currentState: GBState }),
  }).catch(() => {});

  window.location.href = "/m/team-rank";
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
  DOM.battleArena.classList.toggle("hidden", p !== "selecting_players" && p !== "ready_to_battle" && p !== "music_drawn" && p !== "battling" && p !== "selecting_winner_anim" && p !== "match_end" && p !== "music_playing");
  DOM.musicInfoSection.classList.toggle("hidden", p === "selecting_groups" || p === "loading");
}

function renderStatus() {
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  DOM.bracketStatus.textContent = pending ? "第三大轮 - " + pending.label : "第三大轮 - 结束";
  let hint = "";
  switch (GBState.phase) {
    case "loading": hint = "加载中..."; break;
    case "selecting_groups": hint = "请选择对战的两个组" + (pending ? "（" + GBState.groups[pending.g1].id + "组 vs " + GBState.groups[pending.g2].id + "组）" : ""); break;
    case "selecting_players": hint = "请从两组中各选1名出战选手（再次点击可回归）"; break;
    case "ready_to_battle": hint = "请点击「抽取音乐」"; break;
    case "music_drawn": hint = "请点击「开始比赛」开始对战"; break;
    case "music_playing": hint = "音乐播放中，双击屏幕结束播放"; break;
    case "battling": hint = "对战开始！请点击胜者  当前曲库：" + getMusicLibName(); break;
    case "selecting_winner_anim": hint = "结果确认中..."; break;
    case "match_end": hint = "本场结束"; break;
    default: hint = "...";
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
  const activeIdxs = (match.group1Idx !== null && match.group2Idx !== null) ? [match.group1Idx, match.group2Idx] : [];
  GBState.groups.forEach((group, idx) => {
    const card = document.createElement("div");
    card.className = "group-card";
    card.id = "group-card-" + idx;
    card.dataset.groupIdx = idx;
    if (GBState.phase !== "loading" && GBState.phase !== "selecting_groups" && activeIdxs.length > 0 && !activeIdxs.includes(idx)) {
      card.classList.add("hidden");
    }
    if (group.status === "eliminated") card.classList.add("eliminated");
    const title = document.createElement("h3");
    title.className = "group-title";
    title.textContent = "Group " + group.id + " (" + group.wins + "胜 " + group.losses + "负)";
    card.appendChild(title);
    const membersDiv = document.createElement("div");
    membersDiv.className = "group-members";
    group.members.forEach((member) => {
      const el = document.createElement("div");
      el.className = "member-name";
      el.textContent = member;
      if (match.defender && match.defender.groupIdx === idx && match.defender.playerName === member) el.classList.add("active-fighter");
      if (match.challenger && match.challenger.groupIdx === idx && match.challenger.playerName === member) el.classList.add("active-fighter");
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
  const match = GBState.currentMatch;
  if (match.defender && match.defender.groupIdx === groupIdx && match.defender.playerName === playerName) return true;
  if (match.challenger && match.challenger.groupIdx === groupIdx && match.challenger.playerName === playerName) return true;
  if (GBState.phase === "selecting_players") {
    if (match.defender === null) return true;
    if (match.challenger === null) return groupIdx !== match.defender.groupIdx;
    return false;
  }
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
    DOM.arenaPlayer1Name.textContent = "?"; DOM.arenaPlayer2Name.textContent = "?";
    DOM.arenaGroup1Label.textContent = "-"; DOM.arenaGroup2Label.textContent = "-";
    DOM.arenaRole1.textContent = "-"; DOM.arenaRole2.textContent = "-";
    return;
  }
  if (match.defender) {
    DOM.arenaPlayer1Name.textContent = match.defender.playerName;
    DOM.arenaGroup1Label.textContent = GBState.groups[match.defender.groupIdx].id + "组";
    DOM.arenaRole1.textContent = "选手1";
    DOM.arenaPlayer1.classList.add("filled");
  } else { DOM.arenaPlayer1Name.textContent = "?"; DOM.arenaGroup1Label.textContent = "-"; DOM.arenaRole1.textContent = "-"; }
  if (match.challenger) {
    DOM.arenaPlayer2Name.textContent = match.challenger.playerName;
    DOM.arenaGroup2Label.textContent = GBState.groups[match.challenger.groupIdx].id + "组";
    DOM.arenaRole2.textContent = "选手2";
    DOM.arenaPlayer2.classList.add("filled");
  } else { DOM.arenaPlayer2Name.textContent = "?"; DOM.arenaGroup2Label.textContent = "-"; DOM.arenaRole2.textContent = "-"; }
}

function renderActions() {
  const p = GBState.phase;
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  DOM.drawMusicBtn.classList.toggle("hidden", p !== "ready_to_battle" && p !== "music_drawn" && p !== "music_playing" && p !== "battling");
  DOM.startBattleBtn.classList.toggle("hidden", p !== "music_drawn" && p !== "music_playing" && p !== "battling");
  DOM.clearWinnerBtn.disabled = p !== "battling" && p !== "match_end" && p !== "ready_to_battle" && p !== "music_playing";
  DOM.resetMatchBtn.classList.toggle("hidden", p !== "selecting_players" && p !== "ready_to_battle" && p !== "battling" && p !== "match_end" && p !== "music_drawn" && p !== "music_playing");
  DOM.nextMatchBtn.classList.toggle("hidden", p !== "match_end" || !pending);
  DOM.finishBtn.classList.toggle("hidden", p !== "match_end" || !!pending);
}

function renderHistory() {
  DOM.matchHistory.innerHTML = "";
  GBState.bracket.completedMatches.forEach((m) => {
    const item = document.createElement("div");
    item.className = "history-item";
    const g1 = GBState.groups[m.group1].id;
    const g2 = GBState.groups[m.group2].id;
    const winner = GBState.groups[m.winner].id;
    item.textContent = (m.label || "") + " " + g1 + "组 vs " + g2 + "组 -> " + winner + "组胜";
    DOM.matchHistory.appendChild(item);
  });
}

// ==================== persist：撤消 + 重置 + 持久化 ====================

// ==================== 撤消 ====================
function handleUndo() {
  if (GBState.undoStack.length === 0) { showToast("没有可撤消的操作", "info"); return; }
  const action = GBState.undoStack.pop();
  const match = GBState.currentMatch;
  switch (action.type) {
    case "select_defender": match.defender = null; GBState.phase = "selecting_players"; break;
    case "select_challenger": match.challenger = null; GBState.phase = "selecting_players"; break;
    case "return_defender": match.defender = { groupIdx: action.groupIdx, playerName: action.playerName, role: "defender" }; break;
    case "return_challenger": match.challenger = { groupIdx: action.groupIdx, playerName: action.playerName, role: "challenger" }; break;
    case "select_winner":
      match.winner = null; match.loser = null;
      GBState.phase = "battling"; break;
    case "finish_match":
      GBState.groups[action.winnerGroupIdx].wins--;
      GBState.groups[action.loserGroupIdx].losses--;
      // 取「最近一场 played」而非首个：本页 pending 有败者组决赛+总决赛两场，
      // 撤销总决赛时必须重开总决赛（前一场保持已赛）
      { const last = GBState.bracket.completedMatches.pop(); if (last) { const p = [...GBState.bracket.pendingMatches].reverse().find((m) => m.played); if (p) p.played = false; } }
      match.matchWinnerGroupIdx = null; match.matchLoserGroupIdx = null;
      GBState.phase = "match_end"; break;
  }
  saveState(); renderAll();
  showToast("已撤消上一步操作", "success");
}

// ==================== 重置 & 持久化 ====================
function handleReset() {
  if (!confirm("确定要重置第三大轮吗？")) return;
  GBState.undoStack = [];
  // 删本页产出键（groupBattleStateR3）；原误删输入键 groupBattleRound2——它是
  // setupRound3 重建赛程的依据，重置第三大轮不应动第二大轮的产出
  localStorage.removeItem("groupBattleStateR3");
  // 服务端已发布的进度同步作废，否则刷新后 handleFinish 残留的第三轮包装态
  // 会把已重置的第三大轮复活
  fetch("/api/clear-group-battle-process", { method: "POST" }).catch(() => {});
  setupRound3();
  renderAll();
  showToast("已重置", "success");
}

function saveState() {
  try { localStorage.setItem("groupBattleStateR3", JSON.stringify(GBState)); } catch (e) {}
}

// ==================== 存档恢复（镜像 page1 的 server → localStorage 双级链）====================
/**
 * 第三大轮进行中存档识别：本页 saveState 只写 localStorage；服务端唯一可能持有
 * 本页中态的形态是 handleFinish 写入的包装 {finalResult, currentState}（内层是
 * 本页 GBState 原样快照，round===3）。其余形态（第一大轮明文/包装、无 currentState）
 * 一律视为无效档回落 localStorage。
 */
function isValidRound3Save(state) {
  return (
    state &&
    typeof state === "object" &&
    state.round === 3 &&
    typeof state.phase === "string" &&
    state.phase !== "loading" &&
    Array.isArray(state.groups) &&
    state.bracket &&
    typeof state.bracket === "object"
  );
}

function applyRound3Save(state) {
  const parsed = { ...state };
  // 曲库/选手池/上游第二轮数据由本轮初始化现拉，存档里的旧副本不覆盖
  delete parsed.musicListNew;
  delete parsed.musicListEx;
  delete parsed.oldPlayers;
  delete parsed.newPlayers;
  delete parsed.allPlayers;
  delete parsed.round2Data;
  Object.assign(GBState, parsed);
}

function loadStateFromServerR3() {
  return fetch("/api/group-battle-process")
    .then((r) => r.json())
    .then((data) => {
      const payload = data && data.currentState;
      const state = isValidRound3Save(payload && payload.currentState)
        ? payload.currentState
        : isValidRound3Save(payload)
          ? payload
          : null;
      if (!state) return false;
      applyRound3Save(state);
      return true;
    })
    .catch(() => false);
}

function loadStateR3() {
  try {
    const s = localStorage.getItem("groupBattleStateR3");
    if (!s) return;
    const parsed = JSON.parse(s);
    if (!isValidRound3Save(parsed)) return;
    applyRound3Save(parsed);
  } catch (e) {}
}
