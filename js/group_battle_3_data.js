/**
 * 团体赛 - 第三大轮（决赛）
 * 数据加载 + 第三轮构建 + 曲库管理
 */

function loadRound2Data() {
  return new Promise((resolve) => {
    const local = localStorage.getItem("groupBattleRound2");
    if (local) { try { GBState.round2Data = JSON.parse(local); resolve(); return; } catch (e) {} }
    fetch("http://localhost:3000/api/group-battle-process")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.currentState) {
          const gs = data.currentState.groups;
          const completed = data.currentState.bracket ? data.currentState.bracket.completedMatches : [];
          if (completed.length >= 2) {
            GBState.round2Data = { groups: gs, completedMatches: completed };
          }
        }
        resolve();
      })
      .catch(() => resolve());
  });
}

function setupRound3() {
  const r2 = GBState.round2Data;
  GBState.groups = r2.groups.map((g) => ({ ...g, eliminated: [], members: g.members }));
  Promise.all([
    fetch("../resource/json/player1.json").then((r) => r.json()),
    fetch("../resource/json/player2.json").then((r) => r.json()),
    fetch("../resource/json/musics_list_ex.json").then((r) => r.json()).catch(() => []),
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
