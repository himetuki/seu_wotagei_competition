/**
 * 一年内组比赛第二章节（battle-group2-2）— 页面 flow（P11-B3「积木拼装」迁移后）
 *
 * 分层（P11 §2.1）：本文件 = L4 页面专属 flow（选手轮转 + 确认弹窗、技名划线、抽取技名、
 * 清除缓存、数据加载与存档编排）。跨页同构能力已抽走，本文件不再各写一份：
 *   · 抽音乐闪现动画 + 播放 + 比赛模式 → 组件 component-draw-machine / component-music-player
 *     （注册名 "draw-machine" / "music-player"，装配见 front/plugin.js 与 web/front.json 的 compose）
 *   · 洗牌 / 随机抽取              → /web/lib/random.mjs（pickN / pickOne，Fisher–Yates）
 *   · 存档双写 / 恢复 / 重置        → /web/lib/persist.mjs（createPersistence + 历史 key 适配层）
 *
 * 有意行为变更（仅以下五类，其余逐行保留语义）：
 *   1. 洗牌由 `[...].sort(() => Math.random() - 0.5)`（有偏）改为 Fisher–Yates（等概率）——
 *      用户拍板统一修正（P11 §1.2 ③）。
 *   2. body 类名 `music-playing-mode` → `battle-mode`（组件规范类名，base.css 同步改名）。
 *   3. 点击提示文案「双击任意位置停止」→「单击任意位置停止」：手势本就是单击，仅文案对齐。
 *   4. 抽取音乐由「每次点击重新 fetch musics_list_2.json」改为**加载期一次性**（B 组缺陷 8）；
 *      宿主 audio 的 id 由 `#musicPlayer` 统一为连字符 `#music-player`（B 组缺陷 6）；
 *      删除播放前对 `/resource/music/`（缺 s 的死路径）的 HEAD 预检兜底（B 组缺陷 7）——
 *      播放失败统一由组件的 onError 承担。
 *   5. 覆写层时序与 battle-group1 统一（overlay textContent "BATTLE START"、textMs 100、
 *      readyMs 4500、hintMs 4500、hintText「单击任意位置停止」）——原为 "BATTLE MODE" / 3000ms
 *      且提示在动画期间即显示，四模块现取同一套（用户拍板"择一统一"）。
 *
 * 迁移前 → 迁移后 对照：
 *   drawRandomMusic（每次点击 fetch + 15×80ms 闪现 + 内联色）→ component-draw-machine（items 由加载期一次性提供）
 *   startMusicMode / stopMusicMode / handleDocumentClick / toggleMusicPlayback / handleMusicEnded
 *     （遮罩/逐字动画/3000ms 待播/单击退出/audio onended/HEAD 预检+死路径兜底） → component-music-player
 *   saveState / loadState / loadStateFromServer / clearCache → createPersistence（+ 5 键适配层）
 *   已删除死代码：clearMusic（HTML 无 #clearMusicButton，从不触发；且其 cloneNode 会替换
 *     组件持有的 audio 节点）、handleMusicEnded（音频 onended 归组件）、
 *     AppState 中仅被抽走实现读写的 isMusicPaused / isMusicPlaying
 *   （currentMusicFile 以**模块级变量 + 存档新字段**的形式回归：修复"恢复后 audio.src 缺扩展名"）
 *   自定义确认弹窗 showConfirmDialog（页面专属 UI，非比赛遮罩） → 原样保留
 *
 * 缺陷修复（本轮）：
 *   · 比赛模式抖动：接组件新增的 onOverlayShown 钩子，回到"进入模式即抖"的原时机（原来误挂在
 *     onStarted → 要等 readyMs=4500ms 才抖）。
 *   · 恢复路径 audio.src：新增存档字段 currentMusicFile（真实文件名，含扩展名）；
 *     有该字段时把曲目交回组件（刷新后可直接播放），老档仍按 B3 语义只还原展示文本。
 *   · 一次性定时器统一登记（timers 注册表 + later()，P12 起由 /web/lib/timers.mjs 承载），
 *     cleanup 清句柄并摘孤儿提示/弹窗节点。
 *
 * ★ 恢复链语义（与 battle-group2 相反，刻意保留）：本页**本地优先**——本地 5 键有缓存即用本地，
 *   本地无缓存才经 createPersistence 读服务端。localStorage key 与端点逐字保留。
 *
 * 组件降级：组件未注册/被 enabled:false 禁用时插槽留空，页面其余部分照常工作
 * （原内联实现已删除，不做"回退到旧实现"的双路径——双路径会让禁用开关形同虚设）。
 */

import { pickN, pickOne } from "/web/lib/random.mjs";
import { createPersistence } from "/web/lib/persist.mjs";
import { createTimerRegistry } from "/web/lib/timers.mjs";

/**
 * 历史 localStorage key（**逐字保留**，老存档兼容）——迁到 createPersistence 后由下面的
 * storage 适配层负责：1 个逻辑状态对象 ↔ 5 个历史 key（磁盘键名与值的字符串形态不变）。
 */
const CACHE_KEY = {
  PLAYERS: "battle_group2_2_players",
  CURRENT_INDEX: "battle_group2_2_current_index",
  CURRENT_TRICK: "battle_group2_2_current_trick",
  CURRENT_MUSIC: "battle_group2_2_current_music",
  CROSSED_TRICKS: "battle_group2_2_crossed_tricks",
  // 缺陷修复新增键（既有 5 键逐字不动）：真实音乐文件名（含扩展名）——
  // 原实现只存展示文本（`.mp3` 被 format 去掉）→ 恢复时拼出的 audio.src 缺扩展名 404。
  CURRENT_MUSIC_FILE: "battle_group2_2_current_music_file",
};

/** 逻辑状态键（仅 createPersistence 内部使用，不落盘；落盘键见 CACHE_KEY） */
const STATE_KEY = "battleGroup2-2State";

/** 安全 JSON 解析（损坏 → 兜底值，不抛错） */
function parseJSON(raw, fallback) {
  try {
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch (e) {
    console.warn("[battle-group2-2] 本地缓存解析失败，按空值处理:", e);
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
        // 新字段追加在既有字段之后（既有键名/值形态不动；老存档该键缺失 → ""）
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
 * 一年内组比赛界面 - 第二章节（核心模块）
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

// 全局状态
const AppState = {
  players: [],
  tricks: [],
  currentPlayerIndex: 0,
  originalPlayers: [],
  // 音乐列表（加载期一次性读取 musics_list_2.json；抽取/播放组件经 componentProps 取用）
  musicList: [],
};

/** 页面级 AbortSignal（组件入口写入；动态生成的列表项监听经它登记，重渲染统一解绑） */
let bindSignal = null;
/** 划线恢复的延迟补写定时器 */
let restoreCrossTimer = null;
/** 一次性收尾定时器（toast 自动移除、弹窗淡入、抖动移除）——
 * P12 起经 /web/lib/timers.mjs 注册表统一登记（替代原 pageTimers + later() 样板） */
const timers = createTimerRegistry();
/** 登记一次性定时器（cleanup 统一清理，避免 teardown 后回调仍在飞；别名保调用点零改动） */
const later = (fn, ms) => timers.later(fn, ms);
/** 当前音乐的真实文件名（含扩展名；抽到/恢复时写入，随存档持久化，见 getPersisted） */
let currentMusicFile = "";
/** 持久化控制器（组件入口创建：需要 ctx.api） */
let persist = null;
/** 本地存储适配层实例（local-first 读取用） */
let legacyStorage = null;
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
 * 本页迁移前只有"BATTLE START 文字抖动"（没有 body 抖动），时机 = 逐字动画走完的那一刻：
 * 原实现为 1100ms（"BATTLE MODE" 11 字 × 100ms）；文案统一为 "BATTLE START"（12 字）后取 1200ms。
 */
function shakeBattleOverlay({ text } = {}) {
  clearBattleShake();
  if (!text) return;
  later(() => {
    text.classList.add("shake");
    later(() => text.classList.remove("shake"), 500);
  }, 1200);
}

/**
 * 一年内组比赛界面 - 第二章节（UI模块）
 * 处理UI更新和交互
 */

// 更新选手列表
function updatePlayerList() {
  DOM.playerList.innerHTML = "";
  AppState.players.forEach((player, index) => {
    const li = document.createElement("li");
    li.textContent = player.name;
    // 添加CSS变量来控制动画延迟
    li.style.setProperty("--player-index", index);
    if (index === AppState.currentPlayerIndex) {
      li.classList.add("current");
    }
    DOM.playerList.appendChild(li);
  });
}

// 更新技名列表
function updateTrickList() {
  if (!AppState.tricks || AppState.tricks.length === 0) return;

  DOM.trickList.innerHTML = "";
  AppState.tricks.forEach((trick, index) => {
    const li = document.createElement("li");
    li.textContent = trick.name;
    // 添加CSS变量来控制动画延迟
    li.style.setProperty("--item-index", index);
    // 动态节点监听经页面 signal 登记，重渲染统一解绑
    li.addEventListener(
      "click",
      () => {
        li.classList.toggle("crossed");
        saveState();
      },
      { signal: bindSignal }
    );
    DOM.trickList.appendChild(li);
  });
}

// 显示提示信息 - 修改为顶部显示
function showToast(message, type = "info", duration = 3000) {
  // 先移除任何现有的提示
  hideToast();

  // 创建提示元素
  const toast = document.createElement("div");
  toast.classList.add("toast", `${type}-toast`);
  toast.id = "app-toast";
  toast.innerText = message;
  document.body.appendChild(toast);

  // 自动移除提示（除非是loading类型）——句柄登记：cleanup 清定时器并摘掉孤儿 toast 节点
  if (type !== "loading" && duration > 0) {
    later(hideToast, duration);
  }

  return toast;
}

// 隐藏提示信息
function hideToast() {
  const existingToast = document.getElementById("app-toast");
  if (existingToast && document.body.contains(existingToast)) {
    document.body.removeChild(existingToast);
  }
}

// 进入下一位选手
function goToNextPlayer() {
  if (AppState.players.length === 0) return;

  // 检查是否为最后一个选手
  if (AppState.currentPlayerIndex === AppState.players.length - 1) {
    // 如果是最后一位选手，显示自定义确认弹窗
    showConfirmDialog(
      "已到达最后一位选手，是否返回第一位选手?",
      () => {
        // 确认回调
        AppState.currentPlayerIndex = 0;
        DOM.currentPlayer.textContent =
          AppState.players[AppState.currentPlayerIndex].name;
        updatePlayerList();
        saveState();
      },
      () => {
        // 取消回调
        showToast("已到最后一位选手", "info");
      }
    );
  } else {
    // 常规的下一位选手
    AppState.currentPlayerIndex =
      (AppState.currentPlayerIndex + 1) % AppState.players.length;
    DOM.currentPlayer.textContent =
      AppState.players[AppState.currentPlayerIndex].name;
    updatePlayerList();
    saveState();
  }
}

// 显示自定义确认对话框
function showConfirmDialog(message, onConfirm, onCancel) {
  // 移除可能已存在的对话框
  const existingDialog = document.querySelector(".custom-dialog-container");
  if (existingDialog) {
    document.body.removeChild(existingDialog);
  }

  // 创建遮罩
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  // 创建对话框容器
  const dialogContainer = document.createElement("div");
  dialogContainer.className = "custom-dialog-container";

  // 创建对话框内容
  const dialog = document.createElement("div");
  dialog.className = "custom-dialog golden-glow floating";

  // 添加内容
  const content = document.createElement("p");
  content.textContent = message;
  dialog.appendChild(content);

  // 添加按钮容器
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "dialog-buttons";

  // 确认按钮
  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "确认";
  confirmBtn.className = "dialog-btn confirm-btn";
  confirmBtn.addEventListener("click", function (event) {
    event.stopPropagation(); // 防止事件冒泡
    document.body.removeChild(dialogContainer);
    if (onConfirm) onConfirm();
  });

  // 取消按钮
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "取消";
  cancelBtn.className = "dialog-btn cancel-btn";
  cancelBtn.addEventListener("click", function (event) {
    event.stopPropagation(); // 防止事件冒泡
    document.body.removeChild(dialogContainer);
    if (onCancel) onCancel();
  });

  // 组装对话框
  buttonContainer.appendChild(confirmBtn);
  buttonContainer.appendChild(cancelBtn);
  dialog.appendChild(buttonContainer);
  dialogContainer.appendChild(overlay);
  dialogContainer.appendChild(dialog);

  // 添加点击事件处理
  dialog.addEventListener("click", (e) => {
    e.stopPropagation(); // 防止点击对话框关闭对话框
  });

  overlay.addEventListener("click", (e) => {
    e.stopPropagation(); // 不处理遮罩点击
  });

  // 添加到页面
  document.body.appendChild(dialogContainer);

  // 淡入效果（句柄登记：cleanup 清定时器；同时兜底摘掉可能残留的弹窗容器）
  later(() => {
    dialogContainer.classList.add("show");
    dialog.classList.add("show");
  }, 10);
}

// 随机排序选手
function shufflePlayers() {
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
  if (!AppState.tricks || AppState.tricks.length === 0) {
    showToast("技名数据未加载，请稍后再试", "error");
    return;
  }

  // 获取未划线的技名
  const availableTricks = Array.from(DOM.trickList.children)
    .filter((li) => !li.classList.contains("crossed"))
    .map((li) => li.textContent);

  if (availableTricks.length === 0) {
    showToast("所有技名都已划线，请重置技名", "warning");
    return;
  }

  // 等概率单抽（/web/lib/random.mjs 的 pickOne 替换 Math.floor(Math.random()*n) 手写式）
  const randomTrick = pickOne(availableTricks);
  DOM.currentTrick.textContent = randomTrick;

  // 注意：这里不再自动标记为已使用，让用户手动标记
  // 仅显示抽取结果

  saveState();
  showToast(`已抽取技名: ${randomTrick}`, "success");
}

/**
 * 一年内组比赛界面 - 上半场（数据模块）
 * 处理数据加载和状态管理
 */

// 加载所有数据
function loadData() {
  loadPlayerData();
  loadTrickData();
  loadMusicList();
}

// 加载音乐列表（B3 终审 [P0] 修复：迁移时只删掉了"每次点击 fetch"的旧实现，
// 加载期这一步漏写，导致 AppState.musicList 恒为 undefined → 抽取音乐静默走
// draw-machine 的 onEmpty 分支（无动画/无结果）。此处补回，语义与 battle-group2
// 一致：加载期一次性读取，抽取时不再重复请求。）
function loadMusicList() {
  fetch("/resource/json/musics_list_2.json")
    .then((response) => {
      if (!response.ok) throw new Error("无法加载musics_list_2.json");
      return response.json();
    })
    .then((data) => {
      AppState.musicList = Array.isArray(data) ? data : [];
    })
    .catch((error) => {
      console.warn("[battle-group2-2] 加载音乐列表失败，将使用空列表:", error);
      AppState.musicList = [];
      showToast("无法加载音乐列表，将使用默认数据", "warning");
    });
}

// 加载选手数据
function loadPlayerData() {
  fetch("/resource/json/player2.json")
    .then((response) => {
      if (!response.ok) throw new Error("无法加载player2.json");
      return response.json();
    })
    .then((data) => {
      // 保存原始选手列表
      AppState.originalPlayers = Array.isArray(data) ? [...data] : [];

      // 尝试加载保存的状态（本地优先；本地同步命中时先于下面的兜底填充生效）
      loadState();

      // 如果玩家列表为空，则使用原始数据
      if (AppState.players.length === 0) {
        AppState.players = [...AppState.originalPlayers];
        updatePlayerList();
        if (AppState.players.length > 0) {
          DOM.currentPlayer.textContent = AppState.players[0].name;
        }
      }
    })
    .catch((error) => {
      // 容错统一：降级为"沿用上次可用列表"并继续，不再中止
      console.warn("[battle-group2-2] 加载player2.json失败，将使用默认数据:", error);
      showToast("无法加载选手数据，将使用默认数据", "warning");
      AppState.players = [...AppState.originalPlayers];
      updatePlayerList();
    });
}

// 加载技名数据 - 修改为使用tricks.json
function loadTrickData() {
  fetch("/resource/json/tricks.json")
    .then((response) => {
      if (!response.ok) throw new Error("技名数据加载失败");
      return response.json();
    })
    .then((data) => {
      AppState.tricks = Array.isArray(data) ? data : [];
      updateTrickList();
    })
    .catch((error) => {
      console.warn("[battle-group2-2] 加载tricks.json失败，将使用空列表:", error);
      AppState.tricks = [];
      showToast("无法加载技名数据，将使用默认数据", "warning");
    });
}

/** 存档载荷（原 saveState 的 stateData 字面量；字段与顺序逐字保留，`currentMusicFile` 为**追加**字段） */
function getPersisted() {
  return {
    players: AppState.players,
    currentIndex: AppState.currentPlayerIndex,
    currentTrick: DOM.currentTrick ? DOM.currentTrick.textContent : "",
    currentMusic: DOM.currentMusic ? DOM.currentMusic.textContent : "",
    crossedTricks: DOM.trickList
      ? Array.from(DOM.trickList.children)
          .filter((li) => li.classList.contains("crossed"))
          .map((li) => li.textContent)
      : [],
    // 新增：真实文件名（含扩展名）。currentMusic 是展示文本（.mp3 被 format 去掉），
    // 恢复时若只拿它拼 audio.src 会 404；老存档无此字段 → ""（沿用旧的展示文本行为）。
    currentMusicFile: currentMusicFile || "",
  };
}

// 保存状态到本地文件和浏览器缓存（双写：5 个历史 key + POST；失败不打断页面）
function saveState() {
  if (!persist) return;
  persist.save(getPersisted());
}

/** persist 失败上报（迁移前为 console.error） */
function handlePersistError(error, phase) {
  if (phase === "save:remote" || phase === "save:local") {
    console.error("保存到服务器失败:", error);
  } else {
    console.warn("[battle-group2-2] 存档读写失败:", phase, error);
  }
}

/**
 * 从本地和服务器加载状态（★ 本地优先，与 battle-group2 相反，刻意保留）
 *   本地 5 键有缓存 → 同步用本地（先于 loadPlayerData 的兜底填充）
 *   本地无缓存       → 经 createPersistence 读服务端（/api/battle-group2-2-process 逐字保留）
 */
function loadState() {
  const local = readLocalState();
  if (local) {
    restoreFromState(local, "local");
    console.log("比赛状态已从本地恢复");
    return Promise.resolve();
  }
  return persist.load().then(({ data, source }) => {
    if (source === "server") {
      console.log("成功从服务器加载状态:", data);
      restoreFromState(data, "server");
    }
  });
}

/** 本地缓存（经适配层重建的 5 键对象）；无缓存 → null */
function readLocalState() {
  const raw = legacyStorage ? legacyStorage.getItem() : null;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[battle-group2-2] 本地缓存解析失败，改为读取服务端:", e);
    return null;
  }
}

// 从状态对象恢复（服务端 / 本地同形；source 区分两者，保留迁移前的判定差异）
function restoreFromState(data, source = "server") {
  if (!data) return false;

  try {
    // 恢复选手列表：本地路径有键即用（与迁移前 restoreFromLocalStorage 一致）；
    // 服务端路径仅在非空时覆盖（与迁移前 loadStateFromServer 一致，空列表不冲掉兜底值）
    const hasPlayers =
      Array.isArray(data.players) &&
      (source === "local" || data.players.length > 0);
    if (hasPlayers) {
      AppState.players = data.players;
      updatePlayerList();
    }

    // 恢复当前选手索引
    if (
      typeof data.currentIndex === "number" &&
      !isNaN(data.currentIndex) &&
      data.currentIndex >= 0 &&
      AppState.players.length > 0 &&
      data.currentIndex < AppState.players.length
    ) {
      AppState.currentPlayerIndex = data.currentIndex;
      DOM.currentPlayer.textContent =
        AppState.players[AppState.currentPlayerIndex].name;
    }

    // 恢复当前技名
    if (data.currentTrick && DOM.currentTrick) {
      DOM.currentTrick.textContent = data.currentTrick;
    }

    // 恢复当前音乐（只还原展示文本；播放状态归 music-player 组件）
    // B3 终审 [P2] 修复：存档里的 currentMusic 是 #currentMusic 的展示文本，抽音乐前
    // 也可能是初始占位「抽取音乐」。迁移版曾把它 setItem 回组件当成"已抽到的曲目"，
    // 导致刷新后未抽取就能点播放并误入比赛模式（HEAD 不会）。此处与 HEAD 对齐：
    // 仅还原展示，不写回组件内部 current（点播放仍按未抽取处理，提示「请先抽取音乐」）。
    if (data.currentMusic && DOM.currentMusic) {
      DOM.currentMusic.textContent = data.currentMusic;
    }
    // ★ 缺陷修复：存档带"真实文件名"（含扩展名，新档才有）时把曲目交回组件 ——
    //   刷新后点播放即可出声（preloadOnDraw=false，src 在 start() 时按 current 拼装）。
    //   老档无该字段 → 保持上面的既有语义（只还原展示、点播放按未抽取处理），
    //   B3 终审 [P2] 防的"占位文案误进比赛模式"不受影响（占位期没有真实文件名）。
    currentMusicFile =
      typeof data.currentMusicFile === "string" ? data.currentMusicFile : "";
    if (currentMusicFile && apis.music) {
      apis.music.setItem(currentMusicFile);
    }

    // 恢复已划线的技名
    if (data.crossedTricks && Array.isArray(data.crossedTricks) && data.crossedTricks.length > 0) {
      updateTrickList();
      // 将保存的已划线技能标记为划线（句柄登记，cleanup 清理）
      if (restoreCrossTimer) clearTimeout(restoreCrossTimer);
      restoreCrossTimer = setTimeout(() => {
        restoreCrossTimer = null;
        if (!DOM.trickList) return;
        Array.from(DOM.trickList.children).forEach((li) => {
          if (data.crossedTricks.includes(li.textContent)) {
            li.classList.add("crossed");
          }
        });
      }, 100);
    }

    return true;
  } catch (error) {
    console.error("恢复进度数据失败:", error);
    return false;
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
    showToast("正在初始化比赛数据...", "loading");

    // 清除浏览器缓存（5 个历史 key，由 storage 适配层统一清除）
    persist
      .reset() // 本模块无独立 clear 端点：仅清本地，服务端由下一步覆写为初始态
      .then(() => fetch("/resource/json/player2.json"))
      .then((response) => {
        if (!response.ok) throw new Error("无法加载选手数据");
        return response.json();
      })
      .then((data) => {
        const originalPlayerList = Array.isArray(data) ? data : [];

        // 准备默认的初始化数据 - 只保留选手列表，其他置空
        const defaultData = {
          players: originalPlayerList,
          currentIndex: 0,
          currentTrick: "",
          currentMusic: "",
          crossedTricks: [],
        };

        // 清除并初始化服务器缓存
        return persist.save(defaultData).then(() => originalPlayerList);
      })
      .then((originalPlayerList) => {
        console.log("服务器数据已重置为初始状态");

        // 重置页面上的显示内容
        if (originalPlayerList.length > 0) {
          AppState.players = [...originalPlayerList];
          updatePlayerList();
          AppState.currentPlayerIndex = 0;
          DOM.currentPlayer.textContent = AppState.players[0].name;
        }

        // 重置其他显示（音乐展示/播放状态归 music-player 组件）
        if (DOM.currentTrick) {
          DOM.currentTrick.textContent = "";
        }
        if (DOM.currentMusic) {
          DOM.currentMusic.textContent = "";
        }
        currentMusicFile = "";
        if (apis.music) apis.music.clearItem();

        // 移除加载提示
        hideToast();

        // 显示成功提示
        showToast("比赛数据已初始化", "success", 2000);

        // 更新技名列表，清除所有交叉状态
        updateTrickList();
      })
      .catch((error) => {
        console.error("初始化服务器数据失败:", error);

        // 移除加载提示并显示错误
        hideToast();
        showToast("初始化服务器数据失败: " + error.message, "error", 3000);
      });
  } catch (error) {
    console.error("清除缓存失败:", error);
    showToast("清除缓存失败: " + error.message, "error", 3000);
  }
}

/**
 * 一年内组比赛界面 - 第二章节（事件模块）
 * 管理事件监听器
 */

// 设置所有事件监听器
function setupEventListeners(signal) {
  // 随机排序选手
  if (DOM.shuffleButton) {
    DOM.shuffleButton.addEventListener("click", shufflePlayers, { signal });
  }

  // 抽取技名：本页 HTML 未启用（#drawTrickButton 已注释），保留原死代码分支注释状态
  // 抽取音乐 / 播放音乐按钮由组件绑定（draw-machine 的 trigger / music-player 的 startTrigger），
  // 页面侧不再重复绑定，避免单击双跑

  // 下一个选手
  if (DOM.nextPlayerButton) {
    DOM.nextPlayerButton.addEventListener("click", goToNextPlayer, { signal });
  }

  // 清除缓存
  if (DOM.clearCacheButton) {
    DOM.clearCacheButton.addEventListener("click", clearCache, { signal });
  }

  // 返回主页
  if (DOM.homeButton) {
    DOM.homeButton.addEventListener("click", () => {
      saveState();
      window.location.href = "/m/home";
    }, { signal });
  }

  // 添加离开页面前保存
  window.addEventListener("beforeunload", saveState, { signal });

  // 宿主 audio 的显示由组件的 battle-mode 样式负责（原实现为 setupEventListeners 末尾
  // `DOM.musicPlayer.style.display = "none"`，现由 base.css 的 `audio { display:none }` 承担）
}

/* =================================================================
 *  组件装配（P11-B3）：页面侧只声明"运行时 props"，
 *  静态 props（时序/颜色/文案/曲库）在 web/front.json 的 battle-group2-2 config.components
 * ================================================================= */

/**
 * 运行时 props 工厂（front/plugin.js 挂载组件时取用）。
 * 分工（两个组件的按钮归属刻意不重叠）：
 *   draw-machine  : 接管 #drawMusicButton 的闪现动画（保留 #fbbf24/#10b981 内联色）
 *   music-player  : 接管 #playMusicButton（播放/比赛模式/退出）
 *   串联          : draw 定格 → bridge.music.setItem(item)（同步展示；本页不预载 src）
 */
export function componentProps(bridge) {
  return {
    "music-player": {
      items: () => AppState.musicList,
      display: "#currentMusic",
      trigger: null, // 显式钉空：抽取归 draw-machine，组件不自建默认按钮
      startTrigger: "#playMusicButton",
      // 展示名去 .mp3 后缀（迁移前 flashMusic/恢复路径 replace(/\.mp3$/, "") 的同款行为；
      // setItem 恢复真实文件名时 paint 经此格式化，否则屏显带扩展名）
      format: (item) => String(item).replace(/\.mp3$/, ""),
      onReady: (api) => {
        bridge.music = api;
      },
      // 未抽到音乐即点播放（迁移前 toggleMusicPlayback 的提示文案逐字保留）
      onEmpty: () => showToast("请先抽取音乐", "warning"),
      // 比赛模式抖动：组件在"进入模式、遮罩显示、逐字动画开始前"回调 ——
      // 本页迁移前只有 BATTLE START 文字抖动（时机 = 逐字动画走完），而非真正开播的 4500ms
      onOverlayShown: shakeBattleOverlay,
      // 迁移前 stopMusicMode 还原按钮文案（原实现在开播时不改文案，此处保持一致）
      onExited: () => {
        if (DOM.playMusicButton) DOM.playMusicButton.textContent = "播放音乐";
      },
      // 迁移前 HEAD 预检失败的提示语义由组件的 onError 承担（死路径 /resource/music/ 已删除）
      onError: () =>
        showToast(`音乐无法播放: ${DOM.currentMusic ? DOM.currentMusic.textContent : ""}`, "error"),
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
        // 展示与播放状态归组件；本页 preloadOnDraw=false（与迁移前"不预加载"一致）。
        // item 是真实文件名，单独记进 currentMusicFile 随存档落盘（展示名可能已丢后缀）。
        currentMusicFile = String(item);
        if (bridge.music) bridge.music.setItem(item);
        DOM.playMusicButton.textContent = "播放音乐";
        saveState();
        showToast(`已抽取音乐: ${displayName}`, "success");
      },
    },
  };
}

/* =================================================================
 *  组件入口（原 b-g2-2-core.js DOMContentLoaded 初始化，kernel render 时执行）
 * ================================================================= */
export function battleGroup22Component(el, meta, ctx, bridge) {
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
  legacyStorage = createLegacyStorage();
  persist = createPersistence({
    key: STATE_KEY,
    storage: legacyStorage,
    endpoint: "/api/battle-group2-2-process",
    api: ctx && ctx.api ? ctx.api : null,
    isValid: (data) => !!data && typeof data === "object" && !Array.isArray(data),
    now: () => undefined,
    onError: handlePersistError,
  });

  console.log("初始化一年内组比赛界面 - 第二章节");

  // 加载数据
  loadData();

  // 设置事件监听器
  setupEventListeners(signal);

  return () => cleanupBattleGroup22Page(bindAbort);
}

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用；组件实例的 cleanup 由 front/plugin.js 收集后调用）
 * ================================================================= */
function cleanupBattleGroup22Page(bindAbort) {
  // signal 登记的静态骨架监听（按钮/动态列表项/window beforeunload）统一解绑
  if (bindAbort) bindAbort.abort();
  bindSignal = null;

  // 划线恢复的延迟补写定时器
  if (restoreCrossTimer) {
    clearTimeout(restoreCrossTimer);
    restoreCrossTimer = null;
  }

  // 一次性收尾定时器（toast 自动移除、弹窗淡入、抖动移除）：清空在飞任务，
  // 否则 teardown 后回调仍在飞、提示/弹窗节点会永久留在 body
  timers.dispose();
  clearBattleShake();
  hideToast();
  for (const node of document.querySelectorAll(".custom-dialog-container")) {
    node.remove();
  }

  // 音乐播放/比赛模式的清理（body 类、document 级监听、#music-player 的 onended/暂停）
  // 由 music-player 组件的 cleanup 负责（front/plugin.js 收集后逐个调用），页面侧不再重复。
}
