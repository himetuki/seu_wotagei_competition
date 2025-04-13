/**
 * 数据库初始化工具
 * 替代原来的init-db.js，提供更全面的数据库初始化功能
 */

const path = require("path");
const fs = require("fs");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const { dataDir, serverLog } = require("./utils");

// 要初始化的数据库文件列表
const databases = [
  { name: "winners", defaultValue: {} },
  {
    name: "settings",
    defaultValue: {
      debugMode: false,
      enableAnimations: true,
      language: "zh-CN",
      configFiles: {
        player1: { path: "resource/json/player1.json", lastModified: null },
        player2: { path: "resource/json/player2.json", lastModified: null },
        tricks: { path: "resource/json/tricks.json", lastModified: null },
        musics_list: {
          path: "resource/json/musics_list.json",
          lastModified: null,
        },
        musics_list_ex: {
          path: "resource/json/musics_list_ex.json",
          lastModified: null,
        },
      },
      configBackups: {
        player1: { data: null, lastModified: null },
        player2: { data: null, lastModified: null },
        tricks: { data: null, lastModified: null },
        musics_list: { data: null, lastModified: null },
        musics_list_ex: { data: null, lastModified: null },
      },
    },
  },
  { name: "statistics", defaultValue: { games: 0, battles: 0 } },
  { name: "player1", defaultValue: [] },
  { name: "player2", defaultValue: [] },
  { name: "tricks", defaultValue: [] },
  { name: "tricks_for_group2", defaultValue: [] },
  { name: "musics_list", defaultValue: [] },
  { name: "musics_list_ex", defaultValue: [] },
  {
    name: "award",
    defaultValue: { 1: "冠军奖品", 2: "亚军奖品", 3: "季军奖品" },
  },
  {
    name: "battle-group2-process",
    defaultValue: {
      players: [],
      currentIndex: 0,
      currentTrick: "",
      currentMusic: "",
      crossedTricks: [],
    },
  },
  {
    name: "battle-group2-2-process",
    defaultValue: {
      players: [],
      currentIndex: 0,
      currentTrick: "",
      currentMusic: "",
      crossedTricks: [],
    },
  },
  {
    name: "battle-group1-process",
    defaultValue: {
      currentState: {
        currentChapter: 1,
        currentRound: 1,
        participatedPlayers: [],
        chapterWinners: [],
        players: [],
        currentWinner: null,
        currentPlayers: {
          player1: "",
          player2: "",
        },
        selectedTricks: {
          player1: null,
          player2: null,
        },
      },
      battleRecords: [],
      lastUpdate: new Date().toISOString(),
    },
  },
  {
    name: "battle-group1-2-process",
    defaultValue: {
      currentRound: 1,
      currentBracket: "winner",
      currentMatchIndex: 0,
      currentWinner: null,
      players: [],
      playerStats: {},
      matches: [],
      bracket: {
        winner: [],
        loser: [],
        final: [],
      },
      chapter: 2,
      lastUpdate: new Date().toISOString(),
    },
  },
  {
    name: "battle-group1-pre-process",
    defaultValue: {
      players: [],
      currentIndex: 0,
      currentTrick: "",
      currentMusic: "",
      crossedTricks: [],
    },
  },
  {
    name: "game_2_settings",
    defaultValue: {
      beatsPerMinute: 120,
    },
  },
  {
    name: "game_2_process",
    defaultValue: {
      currentTrick: null,
      isPlaying: false,
      startTime: null,
      endTime: null,
      elapsedTime: 0,
      lastUpdate: null,
    },
  },
  {
    name: "movement_partys",
    defaultValue: {
      records: [],
      lastUpdate: null,
    },
  },
  {
    name: "game_setting",
    defaultValue: {
      "moving-sth": {
        timeLimit: 60,
      },
    },
  },
];

// 初始化所有数据库
function initializeAllDatabases() {
  // 确保数据目录存在
  if (!fs.existsSync(dataDir)) {
    console.log(`创建数据目录: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 初始化所有数据库
  databases.forEach((db) => {
    const dbPath = path.join(dataDir, `${db.name}.json`);
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify(db.defaultValue), "utf8");
      console.log(`创建新数据库文件: ${dbPath}`);
    } else {
      console.log(`数据库文件已存在: ${dbPath}`);
    }

    // 确保数据库格式正确
    try {
      const adapter = new FileSync(dbPath);
      const lowdb = low(adapter);
      lowdb.defaults(db.defaultValue).write();
      console.log(`已初始化数据库: ${db.name}`);
    } catch (error) {
      console.error(`初始化数据库[${db.name}]失败:`, error);
    }
  });

  console.log(`数据库初始化完成，文件位置: ${dataDir}`);
}

// 如果直接运行此脚本，则执行初始化
if (require.main === module) {
  console.log("开始初始化所有数据库...");
  initializeAllDatabases();
  console.log("现在可以启动服务器: node server.js");
}

module.exports = {
  initializeAllDatabases,
  databases,
};
