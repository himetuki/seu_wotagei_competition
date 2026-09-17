/**
 * 内置服务 ctx.state —— 跨插件内存键值（P3a）
 *
 * ctx.state = { get(key), set(key, val) }
 * set 时经根 Context 广播 "state:changed" 事件（payload { key, val }），插件用 ctx.on 订阅。
 * 仅内存态，页面刷新即清空；持久化走 ctx.api 落后端（AGENTS §3.2 模式）。
 */
export function installState(ctx) {
  const store = new Map();

  const service = {
    get(key) {
      return store.get(key);
    },
    set(key, val) {
      store.set(key, val);
      ctx.emit("state:changed", { key, val });
    },
  };

  ctx.provide("state", service);
  return service;
}
