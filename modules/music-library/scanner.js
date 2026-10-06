/**
 * 音乐文件扫描模块（P13 自 server/music-scanner.js 迁入 music-library 功能件）
 * 用于扫描各音乐目录并更新对应的JSON文件。
 * 逻辑逐行原样迁移（仅 require 相对路径随文件位置调整）。
 */
const fs = require("fs");
const path = require("path");
const paths = require("../../server/paths.cjs");
const { serverLog, safeJoin } = require("../../server/utils");
const { dbManager } = require("../../server/database");

// 音乐目录配置（dir 保持 "resource/..." 相对形态：响应回显与 API 出参依赖此字符串；
// 磁盘解析统一经 resolveMusicDir 锚定 RESOURCE_DIR —— dev 下与旧 cwd 拼接逐字节同路径，
// 便携模式下 resource 外置后依然正确）
const MUSIC_DIRS = [
  {
    name: "一年加组第一章节",
    dir: path.join("resource", "musics", "1yearplus"),
    jsonFile: "musics_list.json",
  },
  {
    name: "一年加组第二章节",
    dir: path.join("resource", "musics", "1yearplus_ex"),
    jsonFile: "musics_list_ex.json", // 修正拼写错误：muisic_list_ex.json -> musics_list_ex.json
  },
  {
    name: "一年内组",
    dir: path.join("resource", "musics", "1yearminus"),
    jsonFile: "musics_list_2.json",
  },
  {
    name: "搬化棒游戏音乐",
    dir: path.join("resource", "musics", "games_musics"),
    jsonFile: "games_musics.json",
  },
  {
    name: "音乐回收文件夹",
    dir: path.join("resource", "musics", "musics_free"),
    jsonFile: "musics_free.json",
  },
];

// 组别查询键 → MUSIC_DIRS 条目的精确映射。历史实现为 MUSIC_DIRS.find(
// (c) => c.dir.includes(group)) 的子串匹配（"musics"/"resource" 等父路径字符串会
// 误命中首个条目）；精确键匹配消除误配，并保证目录路径永远取自本常量表——
// group 仅作查找键、不参与任何路径拼接。
const CONFIG_BY_GROUP = new Map(
  MUSIC_DIRS.map((c) => [c.dir.split(path.sep).pop(), c])
);

/**
 * 按组别键精确解析 MUSIC_DIRS 条目（键 = dir 末段：1yearplus / 1yearplus_ex /
 * 1yearminus / games_musics / musics_free）；非字符串或未命中返回 undefined。
 */
function findConfigByGroup(group) {
  return typeof group === "string" ? CONFIG_BY_GROUP.get(group) : undefined;
}

// "resource/..." 相对路径 → RESOURCE_DIR 下的绝对路径（剥去 "resource" 前缀段）
// 入参来自 MUSIC_DIRS 常量与经它匹配的 group；仍经 safeJoin 断言结果不越出 RESOURCE_DIR，
// 防未来调用方传入外部字符串时逃逸到数据层之外。
function resolveMusicDir(dir) {
  const rel = path.relative("resource", dir);
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`非法的音乐目录: ${dir}`);
  }
  return safeJoin(paths.resourceDir(), rel);
}

// 获取音频文件（修复中文编码问题）
function getAudioFiles(dir) {
  const fullPath = resolveMusicDir(dir);

  try {
    if (!fs.existsSync(fullPath)) {
      serverLog(`目录不存在: ${fullPath}`, "warn");
      // 创建目录
      fs.mkdirSync(fullPath, { recursive: true });
      serverLog(`已创建目录: ${fullPath}`, "info");
      return [];
    }

    // 使用 fs.readdirSync({ withFileTypes: true }) 配合 Buffer 方式解决中文编码问题
    let files;
    try {
      files = fs.readdirSync(fullPath, { withFileTypes: true });
    } catch (readErr) {
      serverLog(`读取目录失败 ${fullPath}: ${readErr.message}`, "error");
      return [];
    }

    const audioFiles = files
      .filter((entry) => {
        if (!entry.isFile()) return false;
        const extension = path.extname(entry.name).toLowerCase();
        return [".mp3", ".wav", ".flac", ".ogg"].includes(extension);
      })
      .map((entry) => entry.name);

    return audioFiles;
  } catch (error) {
    serverLog(`扫描目录失败 ${fullPath}: ${error.message}`, "error");
    return [];
  }
}

// database.js 内置 def 名集合：这些列表只走 dbManager（SQLite），不落 json 文件
const DB_MANAGED_NAMES = new Set([
  "winners",
  "settings",
  "statistics",
  "player1",
  "player2",
  "tricks",
  "tricks_for_group2",
  "musics_list",
  "musics_list_ex",
  "award",
]);

// 判断某 json 文件是否属于 db 管理的列表（其数据源由 dbManager 提供）
function isDbManagedName(jsonFile) {
  return DB_MANAGED_NAMES.has(path.basename(jsonFile, ".json"));
}

// db 管理列表的启动期写入（v6.3.1 修复）：dbManager.engine 由 server.js 的
// initializeAllDatabases() 创建，晚于 cordis 装配（"装配先于库初始化"是启动
// 硬约束，见 server.js bootstrap 注释）——启动扫描在插件 apply 内同步执行时
// 引擎尚未就绪，P13 迁移后每次启动的扫描结果都在此静默丢失（曲库停旧值 +
// 每次启动 2 组 ERROR 噪声）。改为有界轮询：引擎就绪后延迟写入；手动重扫
// 路径（引擎已就绪）保持同步语义与原日志。
function writeDbManagedList(dbName, audioFiles, jsonFile) {
  if (dbManager.engine) {
    try {
      dbManager.get(dbName).setState(audioFiles).write();
      serverLog(`已更新数据库: ${dbName}`, "info");
      return true;
    } catch (error) {
      serverLog(`更新数据库失败 ${jsonFile}: ${error.message}`, "error");
      return false;
    }
  }
  const started = Date.now();
  const attempt = () => {
    if (dbManager.engine) {
      try {
        dbManager.get(dbName).setState(audioFiles).write();
        serverLog(`已更新数据库: ${dbName}（启动扫描延迟写入）`, "info");
      } catch (error) {
        serverLog(`启动扫描写入数据库失败 ${jsonFile}: ${error.message}`, "error");
      }
      return;
    }
    if (Date.now() - started > 15000) {
      serverLog(`数据库引擎 15s 未就绪，放弃写入 ${jsonFile}（本次启动扫描未入库）`, "error");
      return;
    }
    setTimeout(attempt, 250);
  };
  setTimeout(attempt, 250);
  return true; // 已排队等待引擎就绪，不按扫描失败上报
}

// 更新 JSON 文件或数据库
function updateJsonFile(audioFiles, jsonFile) {
  try {
    const dbName = path.basename(jsonFile, ".json");

    // db 管理的列表（musics_list / musics_list_ex 等）：仅写 dbManager，不生成 json 文件，
    // 消除"文件与数据库双写不一致"。
    if (isDbManagedName(jsonFile)) {
      return writeDbManagedList(dbName, audioFiles, jsonFile);
    }

    // 非 db 的纯数据文件（musics_list_2 / games_musics / musics_free 等）：
    // 被前端模块直接 fetch，保留原有 json 文件写入逻辑不动。
    const jsonPath = path.join(paths.resourceDir(), "json", jsonFile);

    // 确保目录存在
    const jsonDir = path.dirname(jsonPath);
    if (!fs.existsSync(jsonDir)) {
      fs.mkdirSync(jsonDir, { recursive: true });
    }

    // 写入JSON文件（F5 原子写，对齐 cordis loader persistJson 的既有纪律）：
    // 先写同目录临时文件再 rename 覆盖，写盘/改名中断不再留下截断的半份曲库列表
    // （这些 json 被前端直接 fetch，半份文件 = 页面加载即脏数据）。临时名带 pid
    // 防多进程互踩；任一环节失败兜底直写并 console.error 留痕，成功/失败语义不变。
    const payload = JSON.stringify(audioFiles, null, 2);
    const tmpPath = path.join(jsonDir, `.tmp-${jsonFile}-${process.pid}`);
    try {
      fs.writeFileSync(tmpPath, payload, "utf8");
      try {
        fs.renameSync(tmpPath, jsonPath);
      } catch (renameErr) {
        console.error(`JSON 原子改名失败，兜底直写 ${jsonFile}: ${renameErr.message}`);
        fs.writeFileSync(jsonPath, payload, "utf8");
        try { fs.unlinkSync(tmpPath); } catch (_) { /* 清理失败不影响结果 */ }
      }
    } catch (writeErr) {
      console.error(`JSON 临时文件写入失败，兜底直写 ${jsonFile}: ${writeErr.message}`);
      fs.writeFileSync(jsonPath, payload, "utf8"); // 直写也失败则上抛，由外层 catch 记失败
    }
    serverLog(`已更新JSON文件: ${jsonFile}`, "info");

    return true;
  } catch (error) {
    serverLog(`更新JSON文件失败 ${jsonFile}: ${error.message}`, "error");
    return false;
  }
}

// 扫描所有音乐目录并更新JSON
function scanAllMusicDirs() {
  serverLog("开始扫描所有音乐目录...", "info");

  const results = {};

  for (const config of MUSIC_DIRS) {
    serverLog(`扫描目录: ${config.dir}`, "info");
    const audioFiles = getAudioFiles(config.dir);
    const success = updateJsonFile(audioFiles, config.jsonFile);

    results[config.dir] = {
      count: audioFiles.length,
      success,
      files: audioFiles,
    };

    serverLog(
      `${config.name}音乐扫描完成，发现 ${audioFiles.length} 个文件`,
      "info"
    );
  }

  return results;
}

// 扫描指定音乐目录并更新其JSON
function scanMusicDir(dirName) {
  const config = findConfigByGroup(dirName);

  if (!config) {
    serverLog(`未找到匹配的目录配置: ${dirName}`, "warn");
    return { success: false, error: "未找到匹配的目录配置" };
  }

  serverLog(`扫描目录: ${config.dir}`, "info");
  const audioFiles = getAudioFiles(config.dir);
  const success = updateJsonFile(audioFiles, config.jsonFile);

  return {
    name: config.name,
    dir: config.dir,
    jsonFile: config.jsonFile,
    count: audioFiles.length,
    success,
    files: audioFiles,
  };
}

// 获取音乐目录计数
function getMusicCount(group) {
  const config = findConfigByGroup(group);

  if (!config) {
    return { count: 0, success: false, error: "未找到匹配的目录配置" };
  }

  const audioFiles = getAudioFiles(config.dir);
  return { count: audioFiles.length, success: true };
}

// 初始化扫描（服务器启动时调用）
function initializeMusicScanner() {
  serverLog("初始化音乐扫描模块...", "info");

  // 确保回收文件夹存在
  const recycleDir = path.join(paths.resourceDir(), "musics", "musics_free");
  if (!fs.existsSync(recycleDir)) {
    fs.mkdirSync(recycleDir, { recursive: true });
    serverLog(`已创建音乐回收文件夹: ${recycleDir}`, "info");
  }

  return scanAllMusicDirs();
}

module.exports = {
  scanAllMusicDirs,
  scanMusicDir,
  getMusicCount,
  initializeMusicScanner,
  resolveMusicDir,
  findConfigByGroup,
  MUSIC_DIRS,
};
