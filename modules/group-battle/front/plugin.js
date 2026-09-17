/**
 * group-battle 前端插件（P3d）—— 原 gb_common.js + group_battle{,_2,_3}_*.js 的
 * 插件化入口（内核契约：原生 ESM，不 import 内核；apply 阶段只 register，
 * DOM 操作统一发生在 component 被调用时）。
 *
 * 本模块含三个页面变体（URL 前缀同为 /m/group-battle/，内核 moduleId 均解析为
 * "group-battle"，front.json 单条目命中全部三页），按静态骨架标记分发：
 *   group_battle_3.html  → page3（#finish-btn，先判避免与 page2 的 #prev-round-btn 混淆）
 *   group_battle_2.html  → page2（#prev-round-btn）
 *   index.html           → page1（第一大轮，兜底）
 *
 * 组件复用既有静态骨架 DOM，不向 #plugin-root 写入内容；
 * cleanup 统一转交页面闭包返回的解绑函数（document/window 监听器 + audio）。
 */
import { iconEl } from "/web/icons.mjs";
import { initPage1 } from "./page1.js";
import { initPage2 } from "./page2.js";
import { initPage3 } from "./page3.js";

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
      component() {
        const cleanups = [];
        const mount = (init) => {
          const dispose = init();
          if (typeof dispose === "function") cleanups.push(dispose);
        };

        // 装饰图标（内联 SVG，替代原 emoji）
        mountWinCrown();

        if (document.getElementById("finish-btn")) {
          mount(initPage3);
        } else if (document.getElementById("prev-round-btn")) {
          mount(initPage2);
        } else {
          // 兜底 = page1：若未来新增第四页面变体，此处会静默错挂，留 warn 便于发现
          console.warn("[group-battle-front] 静态骨架未命中 page2/page3 标记，兜底挂载 page1");
          mount(initPage1);
        }

        return () => {
          while (cleanups.length) {
            try {
              cleanups.pop()();
            } catch (e) {
              console.error("[group-battle-front] cleanup 失败:", e);
            }
          }
        };
      },
    });
  },
};
