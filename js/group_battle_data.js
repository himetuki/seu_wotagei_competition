/**
 * 团体赛 - 第一大轮（初赛）
 * 数据加载 + 曲库管理
 */

function loadPlayers() {
  return Promise.all([
    fetch("../resource/json/player1.json").then((r) => r.json()),
    fetch("../resource/json/player2.json").then((r) => r.json()),
  ])
    .then(([oldData, newData]) => {
      GBState.oldPlayers = extractPlayerNames(oldData);
      GBState.newPlayers = extractPlayerNames(newData);
      GBState.allPlayers = [...GBState.oldPlayers, ...GBState.newPlayers];
      PlayerPools.oldSet = new Set(GBState.oldPlayers);
      PlayerPools.newSet = new Set(GBState.newPlayers);
      if (GBState.phase === "assigning" && GBState.unassigned.length === 0) {
        GBState.unassigned = [...GBState.allPlayers];
      }
      return true;
    })
    .catch((err) => {
      console.error(err);
      showToast("选手数据加载失败", "error");
      return false;
    });
}

function loadTricks() {
  return fetch("../resource/json/tricks.json")
    .then((r) => r.json())
    .then((data) => {
      GBState.trickPool = data.map((t) => t.name);
      return true;
    })
    .catch(() => {
      GBState.trickPool = [];
      return false;
    });
}

function loadMusic() {
  return Promise.all([
    fetch("../resource/json/musics_list.json")
      .then((r) => r.json())
      .catch(() => []),
    fetch("../resource/json/musics_list_2.json")
      .then((r) => r.json())
      .catch(() => []),
    fetch("../resource/json/musics_list_ex.json")
      .then((r) => r.json())
      .catch(() => []),
  ]).then(([plusList, newcomerList, exList]) => {
    GBState.musicListOld = plusList;
    GBState.musicListNew = newcomerList;
    GBState.musicListEx = exList;
    return true;
  });
}

function determineMusicLibrary() {
  // 第一大轮固定使用新人赛曲库，无需按成员类型判定。
}

function getCurrentMusicLibrary() {
  return GBState.musicListNew;
}

function getMusicLibName() {
  return "新人赛曲库";
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

function getMusicFolder() {
  return "1yearminus";
}
