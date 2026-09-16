/**
 * battle-group1 模块数据库定义
 */
module.exports = [
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
    name: "battle-group1-pre-process",
    defaultValue: {
      players: [],
      currentIndex: 0,
      currentTrick: "",
      currentMusic: "",
      crossedTricks: [],
    },
  },
];