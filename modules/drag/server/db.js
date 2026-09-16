/**
 * drag 模块数据库定义
 * 从原 server/database.js 的 drag 条目迁移而来
 */
module.exports = [
  {
    name: "drag-process",
    defaultValue: {
      phase: "idle",
      players: [],
      playerSource: "player1",
      totalCount: 8,
      currentRound: 1,
      totalRounds: 1,
      bracket: { rounds: [] },
      currentMatch: null,
      currentMusic: null,
      currentMusicLib: null,
      matchHistory: [],
      undoStack: [],
      lastUpdate: new Date().toISOString(),
    },
  },
  {
    name: "drag-settings",
    defaultValue: {
      totalCount: 8,
    },
  },
];