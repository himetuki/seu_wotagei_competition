/**
 * web/lib/reactive.mjs —— 细粒度响应式装配基座（L1 共享资产）
 *
 * 底层 = petite-vue 0.4.1（MIT，Evan You）。vendor 产物 web/lib/vendor/petite-vue.mjs
 * 是**构建产物**（gitignored）：由 `npm run vendor:petite-vue` 从锁定的 devDependency
 * （package.json: petite-vue 0.4.1）经 esbuild 生成，与 web/dist/kernel.js 同层管理；
 * 运行期零网络依赖（本地静态文件 + 按需动态 import，未用响应式的页面不下载）。
 *
 * 为什么动态 import：
 *   1. vendor 产物末尾有 document.currentScript 自动初始化语句，node 直载会抛
 *      ReferenceError——本模块自身对 node 保持零静态依赖，单测经 deps 注入 fake；
 *   2. 按需加载：只有真正挂响应式视图的页面才产生这一次请求（~24KB）。
 *
 * 为什么"同步 cleanup + 晚到守卫"：内核契约要求页面组件同步返回 cleanup，而动态
 * import 是异步的。mountReactiveSafe 立即返回可用的 cleanup；挂载流程的每个异步
 * 步骤都先查 disposed——晚到的挂载被取消，绝不产生孤儿视图或孤儿监听。
 *
 * 适用范围（AGENTS §4.3）：状态驱动的管理/表单/列表页（plugin-manager、setting、
 * records）。动画/audio/计时器驱动的赛制页**保持命令式，禁止引入**。
 * CSP 约束：petite-vue 模板表达式经 new Function 编译——若将来为本站启用 CSP
 * script-src，需整体换用无 eval 方案（如 preact + htm）。
 *
 * 用法（页面插件内）：
 *   import { createReactiveScope, mountReactiveSafe } from "/web/lib/reactive.mjs";
 *
 *   const state = await createReactiveScope({ query: "", rows: [], doThing() {...} });
 *   const dispose = mountReactiveSafe(host, { template: TPL, scope: state });
 *   // 之后一切状态变更只写 state.xxx，DOM 由 petite-vue 细粒度更新（焦点天然不丢）。
 *   // cleanup 契约：dispose 与页面其余 cleanup 一起返回；可安全重复调用。
 */

/** 加载 petite-vue（动态 import：浏览器按需拉取；node 下此路径永不执行） */
let vendorPromise = null;
export function loadReactive() {
  if (!vendorPromise) {
    vendorPromise = import("./vendor/petite-vue.mjs").catch((e) => {
      vendorPromise = null; // 失败不缓存：下次调用可重试
      throw e;
    });
  }
  return vendorPromise;
}

/** 创建响应式状态（单一 import 点：页面不直接 import vendor） */
export async function createReactiveScope(init, deps = {}) {
  const pv = await (deps.loadReactive || loadReactive)();
  return pv.reactive(typeof init === "function" ? init() : init);
}

/**
 * 在 host 上挂载响应式视图，立即返回同步 cleanup（幂等；晚到挂载自动取消）。
 *
 * @param {Element|null} host 挂载宿主（petite-vue 以其为根编译指令子树）
 * @param {{template?: string, scope: object}} opts
 *   template 缺省 = 保留宿主现有 DOM（骨架已在 index.html / 前序代码中就位）
 *   scope    createReactiveScope 的返回值（reactive 状态 + 方法）
 * @param {{loadReactive?: Function, createApp?: Function}} deps 测试注入点
 * @returns {() => void} cleanup——与页面其余清理一起返回，可安全重复调用
 */
export function mountReactiveSafe(host, opts = {}, deps = {}) {
  if (!host || typeof host.innerHTML !== "string") {
    console.error("[reactive] mountReactiveSafe：宿主不是元素，跳过挂载");
    return () => {};
  }

  let disposed = false;
  let cleanup = null;

  const run = (deps.loadReactive || loadReactive)().then((pv) => {
    if (disposed) return; // 晚到：卸载先于加载完成 → 不挂载、零副作用
    const createApp = deps.createApp || pv.createApp;
    if (typeof createApp !== "function") {
      throw new Error("petite-vue 导出异常（缺 createApp）");
    }
    if (opts.template !== undefined) host.innerHTML = opts.template;
    const app = createApp(opts.scope);
    app.mount(host);
    cleanup = () => app.unmount();
  });

  run.catch((e) => {
    if (disposed) return;
    // 降级不崩：宿主保留静态骨架（template 已写入则保留该骨架），页面其余部分照常
    console.error("[reactive] 响应式挂载失败（保留静态骨架）:", e);
  });

  return () => {
    disposed = true;
    if (cleanup) {
      const fn = cleanup;
      cleanup = null;
      try {
        fn();
      } catch (e) {
        console.error("[reactive] unmount 失败:", e);
      }
    }
  };
}
