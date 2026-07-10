/**
 * 团体赛 - 第二大轮（胜者组/败者组）
 * 数据加载 + 第二轮构建 + 曲库管理
 */

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
    fetch("http://localhost:3000/api/group-battle-process")
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
    fetch("../resource/json/player1.json").then((r) => r.json()),
    fetch("../resource/json/player2.json").then((r) => r.json()),
    fetch("../resource/json/musics_list.json")
      .then((r) => r.json())
      .catch(() => []),
    fetch("../resource/json/musics_list_2.json")
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
