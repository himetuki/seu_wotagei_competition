/**
 * modules/music-draw 前端插件（P4 插件化迁移，原 music_draw.js 逻辑整体迁入）
 *
 * 契约：原生 ESM，不 import 内核；apply 阶段只 register（key = 模块 id "music-draw"）；
 * DOM 操作统一发生在 component 被调用时（kernel 装配完成后 render，DOM 早已就绪，
 * 原 DOMContentLoaded 包裹随之去除）。函数体逐行保留，适配点：
 *   - 顶层 state/DOM → 组件闭包外模块级变量（原脚本全局变量，单页面单实例语义不变）
 *   - 静态骨架/document 监听一律 { signal } 登记（AbortController），cleanup 统一 abort
 *   - 抽取闪现 interval / BATTLE START 打字 interval / 两处 setTimeout → 闭包变量跟踪，
 *     cleanup 清除（原 battleStartTimer 声明未用，此处真正用于 4.5s 定时器）
 *   - audio（#music-player）onended/播放状态进 cleanup：pause + 归零 + 摘除 onended
 * 旧 music_draw.js 保留磁盘、不再加载；行为与迁移前逐字一致。
 */

/* =================================================================
 *  全局状态（原 music_draw.js 顶层）
 * ================================================================= */
import { icon } from "/web/icons.mjs";

const state = {
  musicLists: {
    "1yearminus": [],
    "1yearplus": [],
    "1yearplus-ex": [],
  },
  drawnMusic: {
    "1yearminus": null,
    "1yearplus": null,
    "1yearplus-ex": null,
  },
  isPlaying: false,
  isLoaded: false,
};

const DOM = {};

/* 运行态定时器跟踪（cleanup 清除；原文件内为局部 const，此处提出以便统一回收） */
let flashTimer = null;
let battleTextTimer = null;
let clickToStopTimer = null;
let battleStartTimer = null;

export default {
  name: "music-draw-front",
  inject: ["ui"],
  apply(ctx) {
    ctx.ui.register({ key: "music-draw", component: musicDrawComponent });
  },
};

/* =================================================================
 *  组件入口（原 DOMContentLoaded 初始化，kernel render 时执行）
 * ================================================================= */
function musicDrawComponent() {
  // cleanup 契约：静态骨架全部监听经 signal 登记，重渲染时 abort 统一解绑，
  // 防止不刷新页面的重复 render 造成双绑双触发
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

  cacheDOM();
  loadMusicLists();
  bindEvents(signal);

  return () => cleanupMusicDrawPage(bindAbort);
}

function cacheDOM() {
  DOM.musicPlayer = document.getElementById("music-player");
  DOM.battleStartOverlay = document.getElementById("battle-start-overlay");
  DOM.battleStartText = document.getElementById("battle-start-text");
  DOM.clickToStop = document.getElementById("click-to-stop");

  // 1yearminus
  DOM.draw1yearminusBtn = document.getElementById("draw-1yearminus-btn");
  DOM.battle1yearminusBtn = document.getElementById("battle-1yearminus-btn");
  DOM.musicInfo1yearminus = document.getElementById("music-info-1yearminus");

  // 1yearplus
  DOM.draw1yearplusBtn = document.getElementById("draw-1yearplus-btn");
  DOM.battle1yearplusBtn = document.getElementById("battle-1yearplus-btn");
  DOM.musicInfo1yearplus = document.getElementById("music-info-1yearplus");

  // 1yearplus-ex
  DOM.draw1yearplusExBtn = document.getElementById("draw-1yearplus-ex-btn");
  DOM.battle1yearplusExBtn = document.getElementById("battle-1yearplus-ex-btn");
  DOM.musicInfo1yearplusEx = document.getElementById("music-info-1yearplus-ex");

  DOM.homeBtn = document.getElementById("home-btn");

  // 静态骨架图标：h1 标题两侧装饰音符（原 HTML 内 emoji → Tabler SVG）
  const title = document.querySelector("header h1");
  if (title) {
    title.innerHTML =
      `${icon("music", { size: 34 })} 直接抽取音乐 ${icon("music", { size: 34 })}`;
  }
}

function loadMusicLists() {
  console.log("开始加载音乐列表...");

  Promise.all([
    fetch("/resource/json/musics_list.json")
      .then((r) => {
        console.log("musics_list.json 状态:", r.status);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("加载 musics_list.json 失败:", err);
        return [];
      }),
    fetch("/resource/json/musics_list_2.json")
      .then((r) => {
        console.log("musics_list_2.json 状态:", r.status);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("加载 musics_list_2.json 失败:", err);
        return [];
      }),
    fetch("/resource/json/musics_list_ex.json")
      .then((r) => {
        console.log("musics_list_ex.json 状态:", r.status);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("加载 musics_list_ex.json 失败:", err);
        return [];
      }),
    ])
    .then(([list1, list2, list3]) => {
      // mapping:
      // musics_list.json -> 1yearplus
      // musics_list_2.json -> 1yearminus
      // musics_list_ex.json -> 1yearplus_ex
      state.musicLists["1yearminus"] = list2;
      state.musicLists["1yearplus"] = list1;
      state.musicLists["1yearplus-ex"] = list3;
      state.isLoaded = true;

      console.log("音乐列表加载完成:");
      console.log("- 1yearminus:", list2.length, "首");
      console.log("- 1yearplus:", list1.length, "首");
      console.log("- 1yearplus-ex:", list3.length, "首");
      console.log("完整数据:", state.musicLists);

      if (list1.length === 0 && list2.length === 0 && list3.length === 0) {
        showToast("警告：所有音乐列表为空", "warning");
      } else {
        showToast("音乐列表加载成功", "success");
      }
    })
    .catch((err) => {
      console.error("加载音乐列表失败:", err);
      showToast("音乐列表加载失败", "error");
    });
}

function bindEvents(signal) {
  // 抽取音乐按钮
  DOM.draw1yearminusBtn.addEventListener("click", () =>
    drawMusic("1yearminus"), { signal });
  DOM.draw1yearplusBtn.addEventListener("click", () => drawMusic("1yearplus"), { signal });
  DOM.draw1yearplusExBtn.addEventListener("click", () =>
    drawMusic("1yearplus-ex"), { signal });

  // 比赛开始按钮
  DOM.battle1yearminusBtn.addEventListener("click", () =>
    startBattle("1yearminus"), { signal });
  DOM.battle1yearplusBtn.addEventListener("click", () =>
    startBattle("1yearplus"), { signal });
  DOM.battle1yearplusExBtn.addEventListener("click", () =>
    startBattle("1yearplus-ex"), { signal });

  // 回到主页
  DOM.homeBtn.addEventListener("click", () => {
    window.location.href = "/m/home";
  }, { signal });

  // 双击退出播放
  document.addEventListener("dblclick", handleDoubleClick, { signal });
}

function drawMusic(library) {
  console.log("抽取音乐:", library);
  console.log("当前音乐列表:", state.musicLists);

  const list = state.musicLists[library];
  console.log("选中列表:", list);

  if (!list || list.length === 0) {
    showToast("音乐列表为空，请等待加载完成", "error");
    console.error("音乐列表为空:", library);
    return;
  }

  const infoElement = getMusicInfoElement(library);
  const battleBtn = getBattleButton(library);

  // 禁用抽取按钮，防止重复点击
  const drawBtn = getDrawButton(library);
  if (drawBtn) drawBtn.disabled = true;

  // 闪现效果参数
  const flashCount = 15; // 闪现次数
  const flashInterval = 80; // 闪现间隔（毫秒）
  let currentFlash = 0;

  // 闪现动画
  flashTimer = setInterval(() => {
    // 随机选择一个音乐显示
    const randomIdx = Math.floor(Math.random() * list.length);
    const flashMusic = list[randomIdx];

    if (infoElement) {
      infoElement.textContent = flashMusic;
      infoElement.style.color = "#fbbf24"; // 闪现时为黄色
    }

    currentFlash++;

    // 最后一次闪现，确定最终结果
    if (currentFlash >= flashCount) {
      clearInterval(flashTimer);
      flashTimer = null;

      // 最终随机选择
      const finalIdx = Math.floor(Math.random() * list.length);
      const finalMusic = list[finalIdx];
      state.drawnMusic[library] = finalMusic;

      console.log("抽取到的音乐:", finalMusic);

      // 更新最终显示
      if (infoElement) {
        infoElement.textContent = finalMusic;
        infoElement.style.color = "#10b981"; // 最终结果为绿色
      }

      // 启用按钮
      if (battleBtn) {
        battleBtn.disabled = false;
      }
      if (drawBtn) {
        drawBtn.disabled = false;
      }

      showToast(`已抽取音乐：${finalMusic}`, "success");
    }
  }, flashInterval);
}

function getDrawButton(library) {
  switch (library) {
    case "1yearminus":
      return DOM.draw1yearminusBtn;
    case "1yearplus":
      return DOM.draw1yearplusBtn;
    case "1yearplus-ex":
      return DOM.draw1yearplusExBtn;
    default:
      return null;
  }
}

function startBattle(library) {
  const music = state.drawnMusic[library];
  if (!music) {
    showToast("请先抽取音乐", "warning");
    return;
  }

  // 设置音乐路径
  const pathMap = {
    "1yearminus": "/resource/musics/1yearminus/",
    "1yearplus": "/resource/musics/1yearplus/",
    "1yearplus-ex": "/resource/musics/1yearplus_ex/",
  };

  DOM.musicPlayer.src = pathMap[library] + music;

  // 显示 Battle Start 动画
  document.body.classList.add("battle-mode");
  DOM.battleStartOverlay.classList.remove("hidden");
  DOM.battleStartText.classList.remove("hidden");

  // 播放动画文字
  const text = "BATTLE START";
  let current = "",
    i = 0;
  battleTextTimer = setInterval(() => {
    if (i < text.length) {
      current += text[i];
      DOM.battleStartText.textContent = current;
      i++;
    } else {
      clearInterval(battleTextTimer);
      battleTextTimer = null;
    }
  }, 130);

  clickToStopTimer = setTimeout(() => {
    DOM.clickToStop.classList.remove("hidden");
  }, 1500);

  // 4.5秒后开始播放音乐
  battleStartTimer = setTimeout(() => {
    endBattleStart();
  }, 4500);
}

function endBattleStart() {
  if (!document.body.classList.contains("battle-mode")) return;

  // 隐藏动画元素，但保持 battle-mode 以显示背景
  DOM.battleStartOverlay.classList.add("hidden");
  DOM.battleStartText.classList.add("hidden");
  DOM.clickToStop.classList.add("hidden");
  DOM.battleStartText.textContent = "";

  // 播放音乐
  if (DOM.musicPlayer.src) {
    DOM.musicPlayer.play().catch((err) => {
      console.error("音乐播放失败:", err);
      showToast("音乐播放失败", "error");
    });
    state.isPlaying = true;
    showToast("双击屏幕退出播放", "info");

    // 监听音乐播放完毕事件
    DOM.musicPlayer.onended = () => {
      console.log("音乐播放完毕");
      stopPlaying();
    };
  }
}

function stopPlaying() {
  if (!state.isPlaying) return;

  DOM.musicPlayer.pause();
  DOM.musicPlayer.currentTime = 0;
  document.body.classList.remove("battle-mode");
  state.isPlaying = false;
  showToast("已退出播放", "info");
}

function handleDoubleClick(e) {
  stopPlaying();
}

function getMusicInfoElement(library) {
  switch (library) {
    case "1yearminus":
      return DOM.musicInfo1yearminus;
    case "1yearplus":
      return DOM.musicInfo1yearplus;
    case "1yearplus-ex":
      return DOM.musicInfo1yearplusEx;
    default:
      return null;
  }
}

function getBattleButton(library) {
  switch (library) {
    case "1yearminus":
      return DOM.battle1yearminusBtn;
    case "1yearplus":
      return DOM.battle1yearplusBtn;
    case "1yearplus-ex":
      return DOM.battle1yearplusExBtn;
    default:
      return null;
  }
}

function showToast(message, type) {
  const toast = document.createElement("div");
  toast.className = "toast " + type;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: 8px;
    z-index: 2000;
    font-weight: bold;
    animation: toast-in 0.3s ease;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
  `;

  if (type === "success") {
    toast.style.backgroundColor = "rgba(34, 139, 34, 0.95)";
    toast.style.color = "white";
  } else if (type === "error") {
    toast.style.backgroundColor = "rgba(178, 34, 34, 0.95)";
    toast.style.color = "white";
  } else if (type === "warning") {
    toast.style.backgroundColor = "rgba(180, 83, 9, 0.95)";
    toast.style.color = "white";
  } else {
    toast.style.backgroundColor = "rgba(30, 64, 175, 0.95)";
    toast.style.color = "white";
  }

  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 2500);
}

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用）
 * ================================================================= */
function cleanupMusicDrawPage(bindAbort) {
  // signal 登记的静态骨架监听（按钮/document dblclick）统一解绑
  if (bindAbort) bindAbort.abort();

  // 运行态定时器统一清除
  if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
  if (battleTextTimer) { clearInterval(battleTextTimer); battleTextTimer = null; }
  if (clickToStopTimer) { clearTimeout(clickToStopTimer); clickToStopTimer = null; }
  if (battleStartTimer) { clearTimeout(battleStartTimer); battleStartTimer = null; }

  state.isPlaying = false;
  document.body.classList.remove("battle-mode");

  const player = document.getElementById("music-player");
  if (player) {
    player.onended = null;
    player.pause();
    try { player.currentTime = 0; } catch (e) { /* 未加载媒体时可能抛错，忽略 */ }
  }
}
