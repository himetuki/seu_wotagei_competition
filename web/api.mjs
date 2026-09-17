/**
 * 内置服务 ctx.api —— fetch 封装（origin 相对路径，AGENTS §5-2）
 *
 * ctx.api = { get(path), post(path, body), del(path) }
 *   - body JSON 序列化（post 缺省发 {}）；非 2xx throw Error，err.status = HTTP 状态码
 *   - 响应体优先按 JSON 解析，失败回退原文 —— 既有端点混有纯文本响应（如「保存成功」）
 *   - deps.base 供 node 单测注入绝对前缀；浏览器缺省 ""（相对路径直用）
 */
export function installApi(ctx, deps = {}) {
  const base = deps.base || "";

  async function request(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 200);
      } catch (e) { /* 读取失败可忽略，状态码已足够定位 */ }
      const err = new Error(`API ${method} ${path} 失败 (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
      err.status = res.status;
      throw err;
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  }

  const service = {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body === undefined ? {} : body),
    del: (path) => request("DELETE", path),
  };

  ctx.provide("api", service);
  return service;
}
