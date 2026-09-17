/**
 * web/loader —— 前端装配清单纯逻辑（P3a）
 *
 * 清单语义与后端 server/cordis/loader.js 对齐：
 *   - manifest = { provider?, plugins: [ { target, enabled?, pages?, config? } | "modules/<id>" ] }
 *   - enabled !== false 即启用；条目可为纯字符串（等价 { target }）
 *   - target 形如 "modules/<id>"；可选 pages 数组覆盖默认的单页匹配（跨页插件预留）
 *
 * 双端消费：esbuild 并入 web/dist/kernel.js（浏览器），node 直接 import
 * （web/loader.test.js 单测）——因此用 .mjs 后缀绕开根 package.json 的
 * "type": "commonjs"（.js 会被 node 当 CJS 解析，export 语法直接报错）。
 * 只依赖纯 JS，零 DOM/Fetch，保证可在 node 中运行。
 */

// 已知内置服务白名单（后端 F6 同款防护，前端侧：ui/api/state）。
// cordis K4：inject 引用未提供的服务 → fiber 永久 PENDING，await ctx.plugin() 死锁，
// 插件名拼写错（如 "uui"）会卡死整个装配。挂载前校验，非法条目跳过并计入 errors。
export const KNOWN_SERVICES = ["ui", "api", "state"];

// 返回 exported.inject 中不在白名单内的服务名（inject 兼容 string 与 array 两种 cordis 形式）
export function unknownInjects(exported) {
  const inject = exported && exported.inject;
  const list = Array.isArray(inject) ? inject : inject ? [inject] : [];
  return list.filter((s) => !KNOWN_SERVICES.includes(s));
}

/** 解析清单文本。损坏/缺 plugins 数组 → null（kernel 按空清单装配，页面渲染占位）。 */
export function parseManifest(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.plugins)) return null;
  return parsed;
}

/** 条目 target "modules/<id>" → id；字符串条目等同 { target }；非法 target → null */
export function targetId(entry) {
  const target = typeof entry === "string" ? entry : entry && entry.target;
  if (typeof target !== "string") return null;
  const m = /^modules\/(.+?)\/?$/.exec(target);
  return m ? m[1] : null;
}

/** 单条目是否命中当前页面：可选 pages 数组覆盖默认的「target 即本模块」匹配 */
export function matchPage(entry, moduleId) {
  const id = targetId(entry);
  if (!id || !moduleId) return false;
  if (Array.isArray(entry.pages)) return entry.pages.includes(moduleId);
  return id === moduleId;
}

/** enabled 过滤 + 页面匹配，保持清单顺序；manifest/moduleId 非法 → 空数组 */
export function pluginsForPage(manifest, moduleId) {
  if (!manifest || !Array.isArray(manifest.plugins) || !moduleId) return [];
  return manifest.plugins.filter(
    (entry) => entry && entry.enabled !== false && matchPage(entry, moduleId)
  );
}

/** 当前页面渲染用的主条目：target 即本模块者优先，否则取第一条命中条目（render meta/config 来源） */
export function primaryEntry(entries, moduleId) {
  return entries.find((entry) => targetId(entry) === moduleId) || entries[0] || null;
}

/** 从 location.pathname 解析模块 id：/m/<id>/… → id；/ → home（主页由根静态层服务）；其余 → null */
export function moduleIdFromPath(pathname) {
  const p = String(pathname || "");
  if (p === "/" || p === "/index.html") return "home";
  const m = /^\/m\/([^/?#]+)/.exec(p);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return m[1];
  }
}

/** 模块前端插件 URL（origin 相对路径，AGENTS §5-2） */
export function pluginUrl(id) {
  return `/m/${id}/front/plugin.js`;
}
