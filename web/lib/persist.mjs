/**
 * web/lib/persist.mjs —— 持久化双写 / 恢复链 / 重置（L1 共享资产，P11-B2）
 *
 * 分层归属：L1（与 /web/icons.mjs 同级）——无 DOM、无内部可变状态、无定时器；
 * fetch / localStorage 一律由调用方注入（依赖注入），本模块自身不引用全局对象，
 * 因此可在 node 中全流程单测（web/lib/persist.test.js）。
 *
 * 封装 AGENTS §3.2 的模板（saveState / loadLocalState / loadStateFromServer / handleReset）：
 *   - 保存 = 双写：先 localStorage（同步、必达），后服务端 POST（异步、失败不抛）
 *   - 恢复 = server → localStorage → initNewGame（前两者经 isValid 判定"算不算有存档"）
 *   - 重置 = 清 localStorage + 调 clearEndpoint 清服务端
 *
 * 用法（模块前端插件内，origin 相对路径 import）：
 *   import { createPersistence } from "/web/lib/persist.mjs";
 *
 *   const persist = createPersistence({
 *     key: "dragBattleState2_player1",           // ★ localStorage key 逐字保留，勿改（存档契约）
 *     endpoint: "/api/drag-process",             // GET 恢复 / POST 保存
 *     clearEndpoint: "/api/clear-drag-process",  // 重置清服务端（缺省则只清本地）
 *     api: ctx.api,                              // ctx.api 即 { get, post }，兼容
 *     storage: localStorage,                     // 缺省 globalThis.localStorage
 *     initNewGame: () => ({ phase: "playing" }), // 两端都空时的初始态（可省 → data:null）
 *     isValid: (d) => Array.isArray(d && d.nodes) && d.nodes.length > 0, // 可选，模块自定"有存档"
 *   });
 *
 *   const { data, source } = await persist.load(); // source: "server"|"local"|"new"|"none"
 *   await persist.save(getPersisted());            // → { local, remote }（写盘/远端是否成功）
 *   await persist.reset();                         // → { local, remote }
 *
 * 契约要点：
 *   - save 的 POST 体恒为 { ...data, lastUpdate: now() }（与既有模板逐字节同形，
 *     端点/数据库字段不变）；data 为数组/原始值时按原值发（对象展开仅对对象生效）。
 *   - 远端失败（网络/非 2xx）一律不 reject，结果体现在返回值的 remote:false；
 *     需要提示/埋点时注入 onError(e, phase)。
 *   - load 的服务端响应经 isValid 判定：缺省拒绝 null/undefined/仅含 lastUpdate 的空对象；
 *     数组与业务对象直接算命中（模块可用自己的关键字段收紧）。
 *   - 清理语义：reset 只清两端存档，不重建状态——初始态由调用方决定（initNewGame 或页面自建）。
 *   - clearEndpoint 用 POST（项目既有 clear API 全为 POST，如 /api/clear-drag-process）。
 *     若某端点用 DELETE，注入适配器即可：{ post: (p) => ctx.api.del(p) }。
 */

/** 内存兜底 storage（无 localStorage 环境/隐私模式）：接口与 Storage 同形 */
export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
  };
}

/** 安全取宿主 localStorage：沙箱 iframe 下访问属性本身可能抛 SecurityError */
function defaultStorage() {
  try {
    return globalThis.localStorage || createMemoryStorage();
  } catch (e) {
    return createMemoryStorage();
  }
}

/** 缺省"有存档"判定：null/undefined 不算；纯空对象（仅 lastUpdate）不算；数组与业务对象算 */
function defaultIsValid(data) {
  if (data === null || data === undefined) return false;
  if (typeof data !== "object" || Array.isArray(data)) return true;
  return Object.keys(data).some((k) => k !== "lastUpdate");
}

/**
 * 创建持久化控制器（每次调用产出一个独立实例，无模块级共享状态）。
 * @param {{
 *   key: string, storage?: object, api?: {get:Function, post:Function}|null,
 *   endpoint?: string, clearEndpoint?: string, initNewGame?: Function,
 *   isValid?: Function, now?: Function, onError?: Function
 * }} deps
 * @returns {{ load:Function, save:Function, reset:Function }}
 */
export function createPersistence(deps = {}) {
  const {
    key,
    storage = defaultStorage(),
    api = null,
    endpoint = null,
    clearEndpoint = null,
    initNewGame = null,
    isValid = defaultIsValid,
    now = () => new Date().toISOString(),
    onError = null,
  } = deps;

  if (typeof key !== "string" || !key) {
    throw new Error("createPersistence({ key }) 需要非空字符串 key");
  }

  const report = (e, phase) => {
    if (typeof onError === "function") {
      try {
        onError(e, phase);
      } catch (err) { /* onError 自身抛错不影响主流程 */ }
    }
  };

  /** 读本地存档：无记录/JSON 损坏/判定为空 → undefined（表示"没有"，区别于"存了 null"） */
  function readLocal() {
    let raw = null;
    try {
      raw = storage.getItem(key);
    } catch (e) {
      report(e, "load:local-read");
      return undefined;
    }
    if (raw === null || raw === undefined) return undefined;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      report(e, "load:local-parse");
      return undefined;
    }
    return isValid(parsed) ? parsed : undefined;
  }

  /** 恢复链：server → localStorage → initNewGame；返回 { data, source }（永不 reject） */
  async function load() {
    if (api && endpoint) {
      try {
        const data = await api.get(endpoint);
        if (isValid(data)) return { data, source: "server" };
      } catch (e) {
        report(e, "load:server"); // 服务端不可用 → 静默回退本地（AGENTS §3.2 语义）
      }
    }
    const local = readLocal();
    if (local !== undefined) return { data: local, source: "local" };
    if (typeof initNewGame === "function") return { data: initNewGame(), source: "new" };
    return { data: null, source: "none" };
  }

  /**
   * 双写：先本地后远端（顺序固定，便于离线优先与单测断言）。
   * @returns {Promise<{local:boolean, remote:boolean}>} 两端各自是否写入成功（不 reject）
   */
  async function save(data) {
    let local = false;
    try {
      storage.setItem(key, JSON.stringify(data));
      local = true;
    } catch (e) {
      report(e, "save:local"); // 配额/隐私模式 → 仍尝试远端
    }

    let remote = false;
    if (api && endpoint) {
      const body =
        data && typeof data === "object" && !Array.isArray(data)
          ? { ...data, lastUpdate: now() }
          : data;
      try {
        await api.post(endpoint, body);
        remote = true;
      } catch (e) {
        report(e, "save:remote"); // 网络失败不打断页面（模板里是 .catch(() => {})）
      }
    }
    return { local, remote };
  }

  /** 清两端存档（不重建状态；页面重置流程随后自行 buildOrReset） */
  async function reset() {
    let local = false;
    try {
      storage.removeItem(key);
      local = true;
    } catch (e) {
      report(e, "reset:local");
    }

    let remote = false;
    if (api && clearEndpoint) {
      try {
        await api.post(clearEndpoint); // ctx.api.post 缺省 body 为 {}
        remote = true;
      } catch (e) {
        report(e, "reset:remote");
      }
    }
    return { local, remote };
  }

  return { load, save, reset };
}
