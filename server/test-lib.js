/**
 * 单元测试轻量 harness — 风格跟随 server/cordis/selfcheck.cjs：
 * 原生 node assert + PASS/FAIL 控制台输出 + 进程退出码，无第三方测试框架。
 *
 * 用法（每个 *.test.js）：
 *   const { test, runTests } = require("../test-lib");
 *   test("用例名", async () => { assert.strictEqual(1, 1); });
 *   if (require.main === module) runTests(__filename).then((code) => process.exit(code));
 *
 * runTests 返回 0（全绿）/ 1（有失败）；server/run-unit-tests.js 以子进程逐个
 * 运行全部 *.test.js（进程级隔离：端口、模块状态互不干扰）并聚合退出码。
 */
const assert = require("assert");
const { applyShim } = require("./http/shim");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

/** 暴露生产缺陷的用例：skip 留档（TODO 标注缺陷位置），不计失败 */
test.skip = function skip(name, reason) {
  tests.push({ name, fn: null, skip: reason });
};

async function runTests(label) {
  let failed = 0;
  let skipped = 0;
  console.log(`=== ${label} ===`);
  for (const { name, fn, skip } of tests) {
    if (skip) {
      skipped += 1;
      console.log(`  SKIP ${name} — ${skip}`);
      continue;
    }
    try {
      await fn();
      console.log(`  PASS ${name}`);
    } catch (e) {
      failed += 1;
      console.error(`  FAIL ${name}`);
      const lines = String((e && e.stack) || e).split("\n").slice(0, 5).join("\n    ");
      console.error(`    ${lines}`);
    }
  }
  const run = tests.length - skipped;
  console.log(`${label}: ${run - failed}/${run} passed, ${skipped} skipped`);
  return failed === 0 ? 0 : 1;
}

// ---------- 同步分发辅助（router/shim 层测试用，不占端口） ----------

/** 最小 req 形状：applyShim/YRouter.handle 所需的全部字段 */
function mockReq(method, url, headers) {
  return { method, url, headers: headers || {} };
}

/** 最小 res 形状：setHeader/getHeader/end + 状态/结束标记 + body 收集 */
function mockRes() {
  const res = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    headers: {},
    chunks: [],
  };
  res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; };
  res.getHeader = (k) => res.headers[String(k).toLowerCase()];
  res.end = (chunk) => {
    if (chunk !== undefined && chunk !== null) res.chunks.push(chunk);
    res.writableEnded = true;
    res.headersSent = true;
    return res;
  };
  /** 聚合响应体为 utf8 字符串（Buffer chunk 保字节） */
  res.body = () =>
    Buffer.concat(res.chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(String(c))))).toString("utf8");
  return res;
}

/** 走生产同一路径分发一请求：applyShim（createApp.handle 的入口语义）+ handle */
function dispatch(routerOrApp, method, url, headers) {
  const req = mockReq(method, url, headers);
  const res = mockRes();
  applyShim(req, res);
  routerOrApp.handle(req, res);
  return { req, res };
}

/** applyShim 后直接取 req（shim 层测试：不进入路由分发） */
function shimmedReq(method, url, headers) {
  const req = mockReq(method, url, headers);
  const res = mockRes();
  applyShim(req, res);
  return { req, res };
}

module.exports = { test, runTests, assert, mockReq, mockRes, dispatch, shimmedReq };
