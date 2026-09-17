#!/usr/bin/env node
/**
 * endpoint-diff — HTTP 层行为特征测试（录制 / 回放）
 *
 * 依据 .trae/documents/p1-p2-plan-v2.md Step A0：
 *   --record  在【未改造的 Express 服务】上录制端点行为基线 → scripts/endpoint-baseline.json（F3 移入库）
 *   --compare 起服后重放同一组用例，逐字节对比基线，全绿则退出码 0（HTTP 层切换的合并关口）
 *
 * 覆盖：206 Range、malformed JSON→500、中文文件名（H1）、multipart 上传（H4）、
 *       cors 预检（H7）、HEAD、通配/尾斜杠五态（H5）、DELETE :param、416 无效 Range。
 *
 * 可比对的响应头子集刻意排除（已拍板差异/天然波动项）：
 *   etag（y-router 不发 ETag）、x-powered-by、date、connection、
 *   content-length / transfer-encoding（内容完整性由 body 哈希覆盖）。
 * 易变态（ISO 时间戳、13 位毫秒时间戳、随机 id）在入基线前统一打码。
 *
 * P5a 状态敏感用例（stateful: true，如 /api/drag-process、/api/player1）：业务库/音乐库
 * 内容随使用而变，「任何人写业务数据就打断 compare」是关口弱点 —— 这类用例只对比
 * status + 响应结构形状（顶层类型；对象比键集、数组只比类型），不做逐字节 body 对比。
 */
const { spawn } = require("child_process");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
// F3：基线随库存放在 scripts/（.trae/documents/ 被 .gitignore 整目录忽略，fresh clone 无法回放）
const BASELINE_PATH = path.join(__dirname, "endpoint-baseline.json");
const CHINESE_FILE = "端点测试_中文文件.txt";
const CHINESE_FILE_ABS = path.join(ROOT, "modules", "drag", CHINESE_FILE);
const CHINESE_FILE_CONTENT = "中文内容验证 - endpoint diff";

const args = process.argv.slice(2);
const MODE = args.includes("--record") ? "record" : args.includes("--compare") ? "compare" : null;
const portArgIdx = args.indexOf("--port");
const PORT = portArgIdx >= 0 ? Number(args[portArgIdx + 1]) : 3210;

if (!MODE) {
  console.error("用法: node scripts/endpoint-diff.js --record|--compare [--port 3210]");
  process.exit(2);
}

// ---------- 易变内容打码 ----------
function maskVolatile(text) {
  return String(text)
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z?/g, "<TS>")
    .replace(/\b1[3-9]\d{11}\b/g, "<MS>")
    .replace(/\b(?:127\.0\.0\.1|localhost):\d+\b/g, "<HOST>"); // 回显类端点（test_form_data）含 host:port
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ---------- HTTP 客户端（原生 http，显式头，杜绝客户端自动头差异） ----------
function request({ method = "GET", url, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: PORT, method, path: url, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
        );
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// 参与比对的响应头（小写）。排除项见文件头注释。
const HEADERS_KEEP = [
  "content-type",
  "content-range",
  "accept-ranges",
  "location",
  "access-control-allow-origin",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "access-control-max-age",
  "vary",
];

// P5a：状态敏感用例的「结构形状」描述符 —— 对象比键集（schema 稳定、值随使用变化），
// 数组只比类型（长度随业务数据增减），原始值比 typeof，非 JSON 记为标记串。
function shapeOf(bodyText) {
  try {
    const p = JSON.parse(bodyText);
    if (Array.isArray(p)) return JSON.stringify({ array: true });
    if (p && typeof p === "object") return JSON.stringify({ object: Object.keys(p).sort() });
    return JSON.stringify({ primitive: typeof p });
  } catch (e) {
    return "non-json";
  }
}

function summarize(res, url, c = {}) {
  const isText = /json|html|text|javascript/i.test(String(res.headers["content-type"] || ""));
  const masked = isText ? maskVolatile(res.body.toString("utf8")) : null;
  const stateShape = c.stateful && isText ? shapeOf(res.body.toString("utf8")) : null;
  return {
    url: maskVolatile(url),
    status: res.status,
    headers: Object.fromEntries(
      HEADERS_KEEP.filter((h) => res.headers[h] !== undefined).map((h) => [h, String(res.headers[h])])
    ),
    bodySha256: stateShape !== null
      ? sha256(Buffer.from(stateShape))
      : sha256(Buffer.from(masked !== null ? masked : res.body)),
    bodyLen: res.body.length,
    preview: stateShape !== null ? "<state-shape> " + stateShape.slice(0, 100) : masked !== null ? masked.slice(0, 120) : "<binary>",
  };
}

// ---------- multipart 构造（固定 boundary，保证 Content-Type 回显可复现） ----------
const BOUNDARY = "----YStageEndpointDiffBoundary";
function multipartBody(fields, file) {
  const parts = [];
  for (const [name, value] of Object.entries(fields || {})) {
    parts.push(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    );
  }
  if (file) {
    parts.push(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
    );
  }
  const head = Buffer.from(parts.join(""), "utf8");
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`, "utf8");
  const fileBuf = file ? Buffer.from(file.content, "utf8") : Buffer.alloc(0);
  return { body: Buffer.concat([head, fileBuf, tail]), contentType: `multipart/form-data; boundary=${BOUNDARY}` };
}

// ---------- 用例 ----------
// ctx: { musicUrl, deleteId }（运行时探明；进入基线前已打码）
function buildCases(ctx) {
  const json = (obj) => ({
    body: Buffer.from(JSON.stringify(obj), "utf8"),
    headers: { "content-type": "application/json" },
  });

  const formSimple = multipartBody({ group: "1yearplus", note: "中文注释" });
  const formBadFile = multipartBody(null, {
    field: "file",
    filename: "endpoint-diff-sample.txt",
    contentType: "text/plain",
    content: "这不是音频文件",
  });
  const formAudioFile = multipartBody({ note: "audio" }, {
    field: "file",
    filename: "endpoint-diff-audio.txt",
    contentType: "text/plain",
    content: "fake audio",
  });

  return [
    // —— 先固定 test_database 状态，保证 read/write/delete 可复现 ——
    // write 用例通过 capture 捕获新 id，delete 用例的 url 是函数（运行时取 ctx.deleteId）
    { name: "POST /api/test/reset", method: "POST", url: "/api/test/reset", ...json({}) },
    { name: "GET /api/test/read", method: "GET", url: "/api/test/read" },
    { name: "GET /api/test/status", method: "GET", url: "/api/test/status" },
    {
      name: "POST /api/test/write", method: "POST", url: "/api/test/write", ...json({ content: "endpoint-diff 固定内容" }),
      capture: (res, c) => {
        try {
          const p = JSON.parse(res.body.toString("utf8"));
          const items = p && p.data && p.data.items;
          if (items && items.length) c.deleteId = items[items.length - 1].id;
        } catch (e) { /* 保持默认 */ }
      },
    },
    { name: "DELETE /api/test/delete/:id", method: "DELETE", url: (c) => "/api/test/delete/" + c.deleteId },

    // —— API 代表面 ——（stateful: 状态敏感，只比 status + 结构形状，见文件头 P5a 注）
    { name: "GET /api/modules", method: "GET", url: "/api/modules" },
    { name: "GET /api/drag-settings", method: "GET", url: "/api/drag-settings", stateful: true },
    { name: "GET /api/drag-process", method: "GET", url: "/api/drag-process", stateful: true },
    { name: "GET /api/player1", method: "GET", url: "/api/player1", stateful: true },
    { name: "GET /api/tricks", method: "GET", url: "/api/tricks", stateful: true },
    { name: "GET /api/award", method: "GET", url: "/api/award", stateful: true },
    { name: "GET /resource/json/musics_list.json", method: "GET", url: "/resource/json/musics_list.json" },
    { name: "GET /api/music_count?group", method: "GET", url: "/api/music_count?group=1yearplus", stateful: true },
    { name: "GET /api/music_files?group", method: "GET", url: "/api/music_files?group=1yearplus", stateful: true },

    // —— 页面 / 静态 / 路由形态五态（H5） ——
    { name: "GET /", method: "GET", url: "/" },
    { name: "GET /favicon.ico", method: "GET", url: "/favicon.ico" },
    { name: "GET /m/select（302）", method: "GET", url: "/m/select" },
    { name: "GET /m/select/（尾斜杠）", method: "GET", url: "/m/select/" },
    { name: "GET /m/drag（302）", method: "GET", url: "/m/drag" },
    { name: "GET /m/drag/（index）", method: "GET", url: "/m/drag/" },
    { name: "GET /m/drag/index.html", method: "GET", url: "/m/drag/index.html" },
    // P5a：原 /m/drag/drag_main.js（迁移期旧文件，已删）改指向前端插件本体（长期稳定存在）
    { name: "GET /m/drag/front/plugin.js", method: "GET", url: "/m/drag/front/plugin.js" },
    { name: "GET /m/notexist（404）", method: "GET", url: "/m/notexist" },
    { name: "GET /api/nonexistent（404）", method: "GET", url: "/api/nonexistent" },

    // —— H1 中文文件名：req.path 保持编码，静态层自行解码 ——
    { name: "GET 中文文件名（H1）", method: "GET", url: "/m/drag/" + encodeURIComponent(CHINESE_FILE) },

    // —— H6 malformed JSON → 500 ——
    {
      name: "POST 坏 JSON → 500（H6）",
      method: "POST",
      url: "/api/winners",
      headers: { "content-type": "application/json" },
      body: Buffer.from("{bad json", "utf8"),
    },

    // —— H7 cors 预检 ——
    {
      name: "OPTIONS /api/winners 预检（H7）",
      method: "OPTIONS",
      url: "/api/winners",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    },

    // —— HEAD 与 Range（206 / 416） ——
    { name: "HEAD /", method: "HEAD", url: "/" },
    { name: "GET 音乐 Range 0-99（206）", method: "GET", url: ctx.musicUrl, headers: { range: "bytes=0-99" } },
    { name: "HEAD 音乐 Range 0-99（206）", method: "HEAD", url: ctx.musicUrl, headers: { range: "bytes=0-99" } },
    { name: "GET 音乐全文件", method: "GET", url: ctx.musicUrl },
    { name: "GET 音乐无效 Range（416）", method: "GET", url: ctx.musicUrl, headers: { range: "bytes=999999999-" } },

    // —— H4 multipart（放最后：upload 用例会短暂触碰 musics 目录） ——
    {
      name: "POST /api/test_form_data（multipart H4）",
      method: "POST",
      url: "/api/test_form_data",
      headers: { "content-type": formSimple.contentType },
      body: formSimple.body,
    },
    {
      name: "POST /api/upload_music 非音频（400 拒绝路径）",
      method: "POST",
      url: "/api/upload_music?group=1yearplus",
      headers: { "content-type": formBadFile.contentType },
      body: formBadFile.body,
    },
    {
      name: "POST /api/test_audio_upload 无 group（中间件 next(err)→500）",
      method: "POST",
      url: "/api/test_audio_upload",
      headers: { "content-type": formAudioFile.contentType },
      body: formAudioFile.body,
    },
  ];
}

// ---------- 服务器生命周期 ----------
function waitReady(deadlineMs = 60000) {
  const deadline = Date.now() + deadlineMs;
  async function probe() {
    for (let p = 0; p <= 5; p++) {
      const port = PORT + p;
      const ok = await new Promise((resolve) => {
        const req = http.get({ host: "127.0.0.1", port, path: "/api/modules", timeout: 1500 }, (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        });
        req.on("error", () => resolve(false));
        req.on("timeout", () => { req.destroy(); resolve(false); });
      });
      if (ok) return port;
    }
    return null;
  }
  return new Promise(async (resolve, reject) => {
    while (Date.now() < deadline) {
      const port = await probe();
      if (port) return resolve(port);
      await new Promise((r) => setTimeout(r, 400));
    }
    reject(new Error("服务器未在期限内就绪（端口 " + PORT + " 起连测 6 个端口）"));
  });
}

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });
  const kill = () => {
    try { child.kill(); } catch (e) { /* ignore */ }
    setTimeout(() => {
      if (child.exitCode === null) {
        try {
          spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        } catch (e) { /* ignore */ }
      }
    }, 2000);
  };
  return { child, kill };
}

// ---------- 主流程 ----------
(async function main() {
  fs.writeFileSync(CHINESE_FILE_ABS, CHINESE_FILE_CONTENT, "utf8");
  const { child, kill } = startServer();
  let exitCode = 0;
  try {
    const actualPort = await waitReady();
    if (actualPort !== PORT) {
      console.error(`! 服务器实际监听 ${actualPort}（预期 ${PORT}），脚本仅支持固定端口，退出`);
      process.exit(2);
    }
    console.log(`服务器就绪（端口 ${actualPort}，${MODE === "record" ? "录制" : "回放"}模式）`);

    // 运行时探明：音乐文件 URL（只读）；deleteId 由 write 用例的 capture 捕获
    const ctx = { deleteId: "0", musicUrl: "/" };

    const filesRes = await request({ url: "/api/music_files?group=1yearplus" });
    try {
      const parsed = JSON.parse(filesRes.body.toString("utf8"));
      if (parsed.files && parsed.files.length) {
        ctx.musicUrl = encodeURI("/" + parsed.files[0].path.replace(/\\/g, "/"));
      }
    } catch (e) { /* 用默认值 */ }

    const cases = buildCases(ctx);
    const results = [];
    for (const c of cases) {
      const url = typeof c.url === "function" ? c.url(ctx) : c.url;
      try {
        const res = await request({ method: c.method, url, headers: c.headers, body: c.body });
        if (typeof c.capture === "function") c.capture(res, ctx);
        results.push({ name: c.name, method: c.method, ...summarize(res, url, c) });
        process.stdout.write(".");
      } catch (e) {
        results.push({ name: c.name, method: c.method, url: maskVolatile(url), error: e.message });
        process.stdout.write("x");
      }
    }
    console.log("");

    if (MODE === "record") {
      fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
      fs.writeFileSync(
        BASELINE_PATH,
        JSON.stringify(
          { meta: { recordedAt: new Date().toISOString(), httpLayer: "y-router+cordis", node: process.version, port: PORT }, cases: results },
          null,
          2
        )
      );
      console.log(`已录制 ${results.length} 个用例 → ${path.relative(ROOT, BASELINE_PATH)}`);
    } else {
      const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
      const base = new Map(baseline.cases.map((c) => [c.name, c]));
      let pass = 0;
      const fails = [];
      for (const r of results) {
        const b = base.get(r.name);
        if (!b) { fails.push(`${r.name}: 基线中无此用例`); continue; }
        const diffs = [];
        if (r.error) diffs.push("请求失败: " + r.error);
        if (r.status !== b.status) diffs.push(`status ${b.status} → ${r.status}`);
        for (const h of Object.keys(b.headers)) {
          if (r.headers[h] !== b.headers[h]) diffs.push(`header ${h}: "${b.headers[h]}" → "${r.headers[h]}"`);
        }
        for (const h of Object.keys(r.headers)) {
          if (b.headers[h] === undefined) diffs.push(`header ${h}: (基线无) → "${r.headers[h]}"`);
        }
        if (r.bodySha256 !== b.bodySha256) {
          diffs.push(`body 哈希不一致（基线 ${b.bodySha256.slice(0, 12)}… → 实际 ${r.bodySha256.slice(0, 12)}…）`);
          diffs.push(`  基线预览: ${String(b.preview).replace(/\n/g, "\\n").slice(0, 100)}`);
          diffs.push(`  实际预览: ${String(r.preview).replace(/\n/g, "\\n").slice(0, 100)}`);
        }
        if (diffs.length) fails.push(r.name + ":\n  " + diffs.join("\n  "));
        else pass++;
      }
      console.log(`\n===== endpoint-diff 回放结果: ${pass}/${results.length} 全绿 =====`);
      if (fails.length) {
        console.error(fails.join("\n"));
        exitCode = 1;
      }
    }
  } catch (e) {
    console.error("执行失败:", e.message);
    exitCode = 1;
  } finally {
    kill();
    try { fs.unlinkSync(CHINESE_FILE_ABS); } catch (e) { /* ignore */ }
    // 等子进程退出，避免窗口闪断
    setTimeout(() => process.exit(exitCode), 2500);
  }
})();
