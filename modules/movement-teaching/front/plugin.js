/**
 * movement-teaching 前端插件（P4 迁移，P11-B6 增补组件装配）—— 原
 * movement_without_hands_*.js 与 m-w-h_records_*.js 的插件化入口
 * （内核契约：原生 ESM，不 import 内核；apply 阶段只 register，
 * DOM 操作统一发生在 component 被调用时）。
 *
 * 本模块含三个页面变体（URL 前缀同为 /m/movement-teaching/，内核 moduleId 均解析为
 * "movement-teaching"，front.json 单条目命中三页），按静态骨架标记分发：
 *   records.html  → records（#records-list）
 *   settings.html → settings（#trick-form）
 *   index.html    → game（#draw-trick-btn，兜底）
 *
 * 组件装配（P11 §3 问 3；P11-B7 收敛到 L1 装配器）：仅**游戏页**需要 L2 组件 draw-machine
 * （抽技名闪现 → 定格）：
 *   槽位     [data-slot=draw]（index.html 内，.container 之外的空容器）
 *   props    由 game.js 的 movementTeachingDrawProps(bridge) 提供（items/display/trigger/
 *            colors/onReady/onEmpty/onResult），清单 config.components 可作静态覆盖
 *   降级    ctx.ui.component("draw-machine") 返回 null（组件 enabled:false 或未注册）
 *            → 插槽留空、页面照常工作；game.js 检测到 bridge.draw 缺失时自行绑定
 *            fallbackDrawTrick（静默抽技 + 上屏），功能不丢。
 *   装配循环（含"组件缺失/插槽缺失"降级）由 L1 共享装配器 /web/components/compose.mjs 承担，
 *   以 names 过滤表达"只游戏页装配"：记录/设置两页零装配（也无需声明 data-slot，不发无谓告警）。
 *
 * 记录/设置两页无组件依赖（记录页只用 REST 端点；设置页用 game-data.js 的持久化封装），
 * 因此不装配、也不要求 data-slot，避免无谓的"插槽不存在"告警。
 *
 * inject 含 "api"：页面持久化控制器需要 ctx.api（origin 相对路径、非 2xx 抛错）。
 */
import {
  initMovementTeachingGame,
  movementTeachingDrawProps,
} from "./game.js";
import { initMovementTeachingSettings } from "./settings.js";
import { initMovementTeachingRecords } from "./records.js";
import { mountFromConfig } from "/web/components/compose.mjs";

/** 插槽兜底（清单未声明 slots 时的缺省选择器，键 = 组件名，与 index.html 的 data-slot 对应） */
const DEFAULT_SLOTS = {
  "draw-machine": "[data-slot=draw]",
};

export default {
  name: "movement-teaching-front",
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({
      key: "movement-teaching", // 必须 = 模块 id
      component(el, meta, componentCtx) {
        const pageCtx = componentCtx || ctx;
        const pageCleanups = []; // 页面 flow（game / settings / records）

        // 页面分发标记（静态骨架；与迁移前的判定顺序一致）
        const isRecords = !!document.getElementById("records-list");
        const isSettings = !isRecords && !!document.getElementById("trick-form");
        const isGame = !isRecords && !isSettings;

        // 组件实例 API 桥：onReady 回填，页面 flow（game.js）消费
        const bridge = { draw: null };
        // 组件装配：仅游戏页装配 draw-machine（names 过滤表达"只游戏页"；记录/设置页零装配）
        const mounted = mountFromConfig({
          el,
          meta,
          ctx: pageCtx,
          label: "movement-teaching",
          defaultSlots: DEFAULT_SLOTS,
          runtimeProps: movementTeachingDrawProps(bridge),
          names: isGame ? ["draw-machine"] : [],
        });

        const mount = (init) => {
          const dispose = init(pageCtx);
          if (typeof dispose === "function") pageCleanups.push(dispose);
        };

        if (isRecords) {
          mount(initMovementTeachingRecords);
        } else if (isSettings) {
          mount(initMovementTeachingSettings);
        } else {
          // 兜底 = 游戏页：若静态骨架标记缺失会静默错挂，留 warn 便于发现
          if (!document.getElementById("draw-trick-btn")) {
            console.warn(
              "[movement-teaching-front] 静态骨架未命中 records/settings/game 标记，兜底挂载游戏页"
            );
          }
          mount((pageCtx2) => initMovementTeachingGame(pageCtx2, bridge));
        }

        return () => {
          // 页面优先卸载（先摘监听/清 interval），再卸载组件实例
          // （mounted.cleanup 清 tick 定时器 / 回滚 display 内联色与滚动类）
          while (pageCleanups.length) {
            try {
              pageCleanups.pop()();
            } catch (e) {
              console.error("[movement-teaching-front] cleanup 失败:", e);
            }
          }
          mounted.cleanup();
        };
      },
    });
  },
};
