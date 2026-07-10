/**
 * Drag式比赛 — 数据加载 & 持久化 & 重置
 */

/* =================================================================
 *  选手组切换
 * ================================================================= */
function switchPlayerSource(source) {
  if (State.playerSource === source) return;

  if (State.nodes.length > 0) saveState();

  State.playerSource = source;
  State.phase = "playing";

  document.getElementById("switch-player1-btn").classList.toggle("active", source === "player1");
  document.getElementById("switch-player2-btn").classList.toggle("active", source === "player2");

  const saved = localStorage.getItem("dragTotalCount");
  if (saved) State.totalCount = Math.max(2, parseInt(saved) || 8);

  loadPlayers().then(() => {
    const raw = localStorage.getItem(storageKey(source));
    if (raw) {
      try {
        const data = JSON.parse(raw);
        const restoredCount = data.totalCount || 0;
        const actualAvailable = State.allPlayers.length;
        const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;
        const compatible = data.nodes && data.nodes.length > 0 &&
          restoredCount <= actualAvailable && isPow2(restoredCount || 1);

        if (compatible) {
          restoreState(data);
          recomputeLayout();
          renderAll();
          showHint("已切换到" + (source === "player1" ? "加组" : "内组") + "（已恢复进度）");
          return;
        }
      } catch (e) {}
    }

    buildOrResetBracket();
    saveState();
    renderAll();
    showHint("已切换到" + (source === "player1" ? "加组" : "内组"));
  });
}

/* =================================================================
 *  随机 & 加载
 * ================================================================= */
function shufflePlayers() {
  loadPlayers().then(() => {
    if (State.allPlayers.length === 0) return;
    for (let i = State.allPlayers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [State.allPlayers[i], State.allPlayers[j]] = [State.allPlayers[j], State.allPlayers[i]];
    }
    buildOrResetBracket();
    saveState();
    renderAll();
    showHint("已随机排列选手");
  });
}

function loadPlayers() {
  const file = State.playerSource === "player1" ? "player1.json" : "player2.json";
  return fetch("../resource/json/" + file)
    .then(r => r.json())
    .then(data => {
      State.allPlayers = data.map(item => (item && item.name ? item.name.trim() : "")).filter(Boolean);

      const effective = Math.min(State.totalCount, State.allPlayers.length);
      State.totalCount = Math.max(2, effective);

      const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;
      if (!isPow2(State.allPlayers.length)) {
        const padded = Math.pow(2, Math.ceil(Math.log2(State.allPlayers.length)));
        showError("选手人数(" + State.allPlayers.length + ")非2^n，将补齐至" + padded + "个位置");
      } else {
        hideError();
      }

      document.getElementById("round-label").textContent =
        "第1轮 · " + State.totalCount + "人";
    })
    .catch(err => {
      console.error("加载选手失败:", err);
      showError("选手数据加载失败");
    });
}

function loadMusic() {
  return Promise.all([
    fetch("../resource/json/musics_list.json").then(r => r.json()).catch(() => []),
    fetch("../resource/json/musics_list_2.json").then(r => r.json()).catch(() => []),
    fetch("../resource/json/musics_list_ex.json").then(r => r.json()).catch(() => []),
  ]).then(([oldL, newL, exL]) => {
    State.music.oldList = oldL;
    State.music.newList = newL;
    State.music.exList = exL;
  });
}

function loadSettings() {
  const saved = localStorage.getItem("dragTotalCount");
  if (saved) State.totalCount = Math.max(2, parseInt(saved) || 8);
  return fetch("http://localhost:3000/api/drag-settings")
    .then(r => r.json())
    .then(data => {
      if (data && data.totalCount) {
        State.totalCount = Math.max(2, parseInt(data.totalCount));
      }
      if (data && typeof data.doubleElim === "boolean") {
        State.doubleElim = data.doubleElim;
      }
    })
    .catch(() => {});
}

/* =================================================================
 *  重置
 * ================================================================= */
function handleReset() {
  if (!confirm("确定要重置比赛？所有进度将丢失。")) return;

  localStorage.removeItem(storageKey());
  fetch(API_CLEAR_URL, { method: "POST" }).catch(() => {});

  State.music.current = null;

  if (musicRolling) { clearInterval(musicRolling); musicRolling = null; }
  lastDrawnMusic = null;
  lastDrawnMusicSource = null;
  battleActive = false;
  document.body.classList.remove("battle-mode");
  document.body.classList.remove("battle-keep-bg");
  const player = document.getElementById("music-player");
  player.pause();
  player.currentTime = 0;
  player.onended = null;
  const musicDisplay = document.getElementById("music-display");
  musicDisplay.textContent = "—";
  musicDisplay.classList.remove("rolling", "selected");
  document.getElementById("draw-music-btn").disabled = false;
  document.getElementById("start-battle-btn").disabled = true;

  loadPlayers().then(() => {
    buildOrResetBracket();
    saveState();
    recomputeLayout();
    renderAll();
    showHint("已重置");
  });
}

/* =================================================================
 *  持久化
 * ================================================================= */
function storageKey(source) {
  return "dragBattleState2_" + (source || State.playerSource);
}

function getPersisted() {
  return {
    playerSource: State.playerSource,
    totalCount: State.totalCount,
    allPlayers: State.allPlayers,
    n: State.n,
    nodes: State.nodes.map(n => ({
      id: n.id, type: n.type, side: n.side, round: n.round, index: n.index,
      playerName: n.playerName, state: n.state, parentIds: n.parentIds,
      childId: n.childId, badge: n.badge, autoBye: n.autoBye,
    })),
    championId: State.championId,
    phase: State.phase,
    undoStack: State.undoStack,
    music: { current: State.music.current },
    doubleElimActive: State.doubleElimActive,
    doubleElimResetDone: State.doubleElimResetDone,
  };
}

function saveState() {
  const data = getPersisted();
  try { localStorage.setItem(storageKey(), JSON.stringify(data)); } catch (e) {}
  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, lastUpdate: new Date().toISOString() }),
  }).catch(() => {});
}

function loadLocalState(source) {
  try {
    const raw = localStorage.getItem(storageKey(source));
    if (!raw) return;
    restoreState(JSON.parse(raw));
  } catch (e) {}
}

function loadStateFromServer() {
  return fetch(API_URL)
    .then(r => r.json())
    .then(data => {
      if (!data || !data.nodes || data.nodes.length === 0) return false;
      if (data.playerSource && data.playerSource !== State.playerSource) return false;
      restoreState(data);
      return true;
    })
    .catch(() => false);
}

function restoreState(data) {
  State.playerSource = data.playerSource || "player1";
  State.totalCount = data.totalCount || 8;
  State.n = data.n || 3;
  State.phase = data.phase || "playing";
  State.undoStack = data.undoStack || [];
  State.music.current = data.music?.current || null;
  State.doubleElimActive = data.doubleElimActive || false;
  State.doubleElimResetDone = data.doubleElimResetDone || false;

  State.nodes = (data.nodes || []).map(n => ({
    id: n.id, type: n.type, side: n.side, round: n.round, index: n.index,
    playerName: n.playerName, state: n.state, parentIds: n.parentIds || [],
    childId: n.childId, badge: n.badge, autoBye: n.autoBye,
    x: 0, y: 0,
  }));

  State.nodeById = {};
  State.nodes.forEach(n => { State.nodeById[n.id] = n; });
  State.championId = data.championId || null;

  document.getElementById("switch-player1-btn").classList.toggle("active", State.playerSource === "player1");
  document.getElementById("switch-player2-btn").classList.toggle("active", State.playerSource === "player2");
}
