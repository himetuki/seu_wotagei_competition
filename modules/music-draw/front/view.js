/**
 * music-draw — 页面 flow（P11-B4「积木拼装」迁移后）
 *
 * 分层（P11 §2.1）：本文件 = L4 页面专属 flow（曲库加载、三曲库编排、Toast、装饰图标、
 * 主页跳转）。跨页同构能力已抽走，本文件不再各写一份：
 *   · 抽音乐闪现动画（15×80ms 随机闪现 → 定格） → 组件 component-draw-machine
 *   · 播放 + 比赛模式（BATTLE START 打字 / 4.5s 待播 / 双击退出 / onended） → component-music-player
 *   · 洗牌 / 随机抽取                        → 本页无（无洗牌处）
 *   · 存档双写 / 恢复 / 重置                  → 本页无独立存档（三曲库不落盘，与迁移前一致）
 *
 * 「三曲库各一个实例」：曲库 = 页面结构单位（各有自己的抽取按钮/比赛按钮/结果展示），
 * 故每曲库一对组件实例（实例下标 = 曲库序），而不是把三曲库塞进一个实例——
 * music-player/draw-machine 的 display/trigger/startTrigger 在实例化时定死，
 * 单实例无法同时服务三个按钮与三个展示节点。
 *
 * 有意行为变更（仅以下四处，其余逐行保留语义）：
 *   1. 抽取动画由内联 setInterval 改为 component-draw-machine（tick 数/间隔逐字一致：15×80ms；
 *      内联色 #fbbf24 → #10b981 经 colors 原样保留）。
 *   2. 播放/比赛模式由 component-music-player 接管：BATTLE START 打字 130ms、1.5s 显示提示、
 *      4.5s 开始播放、双击退出的时序逐字保留；body 类 battle-mode 的加/移改由组件负责。
 *      ⚠ 退出提示文案「双击屏幕退出播放」与手势一致（迁移前即为双击，无文案改动）。
 *   3. 页面骨架里的静态动画节点（#battle-start-overlay / #battle-start-text / #click-to-stop）
 *      与 <audio id="music-player"> 删除：遮罩/文字/提示改由组件实例自建（三实例须各自持有
 *      自己的 <audio>——共用一个元素会让"第二曲库播放上一曲库的歌曲"，见迁移报告"组件缺陷"）。
 *      相关 CSS 规则（.battle-overlay/.battle-start-text/.click-to-stop/.hidden）原样保留，
 *      组件自建节点带同名 class，视觉不变。
 *   4. 无「取消抽取」入口，抽取按钮不做二次动画（原实现同样在动画期间禁用抽取按钮）。
 *
 * 组件降级：组件未注册/被 enabled:false 禁用时插槽留空、页面其余部分照常工作
 * （原内联实现已删除，不做"回退到旧实现"的双路径——双路径会让禁用开关形同虚设）。
 */

import { icon } from "/web/icons.mjs";

/* =================================================================
 *  曲库表（页面结构单位：id = DOM 后缀 / folder = 资源目录 / key = state.musicLists 键）
 * ================================================================= */
const LIBRARIES = [
  { id: "1yearminus", folder: "1yearminus", key: "1yearminus" },
  { id: "1yearplus", folder: "1yearplus", key: "1yearplus" },
  { id: "1yearplus-ex", folder: "1yearplus_ex", key: "1yearplus-ex" },
];

/* =================================================================
 *  全局状态（原 music_draw.js 顶层）
 * ================================================================= */
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
  isLoaded: false,
};

const DOM = {};

/* toast 桥（P12）：toast 组件实例 onReady 回填（front/plugin.js 组件体内实例化，经 bridge
 * 交付）。调用点零改动。降级语义：组件缺失（enabled:false / 未注册）→ console.log */
let toastApi = null;

/* =================================================================
 *  组件运行时 props（front/plugin.js 挂载时取用）
 *
 * 静态 props（时序/颜色/文案）可由 web/front.json 的 music-draw config.components 覆盖，
 * 运行时 props 优先级更高。按钮归属刻意不重叠：
 *   draw-machine  : 接管 #draw-<库>-btn（闪现动画 + 内联色）
 *   music-player  : 不接管 trigger（trigger: null 钉死，防止清单误配导致同一按钮双跑动画），
 *                   只接管 #battle-<库>-btn（播放/比赛模式/双击退出）
 *   串联          : draw 定格 → bridge.music[i].setItem(item)（同步播放器 current + 预载本实例 audio.src）
 * ================================================================= */
export function componentProps(bridge) {
  return {
    "music-player": LIBRARIES.map((lib, i) => ({
      items: () => state.musicLists[lib.key],
      folder: lib.folder,
      display: `#music-info-${lib.id}`,
      trigger: null, // 抽取归 draw-machine（同按钮双绑会双跑动画）
      startTrigger: `#battle-${lib.id}-btn`,
      overlay: {
        enabled: true,
        textContent: "BATTLE START",
        textMs: 130,
        readyMs: 4500,
        hintMs: 1500,
        hintText: "双击屏幕退出播放", // 文案与手势一致（迁移前 handleDoubleClick 即双击退出）
        hintId: null, // 无静态 #click-to-stop 节点，不留 id（多实例避免重复 id）
      },
      exitOnDblclick: true,
      exitOnClick: false,
      exitOnEnded: true,
      onReady: (api) => {
        bridge.music[i] = api;
      },
      // 未抽到音乐即点比赛开始（迁移前 startBattle 的提示，文案逐字保留）
      onEmpty: () => showToast("请先抽取音乐", "warning"),
      onStarted: () => showToast("双击屏幕退出播放", "info"),
      onExited: ({ reason }) => {
        // 播放失败已单独提示（onError），不重复报"已退出播放"；其余退出原因与迁移前同文案
        if (reason !== "error") showToast("已退出播放", "info");
      },
      onError: (err) => {
        console.error("音乐播放失败:", err);
        showToast("音乐播放失败", "error");
      },
    })),
    "draw-machine": LIBRARIES.map((lib, i) => ({
      // items 取值同时复刻迁移前 drawMusic 的三条日志（抽取曲库 / 全量列表 / 选中列表）
      items: () => {
        console.log("抽取音乐:", lib.key);
        console.log("当前音乐列表:", state.musicLists);
        const list = state.musicLists[lib.key];
        console.log("选中列表:", list);
        return list;
      },
      display: `#music-info-${lib.id}`,
      trigger: `#draw-${lib.id}-btn`,
      ticks: 15, // 迁移前 flashCount
      tickMs: 80, // 迁移前 flashInterval
      colors: { rolling: "#fbbf24", result: "#10b981" }, // 迁移前内联色
      onReady: (api) => {
        bridge.draw[i] = api;
      },
      onEmpty: () => showToast("音乐列表为空，请等待加载完成", "error"),
      onResult: (item) => {
        console.log("抽取到的音乐:", item);
        state.drawnMusic[lib.key] = item;

        // 启用本库「比赛开始」按钮（迁移前 drawMusic 尾部的按钮态）
        const battleBtn = document.getElementById(`battle-${lib.id}-btn`);
        if (battleBtn) battleBtn.disabled = false;

        // 串联播放器：定格结果同步给本曲库的 music-player 实例（含 audio.src 预载）
        const musicApi = bridge.music[i];
        if (musicApi) musicApi.setItem(item);

        showToast(`已抽取音乐：${item}`, "success");
      },
    })),
  };
}

/* =================================================================
 *  组件入口（原 DOMContentLoaded 初始化，kernel render 时执行）
 * ================================================================= */
export function musicDrawComponent(el, meta, ctx, bridge) {
  // cleanup 契约：静态骨架全部监听经 signal 登记，重渲染时 abort 统一解绑，
  // 防止不刷新页面的重复 render 造成双绑双触发
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

  // P12：接桥 toast 组件 API（实例由 front/plugin.js 组件体内创建并经 bridge 交付；
  // 组件缺失时 bridge.toast 为 null，showToast 降级 console.log）
  toastApi = (bridge && bridge.toast) || null;

  cacheDOM();
  loadMusicLists();
  bindEvents(signal);

  return () => {
    cleanupMusicDrawPage(bindAbort);
    toastApi = null; // 复位桥，避免悬空引用
  };
}

function cacheDOM() {
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
  // 回到主页
  DOM.homeBtn.addEventListener("click", () => {
    window.location.href = "/m/home";
  }, { signal });

  // 抽取/比赛按钮与双击退出的监听全部归组件实例（draw-machine 的 trigger /
  // music-player 的 startTrigger + 播放期 document dblclick），页面侧不再绑定，避免双跑。
}

function showToast(message, type = "info", duration = 3000) {
  if (toastApi) toastApi.show(message, type, duration);
  else console.log("[toast]", type, message);
}

/* =================================================================
 *  cleanup（重渲染/卸载时由 ctx.ui 调用）
 * ================================================================= */
function cleanupMusicDrawPage(bindAbort) {
  // signal 登记的静态骨架监听（主页按钮）统一解绑
  if (bindAbort) bindAbort.abort();

  // toast 节点/定时器归 toast 组件实例（P12），随组件 cleanup 回收，页面侧不再扫尾。
  // 抽取动画 / 比赛模式定时器、body 类 battle-mode、audio 的 onended+pause 归零，
  // 全部由各组件实例的 cleanup 负责（front/plugin.js 收集后逐个调用），页面侧不再重复。
  state.drawnMusic = {
    "1yearminus": null,
    "1yearplus": null,
    "1yearplus-ex": null,
  };
}
