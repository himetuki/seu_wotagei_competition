/**
 * group-battle 前端插件（P3d 分发机制 + P11-B5 组件接入）
 *
 * 契约：原生 ESM，不 import 内核；apply 阶段只 register，DOM 操作统一发生在 component 内。
 * key 必须 = 模块 id（内核按 /m/<id>/ 路径查组件）。
 *
 * 本模块含三个页面变体（URL 前缀同为 /m/group-battle/，内核 moduleId 均解析为
 * "group-battle"，front.json 单条目命中全部三页），按静态骨架标记分发：
 *   group_battle_3.html  → page3（#finish-btn，先判避免与 page2 的 #prev-round-btn 混淆）
 *   group_battle_2.html  → page2（#prev-round-btn）
 *   index.html           → page1（第一大轮，兜底）
 * ★ 分发机制逐字保留（三页共用一个插件入口是本模块既有设计，不改为薄壳）。
 *
 * P11-B5 组件接入（L2 组件类插件，命令式取用）：
 *   music-player → 音乐播放 + 比赛模式（遮罩/打字/定时/双击退出/audio onended）
 *   draw-machine → 抽音乐闪现动画（15 tick × 80ms）
 *   · 静态 props 来自 front.json 的 config.components（时序/文案/遮罩开关）；运行时 props
 *     （items/folder/display/trigger/回调 = 页面状态机唯一接线点）由各页 componentPropsN(bridge)
 *     提供，**按同名键浅合并覆盖**（非深合并）：三页均给出完整 overlay → 清单 overlay 不生效。
 *   · 两个组件的按钮归属刻意不重叠：draw-machine 接管 #draw-music-btn（闪现动画），
 *     music-player 不接管 trigger/startTrigger（只负责遮罩/逐字/待播/双击退出）；
 *     #start-battle-btn 由页面 handleStartBattle 显式接管 —— 首次（music_drawn）走遮罩，
 *     重播（battling）调 start({ skipOverlay: true }) 立即播放（迁移前 replayBattleMusic 语义）。
 *     串联：draw 定格 → onResult 里 bridge.music.setItem(item)（同步播放器 current + 预载 src）。
 *   · 降级（P11 §3 问 6）：ctx.ui.component(name) 返回 null（组件 enabled:false 或未注册）
 *     → 跳过该组件（插槽留空），页面其余部分照常工作；槽位缺失同样只 warn 不抛错。
 *
 * cleanup 顺序：页面闭包先解绑（signal/定时器），组件实例后卸载（释放 body 类、audio、自建遮罩）。
 *
 * 装配实现：本文件不再手写"取组件 + 挂插槽"循环 —— 循环/降级/多实例下标对齐/props 合并/
 * cleanup 收集全部由 L1 共享装配器 web/components/compose.mjs 提供（mountFromConfig）；
 * 本文件只保留模块语义：DEFAULT_SLOTS、detectPage 分发、bridge、mountWinCrown 与页面 init。
 */
import { iconEl } from "/web/icons.mjs";
import { mountFromConfig } from "/web/components/compose.mjs";
import { initPage1, componentProps1 } from "./page1.js";
import { initPage2, componentProps2 } from "./page2.js";
import { initPage3, componentProps3 } from "./page3.js";

/** 插槽兜底（清单未声明 slots 时的缺省选择器，键 = 组件名，与三页 HTML 的 data-slot 对应） */
const DEFAULT_SLOTS = {
  "music-player": "[data-slot=music]",
  "draw-machine": "[data-slot=draw]",
};

/**
 * 按静态骨架标记识别页面变体（page3 → page2 → page1 兜底）。
 * 标记是变体识别的唯一依据，不可改动；兜底分支留 warn，便于新增第四页时发现静默错挂。
 */
function detectPage() {
  if (document.getElementById("finish-btn")) {
    return { id: "page3", init: initPage3, componentProps: componentProps3 };
  }
  if (document.getElementById("prev-round-btn")) {
    return { id: "page2", init: initPage2, componentProps: componentProps2 };
  }
  console.warn(
    "[group-battle-front] 静态骨架未命中 page2/page3 标记，兜底挂载 page1",
  );
  return { id: "page1", init: initPage1, componentProps: componentProps1 };
}

/**
 * 胜利皇冠：三张页面骨架里的 `<div class="crown">` 原为 emoji，现注入内联 SVG。
 * 纯装饰动画元素（VICTORY 文字已表达语义），故 aria-hidden（iconEl 不传 label 默认）。
 * 重复 render 时跳过已存在节点。
 */
function mountWinCrown() {
  const crown = document.querySelector("#win-effect .crown");
  if (!crown || crown.querySelector("svg")) return;
  const svg = iconEl("crown", { size: 80, stroke: 1.5 });
  if (svg) crown.replaceChildren(svg);
}

export default {
  name: "group-battle-front",
  inject: ["ui"],
  apply(ctx) {
    ctx.ui.register({
      key: "group-battle", // 必须 = 模块 id
      component(el, meta) {
        const page = detectPage();
        // 组件实例 API 桥：onReady 回填，页面 flow 消费（同一对象传给 componentProps 与 init）
        const bridge = { music: null, draw: null };
        // 组件装配：循环 / 降级 / props 合并 / cleanup 收集统一由 L1 共享装配器承担
        const mounted = mountFromConfig({
          el,
          meta,
          ctx,
          label: "group-battle",
          defaultSlots: DEFAULT_SLOTS,
          runtimeProps: page.componentProps(bridge),
        });

        // 装饰图标（内联 SVG，替代原 emoji）
        mountWinCrown();

        // 页面 flow（拿到同一 bridge：bridge.music 已由组件 onReady 同步回填）
        const cleanupPage = page.init(bridge);

        return () => {
          // 先页面、后组件（mounted.cleanup 内部逆序 + 逐个隔离异常）
          try {
            if (typeof cleanupPage === "function") cleanupPage(); // 页面闭包解绑（signal/定时器）
          } catch (e) {
            console.error("[group-battle-front] cleanup 失败:", e);
          }
          mounted.cleanup(); // 组件逆序卸载：draw-machine → music-player
        };
      },
    });
  },
};
