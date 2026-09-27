/**
 * music-draw 前端插件（P11-B4：改为「积木拼装」薄壳）
 *
 * 契约：原生 ESM，不 import 内核；apply 阶段只 register，DOM 操作统一发生在 component 内。
 * key 必须 = 模块 id。本文件只负责"取组件 + 挂到插槽（可多个）+ 收集 cleanup"，
 * 页面 flow 全在 ./view.js（L4），跨页能力在 modules/component-*（L2）。
 *
 * 声明来源（web/front.json 的 music-draw 条目 config）：
 *   compose    ["music-player", "draw-machine"]           需要装配的组件名（顺序即挂载顺序）
 *   slots      { "music-player": ["[data-slot=music-1yearminus]", …], … }  各组件宿主选择器
 *   components { "<name>": { …props } | [{ …props }, …] } 组件静态 props 覆盖（时序/颜色/文案）
 * 运行时 props（items/display/trigger/回调）由 view.js 的 componentProps() 提供，优先级更高。
 *
 * ★ 多实例支持（music-draw 三曲库 = 三个 music-player + 三个 draw-machine）：
 *   slots[name] 与 components[name] / 运行时 props 均可为**数组**，按**下标一一对应**：
 *     slots["music-player"][i]  ←→  props[i]
 *   单实例组件照旧写字符串/对象（等价于长度为 1 的数组）；数组槽位配对象 props 时，
 *   每个实例共用同一份 props。slots 的键是**组件名**（与 bg1 口径一致），HTML 侧用短名
 *   data-slot 属性承载。下标对齐由 L1 共享装配器实现（见其 propsAtIndex 语义）。
 *
 * 降级（P11 §3 问 6）：ctx.ui.component(name) 返回 null（组件被 enabled:false 禁用或未注册）
 * → 跳过该组件（插槽留空），页面其余部分照常工作；槽位缺失同样只 warn 不抛错。
 *
 * 装配实现：本文件不再手写"取组件 + 挂插槽"循环 —— 循环/降级/多实例下标对齐/props 合并/
 * cleanup 收集全部由 L1 共享装配器 web/components/compose.mjs 提供（mountFromConfig）；
 * 本文件只保留模块语义：DEFAULT_SLOTS、bridge、页面 component 调用与 cleanup 组合顺序。
 */
import { musicDrawComponent, componentProps } from "./view.js";
import { mountFromConfig } from "/web/components/compose.mjs";

/** 插槽兜底（清单未声明 slots 时的缺省选择器，键 = 组件名，下标 = 曲库实例序） */
const DEFAULT_SLOTS = {
  "music-player": [
    "[data-slot=music-1yearminus]",
    "[data-slot=music-1yearplus]",
    "[data-slot=music-1yearplus-ex]",
  ],
  "draw-machine": [
    "[data-slot=draw-1yearminus]",
    "[data-slot=draw-1yearplus]",
    "[data-slot=draw-1yearplus-ex]",
  ],
};

export default {
  name: "music-draw-front",
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({
      key: "music-draw",
      component(el, meta, componentCtx) {
        // 组件实例 API 桥：onReady 按实例下标回填，页面 flow（view.js）消费
        const bridge = { music: [], draw: [] };

        // P12：toast 组件实例化（页面级单例，自挂 body；mountFromConfig 之前创建，
        // onReady 经 bridge.toast 交付 view.js 的 showToast 桥。组件缺失时桥保持
        // null，showToast 降级 console.log——页面其余部分照常工作）
        const toastCleanups = [];
        const toastFactory =
          componentCtx && componentCtx.ui ? componentCtx.ui.component("toast") : null;
        if (toastFactory) {
          const dispose = toastFactory(
            document.body,
            { onReady: (api) => { bridge.toast = api; } },
            componentCtx
          );
          if (typeof dispose === "function") toastCleanups.push(dispose);
        }

        // 组件装配：循环 / 降级 / 多实例下标对齐 / props 合并 / cleanup 收集统一由 L1 共享装配器承担
        const mounted = mountFromConfig({
          el,
          meta,
          ctx,
          label: "music-draw",
          defaultSlots: DEFAULT_SLOTS,
          runtimeProps: componentProps(bridge),
        });

        const cleanupPage = musicDrawComponent(el, meta, ctx, bridge);

        return () => {
          if (typeof cleanupPage === "function") cleanupPage();
          mounted.cleanup(); // 组件实例逆序卸载（清定时器/监听/audio）
          while (toastCleanups.length) toastCleanups.pop()(); // toast 实例（容器+在飞定时器）
        };
      },
    });
  },
};
