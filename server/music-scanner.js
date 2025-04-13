/**
 * 音乐文件扫描模块
 * 用于扫描各音乐目录并更新对应的JSON文件
 */
const fs = require("fs");
const path = require("path");
const { serverLog } = require("./utils");
const { dbManager } = require("./database");

// 音乐目录配置
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

// 获取音频文件
function getAudioFiles(dir) {
  const fullPath = path.join(process.cwd(), dir);

  try {
    if (!fs.existsSync(fullPath)) {
      serverLog(`目录不存在: ${fullPath}`, "warn");
      // 创建目录
      fs.mkdirSync(fullPath, { recursive: true });
      serverLog(`已创建目录: ${fullPath}`, "info");
      return [];
    }

    const files = fs.readdirSync(fullPath);
    const audioFiles = files.filter((file) => {
      const extension = path.extname(file).toLowerCase();
      return [".mp3", ".wav", ".flac", ".ogg"].includes(extension);
    });

    return audioFiles;
  } catch (error) {
    serverLog(`扫描目录失败 ${fullPath}: ${error.message}`, "error");
    return [];
  }
}

// 更新JSON文件
function updateJsonFile(audioFiles, jsonFile) {
  try {
    const jsonPath = path.join(process.cwd(), "resource", "json", jsonFile);

    // 确保目录存在
    const jsonDir = path.dirname(jsonPath);
    if (!fs.existsSync(jsonDir)) {
      fs.mkdirSync(jsonDir, { recursive: true });
    }

    // 写入JSON文件
    fs.writeFileSync(jsonPath, JSON.stringify(audioFiles, null, 2), "utf8");
    serverLog(`已更新JSON文件: ${jsonFile}`, "info");

    // 如果该JSON也在数据库中维护，更新数据库
    const dbName = path.basename(jsonFile, ".json");
    if (dbManager.exists(dbName)) {
      const db = dbManager.get(dbName);
      db.setState(audioFiles).write();
      serverLog(`已更新数据库: ${dbName}`, "info");
    }

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
  const config = MUSIC_DIRS.find((c) => c.dir.includes(dirName));

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
  const config = MUSIC_DIRS.find((c) => c.dir.includes(group));

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
  const recycleDir = path.join(
    process.cwd(),
    "resource",
    "musics",
    "musics_free"
  );
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
  MUSIC_DIRS,
};
