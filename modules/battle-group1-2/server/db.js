/**
 * battle-group1-2 模块数据库定义
 */
module.exports = [
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
];