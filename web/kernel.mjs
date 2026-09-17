/**
 * 前端内核入口（esbuild --bundle --format=esm → web/dist/kernel.js，P3a）
 *
 * 产物为纯副作用浏览器 bundle（cordis + 三内置服务 + 装配流程），模块页只需：
 *   <script type="module" src="/web/kernel.js"></script>
 *   <div id="plugin-root"></div>
 * 服务端无需按 enabled 注入插件 script 标签 —— loader 对 enabled:false 的条目不
 * import，代码不下载，效果等同（主持人定稿方案，覆盖规格 §5 注入该条）。
 *
 * 装配流程（assemblePage，对应定稿方案 1-5 步）：
 *   1. moduleId 从 location.pathname 解析（/m/<id>/…）
 *   2. fetch /web/front.json → parseManifest（失败按空清单装配，页面渲染占位）
 *   3. pluginsForPage 过滤 enabled !== false 且 target/pages 命中当前页的条目
 *   4. new Context() → provide ui/api/state → 顺序 await 挂载各插件（dynamic import）
 *      （cordis d.ts 的 Plugin = Function|Constructor|Object，无 Promise 形态，
 *        故先 await import 再把 default 导出交给 ctx.plugin，非一步式写法）
 *   5. 全部完成后 ctx.emit("kernel:ready", { moduleId }) → ctx.ui.render(moduleId, meta, container)
 *
 * 与后端 create-root.cjs 同款约束：本文件与 services 只允许 import "cordis"
 * （纯 JS 依赖）+ 本目录模块 —— 浏览器 bundle 不得混入任何服务端代码。
 */
import { Context } from "cordis";
import { installUi } from "./ui.mjs";
import { installApi } from "./api.mjs";
import { installState } from "./state.mjs";
import {
  moduleIdFromPath,
  parseManifest,
  pluginUrl,
  pluginsForPage,
  primaryEntry,
  targetId,
  unknownInjects,
} from "./loader.mjs";

/** 创建前端根 Context 并装上三个内置服务（对应后端 createBackendRoot） */
export function createFrontendRoot() {
  const ctx = new Context();
  installUi(ctx);
  installApi(ctx);
  installState(ctx);
  return ctx;
}

/**
 * 装配当前页面。依赖全部可注入（node 单测无 DOM/Fetch 亦可全流程运行）：
 *   moduleId / manifest / container   页面参数
 *   loadPlugin(id)                    缺省 import(pluginUrl(id)).then(m => m.default)
 *   createRoot()                      缺省 createFrontendRoot（测试借此预挂 ctx.on 监听）
 *   log()                             缺省 console.error（测试可静音）
 */
export async function assemblePage({
  moduleId = null,
  manifest = null,
  container = null,
  loadPlugin,
  createRoot = createFrontendRoot,
  log = console.error,
} = {}) {
  const ctx = createRoot();
  const errors = [];

  const entries = pluginsForPage(manifest, moduleId);
  for (const entry of entries) {
    const id = targetId(entry);
    try {
      const exported = loadPlugin
        ? await loadPlugin(id)
        : await import(pluginUrl(id)).then((m) => m.default);
      // F6 同款防护：未知服务名 → fiber 永久 PENDING（装配死锁），挂载前校验并跳过
      const bad = unknownInjects(exported);
      if (bad.length > 0) {
        throw new Error(
          `插件 ${id} inject 引用未知服务: ${bad.join(", ")}（已知: ui/api/state），已跳过挂载`
        );
      }
      await ctx.plugin(exported, entry.config);
    } catch (e) {
      errors.push(e);
      log(`[web/kernel] 插件 ${id} 挂载失败: ${e && e.message}`);
    }
  }

  ctx.emit("kernel:ready", { moduleId });

  const entry = primaryEntry(entries, moduleId);
  const meta = entry && entry.config !== undefined ? entry.config : null;
  if (moduleId && container) {
    // 该 key 未注册组件 → ui 渲染占位提示；组件自身抛错 → 降级占位，不让装配整体失败
    try {
      ctx.ui.render(moduleId, meta, container);
    } catch (e) {
      log(`[web/kernel] 组件 ${moduleId} 渲染失败: ${e && e.message}`);
      container.innerHTML = '<div class="plugin-placeholder">插件界面渲染失败，请刷新页面重试</div>';
    }
  }
  return { ctx, errors };
}

/** 浏览器 bootstrap：解析路径 → 读清单 → 装配渲染（dev 直接 fs、pkg 走内联资产，URL 一致） */
export async function start() {
  const moduleId = moduleIdFromPath(window.location.pathname);
  const container = document.getElementById("plugin-root");
  let manifest = null;
  try {
    const res = await fetch("/web/front.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = parseManifest(await res.text());
    if (!manifest) throw new Error("清单格式非法（缺 plugins 数组）");
  } catch (e) {
    console.error(`[web/kernel] /web/front.json 读取失败（按空清单装配）: ${e.message}`);
  }
  return assemblePage({ moduleId, manifest, container });
}

// 浏览器环境自动执行（node 单测 import 本文件时无 document，不会触发）
if (typeof document !== "undefined") {
  start().catch((e) => console.error("[web/kernel] 装配失败:", e));
}
