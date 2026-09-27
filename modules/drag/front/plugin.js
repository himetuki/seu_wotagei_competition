/**
 * drag 前端插件（P11-B4：改为「积木拼装」薄壳）
 *
 * 契约：原生 ESM，不 import 内核；apply 阶段只 register，DOM 操作统一发生在 component 内。
 * key 必须 = 模块 id。本文件只负责"取组件 + 挂到插槽 + 收集 cleanup"，
 * 页面 flow（bracket / 拖拽 / 撤销 / 存档编排）全在 ./view.js（L4），
 * 跨页能力在 modules/component-*（L2）。
 *
 * 声明来源（web/front.json 的 drag 条目 config）：
 *   compose    ["music-player", "draw-machine"]          需要装配的组件名（顺序即挂载顺序）
 *   slots      { "music-player": "[data-slot=music]", … } 组件宿主选择器（**按组件名**索引）
 *   components { "<name>": { …props } }                  组件静态 props 覆盖（时序/颜色/文案等）
 * 运行时 props（items/display/trigger/回调）由 view.js 的 componentProps() 提供，优先级更高。
 *
 * 按钮归属（与 bg1 同口径，刻意不重叠——同一按钮绑两个组件会双跑动画，
 * 且两个组件各自 pick 的"最终结果"可能不同，展示与播放会分裂）：
 *   draw-machine  → #draw-music-btn（40×50ms 顺序循环闪现，接管抽取）
 *   music-player  → 不接管 trigger（运行时钉空），只接管 #start-battle-btn（播放/比赛模式/双击退出）
 *
 * 降级（P11 §3 问 6）：ctx.ui.component(name) 返回 null（组件被 enabled:false 禁用或未注册）
 * → 跳过该组件（插槽留空），页面其余部分照常工作；槽位缺失同样只 warn 不抛错。
 *
 * 装配实现：本文件不再手写"取组件 + 挂插槽"循环 —— 循环/降级/多实例下标对齐/props 合并/
 * cleanup 收集全部由 L1 共享装配器 web/components/compose.mjs 提供（mountFromConfig）；
 * 本文件只保留模块语义：DEFAULT_SLOTS、bridge、页面 component 调用与 cleanup 组合顺序。
 */
import { dragComponent, componentProps } from "./view.js";
import { mountFromConfig } from "/web/components/compose.mjs";

/** 插槽兜底（清单未声明 slots 时的缺省选择器，键 = 组件名，与 index.html 的 data-slot 对应） */
const DEFAULT_SLOTS = {
  "music-player": "[data-slot=music]",
  "draw-machine": "[data-slot=draw]",
};

export default {
  name: "drag-front",
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({
      key: "drag",
      component(el, meta, componentCtx) {
        // 组件实例 API 桥：onReady 回填，页面 flow（view.js）消费
        const bridge = { music: null, draw: null };
        // 组件装配：循环 / 降级 / props 合并 / cleanup 收集统一由 L1 共享装配器承担
        const mounted = mountFromConfig({
          el,
          meta,
          ctx,
          label: "drag",
          defaultSlots: DEFAULT_SLOTS,
          runtimeProps: componentProps(bridge),
        });

        const cleanupPage = dragComponent(el, meta, ctx, bridge);

        return () => {
          if (typeof cleanupPage === "function") cleanupPage();
          mounted.cleanup(); // 组件实例逆序卸载（清定时器/监听/body 类）
        };
      },
    });
  },
};
