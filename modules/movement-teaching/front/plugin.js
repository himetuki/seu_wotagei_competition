/**
 * movement-teaching 前端插件（P4）—— 原 movement_without_hands_*.js 与
 * m-w-h_records_*.js 的插件化入口（内核契约：原生 ESM，不 import 内核；
 * apply 阶段只 register，DOM 操作统一发生在 component 被调用时）。
 *
 * 本模块含三个页面变体（URL 前缀同为 /m/movement-teaching/，内核 moduleId 均解析为
 * "movement-teaching"，front.json 单条目命中三页），按静态骨架标记分发：
 *   records.html  → records（#records-list）
 *   settings.html → settings（#trick-form）
 *   index.html    → game（#draw-trick-btn，兜底）
 *
 * 组件复用既有静态骨架 DOM，不向 #plugin-root 写入内容；
 * cleanup 统一转交页面闭包返回的解绑函数（signal 监听 + interval/audio/动态弹窗）。
 */
import { initMovementTeachingGame } from "./game.js";
import { initMovementTeachingSettings } from "./settings.js";
import { initMovementTeachingRecords } from "./records.js";

export default {
  name: "movement-teaching-front",
  inject: ["ui"],
  apply(ctx) {
    ctx.ui.register({
      key: "movement-teaching", // 必须 = 模块 id
      component() {
        const cleanups = [];
        const mount = (init) => {
          const dispose = init();
          if (typeof dispose === "function") cleanups.push(dispose);
        };

        if (document.getElementById("records-list")) {
          mount(initMovementTeachingRecords);
        } else if (document.getElementById("trick-form")) {
          mount(initMovementTeachingSettings);
        } else {
          // 兜底 = 游戏页：若静态骨架标记缺失会静默错挂，留 warn 便于发现
          if (!document.getElementById("draw-trick-btn")) {
            console.warn(
              "[movement-teaching-front] 静态骨架未命中 records/settings/game 标记，兜底挂载游戏页"
            );
          }
          mount(initMovementTeachingGame);
        }

        return () => {
          while (cleanups.length) {
            try {
              cleanups.pop()();
            } catch (e) {
              console.error("[movement-teaching-front] cleanup 失败:", e);
            }
          }
        };
      },
    });
  },
};
