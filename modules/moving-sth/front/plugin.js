/**
 * moving-sth 前端插件（P4）—— 原 moving_sth_{core,ui,timer,data,settings}.js 的
 * 插件化入口（内核契约：原生 ESM，不 import 内核；apply 阶段只 register，
 * DOM 操作统一发生在 component 被调用时）。
 *
 * 本模块含两个页面变体（URL 前缀同为 /m/moving-sth/，内核 moduleId 均解析为
 * "moving-sth"，front.json 单条目命中两页），按静态骨架标记分发：
 *   settings.html → 设置页（#settings-form）
 *   index.html    → 游戏页（#start-timer-btn，兜底）
 *
 * 组件复用既有静态骨架 DOM，不向 #plugin-root 写入内容；
 * cleanup 统一转交页面闭包返回的解绑函数（signal 监听 + interval/rAF/timeout/audio）。
 */
import { initMovingSthGame } from "./game.js";
import { initMovingSthSettings } from "./settings.js";

export default {
  name: "moving-sth-front",
  inject: ["ui"],
  apply(ctx) {
    ctx.ui.register({
      key: "moving-sth", // 必须 = 模块 id
      component() {
        const cleanups = [];
        const mount = (init) => {
          const dispose = init();
          if (typeof dispose === "function") cleanups.push(dispose);
        };

        if (document.getElementById("settings-form")) {
          mount(initMovingSthSettings);
        } else {
          // 兜底 = 游戏页：若静态骨架标记缺失会静默错挂，留 warn 便于发现
          if (!document.getElementById("start-timer-btn")) {
            console.warn("[moving-sth-front] 静态骨架未命中 settings/game 标记，兜底挂载游戏页");
          }
          mount(initMovingSthGame);
        }

        return () => {
          while (cleanups.length) {
            try {
              cleanups.pop()();
            } catch (e) {
              console.error("[moving-sth-front] cleanup 失败:", e);
            }
          }
        };
      },
    });
  },
};
