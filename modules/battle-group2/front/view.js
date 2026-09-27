/**
 * 一年内组比赛（battle-group2）— 页面 flow（P11-B3「积木拼装」迁移后）
 *
 * 分层（P11 §2.1）：本文件 = L4 页面专属 flow（选手轮转、技名划线、抽取技名、下一位、
 * 清除缓存、数据加载与存档编排）。跨页同构能力已抽走，本文件不再各写一份：
 *   · 抽音乐闪现动画 + 播放 + 比赛模式 → 组件 component-draw-machine / component-music-player
 *     （注册名 "draw-machine" / "music-player"，装配见 front/plugin.js 与 web/front.json 的 compose）
 *   · 洗牌 / 随机抽取              → /web/lib/random.mjs（pickN / pickOne，Fisher–Yates）
 *   · 存档双写 / 恢复 / 重置        → /web/lib/persist.mjs（createPersistence + 历史 key 适配层）
 *
 * 有意行为变更（仅以下五类，其余逐行保留语义）：
 *   1. 洗牌由 `[...].sort(() => Math.random() - 0.5)`（有偏）改为 Fisher–Yates（等概率）——
 *      用户拍板统一修正（P11 §1.2 ③）。
 *   2. body 类名 `music-playing-mode` → `battle-mode`（组件规范类名，style.css 同步改名）。
 *   3. 点击提示文案「双击任意位置停止」→「单击任意位置停止」：手势本就是单击，仅文案对齐。
 *   4. 抽取音乐由「每次点击重新 fetch musics_list_2.json」改为**加载期一次性**（B 组缺陷 8）；
 *      宿主 audio 的 id 由 `#musicPlayer` 统一为连字符 `#music-player`（B 组缺陷 6）。
 *   5. 选手/技名/音乐数据加载容错统一：任何一级失败都降级并继续，绝不 throw / alert 阻塞
 *      （原实现 player2.json 失败会 `alert()` 阻塞页面）。
 *
 * 迁移前 → 迁移后 对照：
 *   drawRandomMusic（每次点击 fetch + 15×80ms 闪现 + 内联色）→ component-draw-machine（items 由加载期一次性提供）
 *   startMusicMode / stopMusicMode / stopMusicOnClick / handlePlayMusic
 *     （遮罩/逐字动画/4500ms 待播/单击退出/audio onended/按钮文案切换） → component-music-player
 *     （按钮文案切换经 onStarted / onExited 回调补回，视觉与时序对齐）
 *   saveState / loadState / restoreFromData / restoreFromLocalStorage / clearCache → createPersistence
 *   已删除死代码：AppState 中仅被抽走实现读写的 isMusicPaused / isMusicPlaying
 *   （currentMusicFile 以**模块级变量 + 存档新字段**的形式回归：修复"恢复后 audio.src 缺扩展名"）
 *
 * 缺陷修复（本轮）：
 *   · 比赛模式抖动：接组件新增的 onOverlayShown 钩子，回到"进入模式即抖"的原时机（原来误挂在
 *     onStarted → 要等 readyMs=4500ms 才抖）。
 *   · 恢复路径 audio.src：新增存档字段 currentMusicFile（真实文件名，含扩展名），
 *     恢复时优先喂给组件；展示文本仍读既有 currentMusic 字段（老档不受影响）。
 *   · 一次性定时器统一登记（timers 注册表 + later()，P12 起由 /web/lib/timers.mjs 承载），
 *     cleanup 清句柄并摘孤儿提示节点。
 *
 * 组件降级：组件未注册/被 enabled:false 禁用时插槽留空，页面其余部分照常工作
 * （原内联实现已删除，不做"回退到旧实现"的双路径——双路径会让禁用开关形同虚设）。
 */

import { pickN, pickOne } from "/web/lib/random.mjs";
import { createPersistence } from "/web/lib/persist.mjs";
import { createTimerRegistry } from "/web/lib/timers.mjs";

/**
 * 历史 localStorage key（**逐字保留**，老存档兼容）——迁到 createPersistence 后由下面的
 * storage 适配层负责：1 个逻辑状态对象 ↔ 5 个历史 key。这与"抽 persist.mjs 后 key 必须逐字保留"
 * 的契约（P11 §5.3 陷阱 5）一致：磁盘上的键名、值的字符串形态都与迁移前完全相同。
 */
const CACHE_KEY = {
  PLAYERS: "battle_group2_players",
  CURRENT_INDEX: "battle_group2_current_index",
  CURRENT_TRICK: "battle_group2_current_trick",
  CURRENT_MUSIC: "battle_group2_current_music",
  CROSSED_TRICKS: "battle_group2_crossed_tricks",
  // 缺陷修复新增键（既有 5 键逐字不动）：真实音乐文件名（含扩展名）。
  // 原实现只存展示文本（`.mp3` 后缀被 format 去掉）→ 恢复时拼出的 audio.src 缺扩展名 404。
  CURRENT_MUSIC_FILE: "battle_group2_current_music_file",
};

/** 逻辑状态键（仅 createPersistence 内部使用，不落盘；落盘键见 CACHE_KEY） */
const STATE_KEY = "battleGroup2State";

/** 安全 JSON 解析（损坏 → 兜底值，不抛错） */
function parseJSON(raw, fallback) {
  try {
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch (e) {
    console.warn("[battle-group2] 本地缓存解析失败，按空值处理:", e);
    return fallback;
  }
}

/**
 * Storage 适配层：把 createPersistence 的单键读写映射到 5 个历史 key。
 * getItem 重建 { players, currentIndex, currentTrick, currentMusic, crossedTricks }；
 * setItem 把同一形状拆回 5 个 key（字符串形态与迁移前逐字一致）。
 */
function createLegacyStorage() {
  return {
    getItem() {
      const rawPlayers = localStorage.getItem(CACHE_KEY.PLAYERS);
      if (rawPlayers === null) return null; // 无任何历史缓存 → 视为无存档
      const rawIndex = localStorage.getItem(CACHE_KEY.CURRENT_INDEX);
      return JSON.stringify({
        players: parseJSON(rawPlayers, []),
        currentIndex: rawIndex === null ? 0 : parseInt(rawIndex, 10),
        currentTrick: localStorage.getItem(CACHE_KEY.CURRENT_TRICK) || "",
        currentMusic: localStorage.getItem(CACHE_KEY.CURRENT_MUSIC) || "",
        crossedTricks: parseJSON(localStorage.getItem(CACHE_KEY.CROSSED_TRICKS), []),
        // 新字段追加在既有字段之后（不改变既有键名/值的形态；老存档该键缺失 → ""）
        currentMusicFile: localStorage.getItem(CACHE_KEY.CURRENT_MUSIC_FILE) || "",
      });
    },
    setItem(_key, value) {
      const state = JSON.parse(value);
      localStorage.setItem(CACHE_KEY.PLAYERS, JSON.stringify(state.players || []));
      localStorage.setItem(CACHE_KEY.CURRENT_INDEX, String(state.currentIndex ?? 0));
      localStorage.setItem(CACHE_KEY.CURRENT_TRICK, state.currentTrick || "");
      localStorage.setItem(CACHE_KEY.CURRENT_MUSIC, state.currentMusic || "");
      localStorage.setItem(CACHE_KEY.CROSSED_TRICKS, JSON.stringify(state.crossedTricks || []));
      localStorage.setItem(CACHE_KEY.CURRENT_MUSIC_FILE, state.currentMusicFile || "");
    },
    removeItem() {
      for (const key of Object.values(CACHE_KEY)) localStorage.removeItem(key);
    },
  };
}

/**
 * 一年内组比赛界面 - 上半场（核心模块）
 * 包含全局变量和基本初始化
 */

// 全局DOM元素引用（宿主 audio 由 music-player 组件按 id 取用，页面不再直接持有）
const DOM = {
  playerList: document.getElementById("playerList"),
  trickList: document.getElementById("trickList"),
  currentPlayer: document.getElementById("currentPlayer"),
  currentTrick: document.getElementById("currentTrick"),
  currentMusic: document.getElementById("currentMusic"),
  nextPlayerButton: document.getElementById("nextPlayerButton"),
  playMusicButton: document.getElementById("playMusicButton"),
  shuffleButton: document.getElementById("shuffleButton"),
  drawTrickButton: document.getElementById("drawTrickButton"),
  drawMusicButton: document.getElementById("drawMusicButton"),
  clearCacheButton: document.getElementById("clearCacheButton"),
  homeButton: document.getElementById("homeButton"),
};

const FEATURE_TOGGLE_KEYS = {
  group2DrawTrick: "feature_group2_draw_trick_enabled",
};

// 全局状态
const AppState = {
  players: [],
  tricks: [],
  currentPlayerIndex: 0,
  originalPlayers: [],
};

/** 页面级 AbortSignal（组件入口写入；动态生成的列表项监听经它登记，重渲染统一解绑） */
let bindSignal = null;
/** 存档恢复后的划线补写定时器 */
let restoreCrossTimer = null;
/** 技名列表重建后的划线补写定时器 */
let trickRestoreTimer = null;
/** 一次性收尾定时器（toast 自动移除、技名高亮移除、抖动移除）——
 * P12 起经 /web/lib/timers.mjs 注册表统一登记（替代原 pageTimers + later() 样板） */
const timers = createTimerRegistry();
/** 登记一次性定时器（cleanup 统一清理，避免 teardown 后回调仍在飞；别名保调用点零改动） */
const later = (fn, ms) => timers.later(fn, ms);
/** 当前音乐的真实文件名（含扩展名；抽到/恢复时写入，随存档持久化，见 getPersisted） */
let currentMusicFile = "";
/** 持久化控制器（组件入口创建：需要 ctx.api） */
let persist = null;
/** 组件实例 API 桥 */
let apis = { music: null, draw: null };

/**
 * 抖动兜底清理：摘除 .shake 类（body + 遮罩文字节点）。
 * 组件复用同一批遮罩节点，残留的 .shake 会顶掉下一次的 battle-start-animation 入场动画；
 * 未到期的抖动定时器句柄由 timers 注册表统一清理（见 cleanup）。
 */
function clearBattleShake() {
  if (document.body) document.body.classList.remove("shake");
  document
    .querySelectorAll(".battle-start.shake")
    .forEach((node) => node.classList.remove("shake"));
}

/**
 * 比赛模式抖动（组件 onOverlayShown 钩子：进入模式、遮罩显示、逐字动画开始前触发）。
 * 迁移前 startMusicMode 的两个时机逐字保留：
 *   · body 加 .shake（进入模式 50ms 后），500ms 后移除 → 整屏抖动
 *   · BATTLE START 文字在逐字动画走完（1300ms）时加 .shake，抖动一次
 */
function shakeBattleOverlay({ text } = {}) {
  clearBattleShake();
  later(() => {
    document.body.classList.add("shake");
    later(() => document.body.classList.remove("shake"), 500);
  }, 50);
  if (!text) return;
  later(() => {
    text.classList.add("shake");
    later(() => text.classList.remove("shake"), 500);
  }, 1300);
}

function applyFeatureToggles() {
  const drawTrickEnabled =
    localStorage.getItem(FEATURE_TOGGLE_KEYS.group2DrawTrick) !== "false";

  if (DOM.drawTrickButton) {
    DOM.drawTrickButton.style.display = drawTrickEnabled ? "" : "none";
  }

  if (DOM.currentTrick) {
    DOM.currentTrick.style.display = drawTrickEnabled ? "" : "none";
  }
}

/**
 * 一年内组比赛界面 - 上半场（数据模块）
 * 处理数据加载和状态管理
 */

// 加载所有数据
function loadData() {
  // 读取选手数据
  fetch("/resource/json/player2.json")
    .then((response) => {
      if (!response.ok) throw new Error("无法加载player2.json");
      return response.json();
    })
    .then((data) => {
      console.log("从player2.json加载选手数据:", data);
      // 保存原始选手列表
      AppState.originalPlayers = Array.isArray(data) ? [...data] : [];

      // 先用原始数据兜底填充（迁移前 loadState 的异步恢复晚于此处的同步填充生效，
      // 顺序保持"先兜底、后恢复"，恢复结果会覆盖兜底值）
      if (AppState.players.length === 0) {
        AppState.players = [...AppState.originalPlayers];
        updatePlayerList();
        if (AppState.players.length > 0) {
          DOM.currentPlayer.textContent = AppState.players[0].name;
        }
      }

      // 尝试加载保存的状态
      return loadState();
    })
    .catch((error) => {
      // 容错统一：不再 alert() 阻塞页面，降级为"沿用上次可用列表"并继续
      console.warn("[battle-group2] 加载player2.json失败，将使用默认数据:", error);
      showToast("无法加载选手数据，将使用默认数据", "warning");
      AppState.players = [...AppState.originalPlayers];
      updatePlayerList();
    });

  // 读取技名数据
  fetch("/resource/json/tricks_for_group2.json")
    .then((response) => {
      if (!response.ok) throw new Error("技名数据加载失败");
      return response.json();
    })
    .then((data) => {
      AppState.tricks = Array.isArray(data) ? data : [];
      updateTrickList();
    })
    .catch((error) => {
      console.warn("[battle-group2] 加载技名数据失败，将使用空列表:", error);
      AppState.tricks = [];
      showToast("无法加载技名数据，将使用默认数据", "warning");
    });

  // 读取音乐列表数据 - 从musics_list_2.json加载（加载期一次性；抽取时不再重复 fetch）
  fetch("/resource/json/musics_list_2.json")
    .then((response) => {
      if (!response.ok) throw new Error("无法加载musics_list_2.json");
      return response.json();
    })
    .then((data) => {
      console.log("从musics_list_2.json加载音乐数据:", data);
      AppState.musicList = Array.isArray(data) ? data : [];
    })
    .catch((error) => {
      console.warn("[battle-group2] 加载音乐列表失败，将使用空列表:", error);
      AppState.musicList = [];
      showToast("无法加载音乐列表，将使用默认数据", "warning");
    });
}

/** 存档载荷（原 saveState 的 stateData 字面量；字段与顺序逐字保留，`currentMusicFile` 为**追加**字段） */
function getPersisted() {
  return {
    players: AppState.players,
    currentIndex: AppState.currentPlayerIndex,
    currentTrick: DOM.currentTrick.textContent,
    currentMusic: DOM.currentMusic.textContent,
    crossedTricks: Array.from(DOM.trickList.children)
      .filter((li) => li.classList.contains("crossed"))
      .map((li) => li.textContent),
    // 新增：真实文件名（含扩展名）。currentMusic 是展示文本（.mp3 被 format 去掉），
    // 恢复时若只拿它拼 audio.src 会 404；老存档无此字段 → ""（沿用旧的展示文本行为）。
    currentMusicFile: currentMusicFile || "",
  };
}

// 保存状态到本地文件和浏览器缓存（双写：5 个历史 key + POST；失败不打断页面）
function saveState() {
  if (!persist) return;
  persist.save(getPersisted()).then(({ remote }) => {
    if (remote) console.log("比赛状态已保存到服务器");
    console.log("比赛状态已保存到本地");
  });
}

/** persist 失败上报（迁移前为 console.error，无 toast） */
function handlePersistError(error, phase) {
  if (phase === "save:remote") {
    console.error("服务器保存失败:", error);
  } else if (phase === "save:local") {
    console.error("保存状态失败:", error);
  } else {
    console.warn("[battle-group2] 存档读写失败:", phase, error);
  }
}

/**
 * 恢复存档（P11-B3：createPersistence 的 server → local 链，等价于迁移前的
 * `/resource/json/battle-group2-process.json` → `.catch` 回退 5 个 localStorage key）。
 * 服务端与本地经适配层后是同形对象，共用一份恢复映射。
 */
async function loadState() {
  const { data, source } = await persist.load();
  if (source === "server") {
    console.log("成功从服务器加载进度:", data);
    restoreFromState(data);
  } else if (source === "local") {
    restoreFromState(data);
    console.log("比赛状态已从本地恢复");
  }
}

// 从状态对象恢复（服务端 / 本地同形）
function restoreFromState(data) {
  if (!data) return false;

  try {
    // 恢复玩家列表
    if (Array.isArray(data.players) && data.players.length > 0) {
      AppState.players = data.players;
      updatePlayerList();
    }

    // 恢复当前索引
    if (
      typeof data.currentIndex === "number" &&
      !isNaN(data.currentIndex) &&
      data.currentIndex >= 0 &&
      data.currentIndex < AppState.players.length
    ) {
      AppState.currentPlayerIndex = data.currentIndex;
      DOM.currentPlayer.textContent =
        AppState.players[AppState.currentPlayerIndex].name;
    }

    // 恢复当前技能
    if (data.currentTrick) {
      DOM.currentTrick.textContent = data.currentTrick;
    }

    // 恢复当前音乐（播放状态归 music-player 组件：setItem 同步展示并预载 audio.src）
    // ★ 缺陷修复：优先用存档里的**真实文件名**（含扩展名）喂组件；老存档没有该字段时
    //   沿用旧行为（拿展示文本当曲目名，与迁移前逐字一致，不破坏老档）。
    if (data.currentMusic) {
      DOM.currentMusic.textContent = data.currentMusic;
      currentMusicFile =
        typeof data.currentMusicFile === "string" && data.currentMusicFile
          ? data.currentMusicFile
          : "";
      if (apis.music) {
        apis.music.setItem(currentMusicFile || data.currentMusic);
      }
    } else {
      currentMusicFile = ""; // 无曲目 → 不把上一份存档的文件名继续带下去
    }

    // 恢复划掉的技能（延迟执行，确保技名列表已加载；句柄登记，cleanup 清理）
    if (data.crossedTricks && data.crossedTricks.length > 0) {
      if (restoreCrossTimer) clearTimeout(restoreCrossTimer);
      restoreCrossTimer = setTimeout(() => {
        restoreCrossTimer = null;
        restoreCrossedTricks(data.crossedTricks);
      }, 500);
    }

    return true;
  } catch (error) {
    console.error("恢复进度数据失败:", error);
    return false;
  }
}

// 恢复被画叉的技名
function restoreCrossedTricks(crossedTricks) {
  try {
    if (!crossedTricks) return;
    if (crossedTricks.length > 0) {
      Array.from(DOM.trickList.children).forEach((li) => {
        if (crossedTricks.includes(li.textContent)) {
          li.classList.add("crossed");
        }
      });
    }
  } catch (error) {
    console.error("恢复技名状态失败:", error);
  }
}

// 清除缓存并初始化数据
function clearCache() {
  try {
    // 先确认用户真的要清除
    if (!confirm("确定要清除所有缓存数据吗？此操作将重置所有比赛进度。")) {
      return;
    }

    // 显示进度提示
    const loadingMsg = document.createElement("div");
    loadingMsg.classList.add("loading-toast");
    loadingMsg.innerText = "正在初始化比赛数据...";
    document.body.appendChild(loadingMsg);

    // 清除浏览器缓存（5 个历史 key，由 storage 适配层统一清除）
    // → 取原始选手数据 → 用初始数据覆写服务器（等价于迁移前的 POST defaultData）
    persist
      .reset() // 本模块无独立 clear 端点：仅清本地，服务端由下一步覆写为初始态
      .then(() => fetch("/resource/json/player2.json"))
      .then((response) => {
        if (!response.ok) throw new Error("无法加载选手数据");
        return response.json();
      })
      .then((data) => {
        // 准备默认的初始化数据 - 只保留选手列表，其他置空
        const defaultData = {
          players: Array.isArray(data) ? data : [],
          currentIndex: 0,
          currentTrick: "",
          currentMusic: "",
          crossedTricks: [],
        };
        return persist.save(defaultData);
      })
      .then(() => {
        console.log("服务器数据已重置为初始状态");

        // 重置页面上的显示内容
        if (AppState.originalPlayers.length > 0) {
          AppState.players = [...AppState.originalPlayers];
          AppState.currentPlayerIndex = 0;
          DOM.currentPlayer.textContent = AppState.players[0].name;
          updatePlayerList();
        }

        // 重置其他显示（音乐展示/播放状态归 music-player 组件）
        DOM.currentTrick.textContent = "";
        DOM.currentMusic.textContent = "";
        currentMusicFile = "";
        if (apis.music) apis.music.clearItem();

        // 移除加载提示
        if (document.body.contains(loadingMsg)) {
          document.body.removeChild(loadingMsg);
        }

        // 显示成功提示
        showToast("比赛数据已初始化", "success");

        // 更新技名列表，清除所有交叉状态
        updateTrickList();
      })
      .catch((error) => {
        console.error("初始化服务器数据失败:", error);

        // 移除加载提示
        if (document.body.contains(loadingMsg)) {
          document.body.removeChild(loadingMsg);
        }

        // 显示错误提示
        showToast("初始化服务器数据失败: " + error.message, "error");
      });
  } catch (error) {
    console.error("清除缓存失败:", error);
    showToast("清除缓存失败: " + error.message, "error");
  }
}

/**
 * 一年内组比赛界面 - 上半场（UI模块）
 * 处理UI更新和交互
 */

// 更新选手列表
function updatePlayerList() {
  DOM.playerList.innerHTML = "";
  AppState.players.forEach((player, index) => {
    const li = document.createElement("li");
    li.textContent = player.name;
    // 添加动画延迟变量
    li.style.setProperty("--player-index", index);
    // 为当前选手添加高亮样式
    if (index === AppState.currentPlayerIndex) {
      li.classList.add("current");
    }
    DOM.playerList.appendChild(li);
  });
}

// 更新技名列表
function updateTrickList() {
  DOM.trickList.innerHTML = "";
  AppState.tricks.forEach((trick, index) => {
    const li = document.createElement("li");
    li.textContent = trick.name;
    // 添加动画延迟变量
    li.style.setProperty("--trick-index", index);
    // 添加浮动动画效果（动态节点监听经页面 signal 登记）
    li.addEventListener(
      "click",
      () => {
        li.classList.toggle("crossed");
        saveState(); // 保存技名状态
      },
      { signal: bindSignal }
    );
    DOM.trickList.appendChild(li);
  });

  // 技名列表更新后，尝试恢复被画叉的技名（句柄登记，cleanup 清理）
  if (trickRestoreTimer) clearTimeout(trickRestoreTimer);
  trickRestoreTimer = setTimeout(() => {
    trickRestoreTimer = null;
    restoreCrossedTricks(parseJSON(localStorage.getItem(CACHE_KEY.CROSSED_TRICKS), []));
  }, 100);
}

// 显示提示信息
function showToast(message, type = "info", duration = 3000) {
  const toast = document.createElement("div");
  toast.classList.add(`${type}-toast`);
  toast.innerText = message;
  document.body.appendChild(toast);

  // 自动移除（句柄登记：cleanup 清定时器并摘掉孤儿 toast 节点）
  later(() => {
    if (document.body.contains(toast)) {
      document.body.removeChild(toast);
    }
  }, duration);
}

// 随机排序选手
function shufflePlayers() {
  // 容错：选手列表为空时不再任由 `players[0].name` 抛 TypeError（与 battle-group2-2 同款守卫）
  if (AppState.players.length === 0) {
    showToast("没有可排序的选手", "warning");
    return;
  }

  // ★ 有意变更：原 `[...].sort(() => Math.random() - 0.5)` 是有偏洗牌，
  //   改为 /web/lib/random.mjs 的 Fisher–Yates 等概率洗牌（用户拍板统一修正）。
  AppState.players = pickN(AppState.players, AppState.players.length);
  AppState.currentPlayerIndex = 0;
  DOM.currentPlayer.textContent = AppState.players[0].name;
  updatePlayerList();
  saveState();

  showToast("选手已随机排序", "success");
}

// 抽取技名
function drawRandomTrick() {
  if (localStorage.getItem("feature_group2_draw_trick_enabled") === "false") {
    showToast("抽取动作功能已在设置页关闭", "info");
    return;
  }

  const availableTricks = Array.from(DOM.trickList.children).filter(
    (li) => !li.classList.contains("crossed")
  );

  if (availableTricks.length === 0) {
    showToast("没有可用的技名", "warning");
    return;
  }

  // 等概率单抽（/web/lib/random.mjs 的 pickOne 替换 Math.floor(Math.random()*n) 手写式）
  const randomTrick = pickOne(availableTricks);
  DOM.currentTrick.textContent = randomTrick.textContent;
  saveState();

  // 添加视觉反馈
  randomTrick.classList.add("highlight");
  later(() => {
    randomTrick.classList.remove("highlight");
  }, 1000);
}

// 进入下一位选手
function goToNextPlayer() {
  AppState.currentPlayerIndex++;
  if (AppState.currentPlayerIndex < AppState.players.length) {
    DOM.currentPlayer.textContent =
      AppState.players[AppState.currentPlayerIndex].name;
    updatePlayerList();
    saveState();
  } else {
    // 如果已经是最后一个选手，提供进入排名页面的选项
    DOM.nextPlayerButton.textContent = "进入排名页面";
    DOM.nextPlayerButton.removeEventListener("click", goToNextPlayer);
    DOM.nextPlayerButton.addEventListener(
      "click",
      () => {
        window.location.href = "/m/ranking";
      },
      { signal: bindSignal }
    );
  }
}

/**
 * 一年内组比赛界面 - 上半场（事件模块）
 * 处理事件监听和回调
 */

// 设置事件监听器
function setupEventListeners(signal) {
  // 随机排序选手按钮
  DOM.shuffleButton.addEventListener("click", shufflePlayers, { signal });

  // 抽取技名按钮
  DOM.drawTrickButton.addEventListener("click", drawRandomTrick, { signal });

  // 抽取音乐 / 播放音乐按钮由组件绑定（draw-machine 的 trigger / music-player 的 startTrigger），
  // 页面侧不再重复绑定，避免单击双跑

  // 下一位选手按钮
  DOM.nextPlayerButton.addEventListener("click", goToNextPlayer, { signal });

  // 返回主页按钮
  DOM.homeButton.addEventListener("click", () => {
    saveState(); // 保存状态
    window.location.href = "index.html";
  }, { signal });

  // 清除缓存按钮
  DOM.clearCacheButton.addEventListener("click", clearCache, { signal });
}

/* =================================================================
 *  组件装配（P11-B3）：页面侧只声明"运行时 props"，
 *  静态 props（时序/颜色/文案）在 web/front.json 的 battle-group2 config.components
 * ================================================================= */

/**
 * 运行时 props 工厂（front/plugin.js 挂载组件时取用）。
 * 分工（两个组件的按钮归属刻意不重叠）：
 *   draw-machine  : 接管 #drawMusicButton 的闪现动画（保留 #fbbf24/#10b981 内联色）
 *   music-player  : 接管 #playMusicButton（播放/比赛模式/退出），并负责按钮文案切换
 *   串联          : draw 定格 → bridge.music.setItem(item)（同步展示 + 预载 audio.src）
 */
export function componentProps(bridge) {
  return {
    "music-player": {
      items: () => AppState.musicList,
      display: "#currentMusic",
      startTrigger: "#playMusicButton",
      // 展示名去 .mp3 后缀（迁移前 flashMusic/恢复路径 replace(/\.mp3$/, "") 的同款行为；
      // setItem 恢复真实文件名时 paint 经此格式化，否则屏显带扩展名）
      format: (item) => String(item).replace(/\.mp3$/, ""),
      onReady: (api) => {
        bridge.music = api;
      },
      // 未抽到音乐即点播放（迁移前 handlePlayMusic 的提示文案逐字保留）
      onEmpty: () => showToast("请先抽取音乐", "warning"),
      // 比赛模式抖动：组件在"进入模式、遮罩显示、逐字动画开始前"回调 ——
      // 迁移前抖动发生在进入模式瞬间（body）与逐字动画走完时（文字），而非真正开播的 4500ms
      onOverlayShown: shakeBattleOverlay,
      // 迁移前 startMusicMode 在真正开播时把按钮改成「停止播放音乐」
      onStarted: () => {
        if (DOM.playMusicButton) DOM.playMusicButton.textContent = "停止播放音乐";
      },
      // 迁移前 stopMusicMode 还原按钮文案
      onExited: () => {
        if (DOM.playMusicButton) DOM.playMusicButton.textContent = "播放音乐";
      },
      // 迁移前 playCurrentMusic 的失败提示
      onError: () => showToast("音乐播放失败，请重试", "error"),
    },
    "draw-machine": {
      items: () => AppState.musicList,
      display: "#currentMusic",
      trigger: "#drawMusicButton",
      // 迁移前 `flashMusic.replace(/\.mp3$/, "")`（展示名去 .mp3 后缀）
      format: (item) => String(item).replace(/\.mp3$/, ""),
      onReady: (api) => {
        bridge.draw = api;
      },
      onEmpty: () => showToast("音乐列表为空", "error"),
      onResult: (item) => {
        const displayName = String(item).replace(/\.mp3$/, "");
        // 确保音乐文件路径正确（曲库目录经组件的 folder prop 提供）；item 是真实文件名，
        // 单独记进 currentMusicFile 随存档落盘（展示名可能已丢后缀，不能拿来拼路径）
        currentMusicFile = String(item);
        if (bridge.music) bridge.music.setItem(item);
        saveState();
        showToast(`已选择音乐: ${displayName}`, "success");
      },
    },
  };
}

/* =================================================================
 *  组件入口（原 b-g2-core.js DOMContentLoaded 初始化，kernel render 时执行）
 * ================================================================= */
export function battleGroup2Component(el, meta, ctx, bridge) {
  // cleanup 契约：静态骨架节点与动态列表项的监听经 signal 登记，重渲染时 abort 统一解绑，
  // 防止不刷新页面的重复 render 造成双绑双触发
  const bindAbort = new AbortController();
  const { signal } = bindAbort;
  bindSignal = signal;

  // 组件实例 API（front/plugin.js 的 onReady 回填；组件缺失时保持 null）
  apis = bridge || { music: null, draw: null };

  // 存档控制器（真实落盘仍是 5 个历史 key；POST 体与迁移前逐字一致——
  // now() 返回 undefined 使 createPersistence 的 { ...data, lastUpdate } 经 JSON.stringify
  // 省略 lastUpdate 键，落库键集与迁移前完全相同）
  persist = createPersistence({
    key: STATE_KEY,
    storage: createLegacyStorage(),
    endpoint: "/api/battle-group2-process",
    api: ctx && ctx.api ? ctx.api : null,
    // ★ 空壳不算存档：db.define 的默认值 { players: [], … } GET 恒 200，若判为有效会压过
    //   本地 5 键缓存（迁移前 /resource/json/*.json 恒 404 → 实际总是本地恢复），
    //   下次 saveState 会把本地进度覆写为空壳。players 非空才算有进度；空壳 → 回退本地。
    isValid: (data) =>
      !!data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      Array.isArray(data.players) &&
      data.players.length > 0,
    now: () => undefined,
    onError: handlePersistError,
  });

  console.log("初始化一年内组比赛界面");

  // 应用功能开关
  applyFeatureToggles();

  // 加载数据
  loadData();

  // 设置事件监听器
  setupEventListeners(signal);

  // 添加离开页面前保存
  window.addEventListener("beforeunload", () => {
    saveState();
  }, { signal });

  return () => cleanupBattleGroup2Page(bindAbort);
}

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用；组件实例的 cleanup 由 front/plugin.js 收集后调用）
 * ================================================================= */
function cleanupBattleGroup2Page(bindAbort) {
  // signal 登记的静态骨架监听（按钮/动态列表项/window beforeunload）统一解绑
  if (bindAbort) bindAbort.abort();
  bindSignal = null;

  // 划线补写定时器
  if (restoreCrossTimer) {
    clearTimeout(restoreCrossTimer);
    restoreCrossTimer = null;
  }
  if (trickRestoreTimer) {
    clearTimeout(trickRestoreTimer);
    trickRestoreTimer = null;
  }

  // 一次性收尾定时器（toast 自动移除、技名高亮移除、抖动移除）：清空在飞任务，
  // 否则 teardown 后回调仍在飞、提示节点会永久留在 body
  timers.dispose();
  clearBattleShake();
  for (const node of document.querySelectorAll(
    ".loading-toast, .info-toast, .success-toast, .warning-toast, .error-toast"
  )) {
    node.remove();
  }

  // 音乐播放/比赛模式的清理（body 类、document 级监听、#music-player 的 onended/暂停）
  // 由 music-player 组件的 cleanup 负责（front/plugin.js 收集后逐个调用），页面侧不再重复。
}
