/**
 * 体态传技 — 共享数据模块（P4 迁移，原 movement_without_hands_data.js 整体迁入）
 *
 * 由 game.js（游戏页）与 settings.js（设置页）共同 import，等价于原版两个页面
 * 都加载 movement_without_hands_data.js 的共享方式。
 * 保留 window.GameData 全局桥接（原版行为）：设置页旧代码经 window.GameData
 * 访问 loadSettings/saveSettings，记录模块经 RecordModule 解耦。
 *
 * P11-B6 迁移：
 *   · 进度/设置存档 → /web/lib/persist.mjs 的 createPersistence（双写 + server→local 恢复链）
 *     键与端点逐字保留：movement_without_hands_progress / /api/game_2_process（+ clear 端点）、
 *     movement_without_hands_settings / /api/game_2_settings。
 *   · 静默抽技 → /web/lib/random.mjs 的 pickOne（替代 Math.floor(Math.random()*n)）。
 *   · ctx.api 经 useGameDataApi(ctx.api) 由页面 init 注入（origin 相对路径、非 2xx 抛错）。
 */
import { createPersistence } from "/web/lib/persist.mjs";
import { pickOne } from "/web/lib/random.mjs";

/** ctx.api 注入位（页面 init 首行调用 useGameDataApi；未注入 → 远端跳过、仅本地读写，不崩） */
let apiRef = null;

/** 页面 init 注入内核 API 服务（ctx.api） */
export function useGameDataApi(api) {
  apiRef = api || null;
}

/** "服务端已应答即以其为准"（非 null/undefined 即算存档载荷）——迁移前 .then 分支语义 */
function serverAnswered(data) {
  return data !== null && data !== undefined;
}

/** 进度存档控制器（键/端点逐字保留） */
function progressStore() {
  return createPersistence({
    key: "movement_without_hands_progress",
    endpoint: "/api/game_2_process",
    clearEndpoint: "/api/clear-game_2_process",
    api: apiRef,
    isValid: serverAnswered,
  });
}

/** 设置存档控制器（键/端点逐字保留） */
function settingsStore() {
  return createPersistence({
    key: "movement_without_hands_settings",
    endpoint: "/api/game_2_settings",
    api: apiRef,
    isValid: serverAnswered,
  });
}

// 全局游戏数据对象
const GameData = window.GameData || {
  tricks: [], // 所有可用技能列表
  currentTrick: null, // 当前选中的技能
  isPlaying: false, // 游戏是否正在进行
  startTime: null, // 游戏开始时间
  endTime: null, // 游戏结束时间
  elapsedTime: 0, // 已经过的时间（秒）
  lastUpdate: null, // 最后更新时间
  stats: {
    totalGames: 0,
    totalTricks: 0,
  },
  settings: {
    beatsPerMinute: 120, // 默认BPM值
  },
};

// 确保GameData始终可用（原版桥接，保留）
window.GameData = GameData;

// 加载技能数据
async function loadTricks() {
  try {
    const response = await fetch("/resource/json/tricks_for_game.json");

    if (!response.ok) {
      throw new Error(`获取技能数据失败: ${response.status}`);
    }

    const data = await response.json();
    GameData.tricks = data;
    console.log(`成功加载 ${data.length} 个技能`);
    return data;
  } catch (error) {
    console.error("加载技能数据出错:", error);
    return [];
  }
}

// 加载当前游戏进度
async function loadGameProgress() {
  // 恢复链（persist 契约）：server → localStorage；两端都无 → null（"创建新游戏"）
  const { data, source } = await progressStore().load();

  if (source === "none") {
    console.log("无法从服务器加载游戏进度，创建新游戏");
    return null;
  }

  // 更新游戏数据
  GameData.currentTrick = data.currentTrick;
  GameData.isPlaying = data.isPlaying;
  GameData.startTime = data.startTime ? new Date(data.startTime) : null;
  GameData.endTime = data.endTime ? new Date(data.endTime) : null;
  GameData.elapsedTime = data.elapsedTime || 0;
  GameData.lastUpdate = data.lastUpdate ? new Date(data.lastUpdate) : null;

  // 加载设置
  if (data.settings) {
    GameData.settings = data.settings;
  }

  console.log(
    source === "server" ? "从服务器加载游戏进度:" : "从本地存储恢复游戏进度:",
    data
  );
  return data;
}

// 保存游戏进度
async function saveGameProgress() {
  const progressData = {
    currentTrick: GameData.currentTrick,
    isPlaying: GameData.isPlaying,
    startTime: GameData.startTime ? GameData.startTime.toISOString() : null,
    endTime: GameData.endTime ? GameData.endTime.toISOString() : null,
    elapsedTime: GameData.elapsedTime,
    settings: GameData.settings,
  };

  // 双写（persist 统一补 lastUpdate，等价于原 progressData.lastUpdate）
  const { local, remote } = await progressStore().save(progressData);

  // 迁移前语义：本地写失败或服务端非 2xx 均算失败（返回值调用方未消费，仅日志可见）
  const ok = apiRef ? local && remote : local;
  if (!ok) {
    console.error("保存游戏进度出错");
    return false;
  }

  console.log("游戏进度已保存");
  return true;
}

// 清除游戏进度
async function clearGameProgress() {
  // 清两端存档（POST /api/clear-game_2_process + 移除本地键）
  const { remote } = await progressStore().reset();

  if (apiRef && !remote) {
    console.error("清除游戏进度出错");
    return false;
  }

  // 重置游戏数据
  GameData.currentTrick = null;
  GameData.isPlaying = false;
  GameData.startTime = null;
  GameData.endTime = null;
  GameData.elapsedTime = 0;
  GameData.lastUpdate = null;

  console.log("游戏进度已清除");
  return true;
}

// 随机抽取一个技能（无闪现，用于初始化）
function drawRandomTrickSilent() {
  if (!GameData.tricks || GameData.tricks.length === 0) {
    console.error("没有可用的技能数据");
    return null;
  }

  // 等概率单抽（Fisher–Yates 基座；替代原 Math.floor(Math.random() * n)）
  const trick = pickOne(GameData.tricks);
  GameData.currentTrick = trick.name;
  return GameData.currentTrick;
}

// 随机抽取一个技能（带闪现效果，用于按钮点击）—— 依赖游戏页 DOM（#current-trick）、
// 闪现 interval 与 showToast，放归 game.js 页面闭包（原 data.js 内定义，仅游戏页调用）

// 保存游戏设置
GameData.saveSettings = async function (settings) {
  console.log("正在保存游戏设置...", settings);

  // 确保BPM是整数
  const settingsToSave = { ...settings };
  if (settingsToSave.beatsPerMinute) {
    settingsToSave.beatsPerMinute = parseInt(settingsToSave.beatsPerMinute, 10);
  }

  // 更新当前设置
  GameData.settings = { ...GameData.settings, ...settingsToSave };

  // 双写：先本地备份，后 POST /api/game_2_settings
  const { local, remote } = await settingsStore().save(settingsToSave);

  const ok = apiRef ? remote : local;
  if (ok) {
    console.log("设置已保存成功");
    return true;
  }

  // 迁移前：服务器失败仍保留本地备份（persist 的本地写已完成），返回值 false
  console.error("保存设置失败");
  return false;
};

// 加载游戏设置
GameData.loadSettings = async function () {
  console.log("正在加载游戏设置...");

  // 恢复链（persist 契约）：server → localStorage → 当前设置（默认值）
  const { data, source } = await settingsStore().load();

  if (source === "none") {
    console.log("加载设置失败");
    return GameData.settings; // 返回当前设置（可能是默认值）
  }

  // 更新当前设置
  GameData.settings = { ...GameData.settings, ...data };

  // 确保BPM是整数
  if (GameData.settings.beatsPerMinute) {
    GameData.settings.beatsPerMinute = parseInt(
      GameData.settings.beatsPerMinute,
      10
    );
  }

  console.log(
    source === "server" ? "从服务器加载的设置:" : "从本地存储恢复设置:",
    GameData.settings
  );
  return GameData.settings;
};

export {
  GameData,
  loadTricks,
  loadGameProgress,
  saveGameProgress,
  clearGameProgress,
  drawRandomTrickSilent,
};
