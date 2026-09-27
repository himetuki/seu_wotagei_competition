/**
 * battle-group1 前端插件（P11-B2：改为「积木拼装」薄壳）
 *
 * 契约：原生 ESM，不 import 内核；apply 阶段只 register，DOM 操作统一发生在 component 内。
 * key 必须 = 模块 id。本文件只负责"取组件 + 挂到插槽 + 收集 cleanup"，
 * 页面 flow 全在 ./view.js（L4），跨页能力在 modules/component-*（L2）。
 *
 * 声明来源（P11 §3 问 3）：web/front.json 的 battle-group1 条目 config —
 *   compose    ["music-player", "draw-machine"]          需要装配的组件名（顺序即挂载顺序）
 *   slots      { "music-player": "[data-slot=music]", … } 组件宿主选择器（**按组件名**索引）
 *   components { "<name>": { …props } }                   组件静态 props 覆盖（时序/颜色/文案等）
 * 运行时 props（items/display/trigger/回调）由 view.js 的 componentProps() 提供，优先级更高。
 *
 * ★ 与 §3 问 3 示例的差异：示例里 compose 用组件名、slots 却用槽位名（music/draw），
 *   两者之间没有解析规则（无法从 "music-player" 推出 "music"）。这里把 slots 的键定为
 *   **组件名**，使 compose[i] ↔ slots[name] 直接对应；HTML 侧 data-slot 短名不变。
 *
 * 降级（P11 §3 问 6）：ctx.ui.component(name) 返回 null（组件被 enabled:false 禁用或未注册）
 * → 跳过该组件（插槽留空），页面其余部分照常工作；槽位缺失同样只 warn 不抛错。
 *
 * 装配实现：本文件不再手写"取组件 + 挂插槽"循环 —— 循环/降级/多实例下标对齐/props 合并/
 * cleanup 收集全部由 L1 共享装配器 web/components/compose.mjs 提供（mountFromConfig）；
 * 本文件只保留模块语义：DEFAULT_SLOTS、bridge、页面 component 调用与 cleanup 组合顺序。
 */
import { battleGroup1Component, componentProps } from "./view.js";
import { mountFromConfig } from "/web/components/compose.mjs";

/** 插槽兜底（清单未声明 slots 时的缺省选择器，键 = 组件名，与 index.html 的 data-slot 对应） */
const DEFAULT_SLOTS = {
  "music-player": "[data-slot=music]",
  "draw-machine": "[data-slot=draw]",
};

export default {
  name: "battle-group1-front",
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({
      key: "battle-group1",
      component(el, meta, componentCtx) {
        // 组件实例 API 桥：onReady 回填，页面 flow（view.js）消费
        const bridge = { music: null, draw: null };
        // 组件装配：循环 / 降级 / props 合并 / cleanup 收集统一由 L1 共享装配器承担
        const mounted = mountFromConfig({
          el,
          meta,
          ctx,
          label: "battle-group1",
          defaultSlots: DEFAULT_SLOTS,
          runtimeProps: componentProps(bridge),
        });

        const cleanupPage = battleGroup1Component(el, meta, ctx, bridge);

        return () => {
          if (typeof cleanupPage === "function") cleanupPage();
          mounted.cleanup(); // 组件实例逆序卸载（清定时器/监听/body 类）
        };
      },
    });
  },
};
