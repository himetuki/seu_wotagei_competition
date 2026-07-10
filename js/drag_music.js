/**
 * Drag式比赛 — 音乐抽取 & 比赛模式
 */

let musicRolling = null;
let lastDrawnMusic = null;
let lastDrawnMusicSource = null;
let battleActive = false;

/* =================================================================
 *  音乐抽取
 * ================================================================= */
function getTaggedMusicList() {
  const tagged = [];
  if (State.musicSource === "old") {
    (State.music.oldList || []).forEach(name => tagged.push({ name, source: "1yearplus" }));
  } else if (State.musicSource === "new") {
    (State.music.newList || []).forEach(name => tagged.push({ name, source: "1yearminus" }));
  } else if (State.musicSource === "ex") {
    (State.music.exList || []).forEach(name => tagged.push({ name, source: "1yearplus_ex" }));
  }
  return tagged;
}

function drawMusic() {
  const list = getTaggedMusicList();
  if (list.length === 0) {
    showHint("音乐列表为空");
    return;
  }

  const display = document.getElementById("music-display");
  const drawBtn = document.getElementById("draw-music-btn");
  const startBtn = document.getElementById("start-battle-btn");

  drawBtn.disabled = true;
  startBtn.disabled = true;
  display.classList.add("rolling");

  let ticks = 0;
  const TOTAL_TICKS = 40;
  let currentIdx = 0;
  const finalIdx = Math.floor(Math.random() * list.length);
  const finalItem = list[finalIdx];

  musicRolling = setInterval(() => {
    ticks++;
    if (ticks < TOTAL_TICKS) {
      currentIdx = (currentIdx + 1) % list.length;
      display.textContent = list[currentIdx].name;
    } else {
      clearInterval(musicRolling);
      musicRolling = null;
      lastDrawnMusic = finalItem.name;
      lastDrawnMusicSource = finalItem.source;
      display.textContent = lastDrawnMusic;
      display.classList.remove("rolling");
      display.classList.add("selected");
      drawBtn.disabled = false;
      startBtn.disabled = false;
    }
  }, 50);
}

/* =================================================================
 *  比赛模式
 * ================================================================= */
function startBattle() {
  if (!lastDrawnMusic) return;

  const folder = lastDrawnMusicSource || "1yearplus";
  const musicPath = "../resource/musics/" + folder + "/" + lastDrawnMusic;
  const player = document.getElementById("music-player");
  player.src = musicPath;
  player.play().catch(() => {});

  player.onended = () => {
    if (battleActive) exitBattle();
  };

  battleActive = true;
  document.body.classList.add("battle-mode");

  if (State.battleKeepBg) {
    document.body.classList.add("battle-keep-bg");
  }
}

function exitBattle() {
  const player = document.getElementById("music-player");
  player.pause();
  player.currentTime = 0;
  player.onended = null;

  battleActive = false;
  document.body.classList.remove("battle-mode");
  document.body.classList.remove("battle-keep-bg");

  const startBtn = document.getElementById("start-battle-btn");
  const drawBtn = document.getElementById("draw-music-btn");
  drawBtn.disabled = false;
  startBtn.disabled = !!lastDrawnMusic ? false : true;

  recomputeLayout();
  renderAll();
}

/* =================================================================
 *  音乐库切换
 * ================================================================= */
function switchMusicSource(source) {
  if (State.musicSource === source) return;
  State.musicSource = source;

  document.getElementById("switch-music-old-btn").classList.toggle("active", source === "old");
  document.getElementById("switch-music-new-btn").classList.toggle("active", source === "new");
  document.getElementById("switch-music-ex-btn").classList.toggle("active", source === "ex");

  lastDrawnMusic = null;
  lastDrawnMusicSource = null;
  const display = document.getElementById("music-display");
  display.textContent = "—";
  display.classList.remove("rolling", "selected");
  document.getElementById("start-battle-btn").disabled = true;

  showHint("已切换到" + (source === "old" ? "1year+" : source === "new" ? "1year-" : "1year+EX") + " 曲库");
}
