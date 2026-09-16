/**
 * movement-teaching 模块数据库定义（体态传技）
 */
module.exports = [
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
    name: "game_2_settings",
    defaultValue: {
      beatsPerMinute: 120,
    },
  },
  {
    name: "movement_partys",
    defaultValue: {
      records: [],
      lastUpdate: null,
    },
  },
];