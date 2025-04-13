/**
 * 体态传技 - 数据模块
 * 负责游戏数据的加载和保存
 */

// 全局游戏数据对象
const GameData = window.GameData || {
  tricks: [], // 所有可用技能列表
  currentTrick: null, // 当前选中的技能
  isPlaying: false, // 游戏是否正在进行
  startTime: null, // 游戏开始时间
  endTime: null, // 游戏结束时间
  elapsedTime: 0, // 已经过的时间（秒）
  lastUpdate: null, // 最后更新时间
  stats: {
    totalGames: 0,
    totalTricks: 0,
  },
  settings: {
    beatsPerMinute: 120, // 默认BPM值
  },
};

// 确保GameData始终可用
window.GameData = GameData;

// 加载技能数据
async function loadTricks() {
  try {
    const response = await fetch("../../resource/json/tricks_for_game.json");

    if (!response.ok) {
      throw new Error(`获取技能数据失败: ${response.status}`);
    }

    const data = await response.json();
    GameData.tricks = data;
    console.log(`成功加载 ${data.length} 个技能`);
    return data;
  } catch (error) {
    console.error("加载技能数据出错:", error);
    return [];
  }
}

// 加载当前游戏进度
async function loadGameProgress() {
  try {
    const response = await fetch("http://localhost:3000/api/game_2_process");

    if (!response.ok) {
      console.log("无法从服务器加载游戏进度，创建新游戏");
      return null;
    }

    const data = await response.json();

    // 更新游戏数据
    GameData.currentTrick = data.currentTrick;
    GameData.isPlaying = data.isPlaying;
    GameData.startTime = data.startTime ? new Date(data.startTime) : null;
    GameData.endTime = data.endTime ? new Date(data.endTime) : null;
    GameData.elapsedTime = data.elapsedTime || 0;
    GameData.lastUpdate = data.lastUpdate ? new Date(data.lastUpdate) : null;

    // 加载设置
    if (data.settings) {
      GameData.settings = data.settings;
    }

    console.log("从服务器加载游戏进度:", data);
    return data;
  } catch (error) {
    console.error("加载游戏进度失败:", error);

    // 尝试从localStorage恢复
    try {
      const savedData = localStorage.getItem("movement_without_hands_progress");
      if (savedData) {
        const data = JSON.parse(savedData);

        // 更新游戏数据
        GameData.currentTrick = data.currentTrick;
        GameData.isPlaying = data.isPlaying;
        GameData.startTime = data.startTime ? new Date(data.startTime) : null;
        GameData.endTime = data.endTime ? new Date(data.endTime) : null;
        GameData.elapsedTime = data.elapsedTime || 0;
        GameData.lastUpdate = data.lastUpdate
          ? new Date(data.lastUpdate)
          : null;

        // 加载设置
        if (data.settings) {
          GameData.settings = data.settings;
        }

        console.log("从本地存储恢复游戏进度:", data);
        return data;
      }
    } catch (localError) {
      console.error("从本地存储恢复失败:", localError);
    }

    return null;
  }
}

// 保存游戏进度
async function saveGameProgress() {
  try {
    const progressData = {
      currentTrick: GameData.currentTrick,
      isPlaying: GameData.isPlaying,
      startTime: GameData.startTime ? GameData.startTime.toISOString() : null,
      endTime: GameData.endTime ? GameData.endTime.toISOString() : null,
      elapsedTime: GameData.elapsedTime,
      lastUpdate: new Date().toISOString(),
      settings: GameData.settings,
    };

    // 保存到本地存储作为备份
    localStorage.setItem(
      "movement_without_hands_progress",
      JSON.stringify(progressData)
    );

    // 保存到服务器
    const response = await fetch("http://localhost:3000/api/game_2_process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(progressData),
    });

    if (!response.ok) {
      throw new Error(`保存游戏进度失败: ${response.status}`);
    }

    console.log("游戏进度已保存");
    return true;
  } catch (error) {
    console.error("保存游戏进度出错:", error);
    return false;
  }
}

// 清除游戏进度
async function clearGameProgress() {
  try {
    const response = await fetch(
      "http://localhost:3000/api/clear-game_2_process",
      {
        method: "POST",
      }
    );

    if (!response.ok) {
      throw new Error(`清除游戏进度失败: ${response.status}`);
    }

    // 同时清除本地存储
    localStorage.removeItem("movement_without_hands_progress");

    // 重置游戏数据
    GameData.currentTrick = null;
    GameData.isPlaying = false;
    GameData.startTime = null;
    GameData.endTime = null;
    GameData.elapsedTime = 0;
    GameData.lastUpdate = null;

    console.log("游戏进度已清除");
    return true;
  } catch (error) {
    console.error("清除游戏进度出错:", error);
    return false;
  }
}

// 随机抽取一个技能
function drawRandomTrick() {
  if (!GameData.tricks || GameData.tricks.length === 0) {
    console.error("没有可用的技能数据");
    return null;
  }

  const randomIndex = Math.floor(Math.random() * GameData.tricks.length);
  GameData.currentTrick = GameData.tricks[randomIndex].name;
  return GameData.currentTrick;
}

// 保存游戏设置
GameData.saveSettings = async function (settings) {
  try {
    console.log("正在保存游戏设置...", settings);

    // 确保BPM是整数
    const settingsToSave = { ...settings };
    if (settingsToSave.beatsPerMinute) {
      settingsToSave.beatsPerMinute = parseInt(
        settingsToSave.beatsPerMinute,
        10
      );
    }

    // 更新当前设置
    GameData.settings = { ...GameData.settings, ...settingsToSave };

    // 保存到服务器
    const response = await fetch("http://localhost:3000/api/game_2_settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settingsToSave),
    });

    if (!response.ok) {
      throw new Error(`服务器保存失败 (${response.status})`);
    }

    // 备份到本地存储
    localStorage.setItem(
      "movement_without_hands_settings",
      JSON.stringify(settingsToSave)
    );

    console.log("设置已保存成功");
    return true;
  } catch (error) {
    console.error("保存设置失败:", error);

    // 即使服务器保存失败，也尝试保存到本地存储
    try {
      localStorage.setItem(
        "movement_without_hands_settings",
        JSON.stringify(settings)
      );
      console.log("设置已保存到本地存储(作为备份)");
    } catch (e) {
      console.warn("无法保存设置到本地存储:", e);
    }

    return false;
  }
};

// 加载游戏设置
GameData.loadSettings = async function () {
  try {
    console.log("正在加载游戏设置...");

    // 尝试从服务器加载
    const response = await fetch("http://localhost:3000/api/game_2_settings");

    if (!response.ok) {
      throw new Error(`无法从服务器加载设置 (${response.status})`);
    }

    const settings = await response.json();
    console.log("从服务器加载的设置:", settings);

    // 更新当前设置
    GameData.settings = { ...GameData.settings, ...settings };

    // 确保BPM是整数
    if (GameData.settings.beatsPerMinute) {
      GameData.settings.beatsPerMinute = parseInt(
        GameData.settings.beatsPerMinute,
        10
      );
    }

    console.log("设置已加载:", GameData.settings);
    return GameData.settings;
  } catch (error) {
    console.error("加载设置失败:", error);

    // 尝试从本地存储加载
    try {
      const localSettings = localStorage.getItem(
        "movement_without_hands_settings"
      );
      if (localSettings) {
        const parsedSettings = JSON.parse(localSettings);
        console.log("从本地存储恢复设置:", parsedSettings);

        // 更新当前设置
        GameData.settings = { ...GameData.settings, ...parsedSettings };

        // 确保BPM是整数
        if (GameData.settings.beatsPerMinute) {
          GameData.settings.beatsPerMinute = parseInt(
            GameData.settings.beatsPerMinute,
            10
          );
        }

        return GameData.settings;
      }
    } catch (e) {
      console.warn("无法从本地存储恢复设置:", e);
    }

    return GameData.settings; // 返回当前设置（可能是默认值）
  }
};
