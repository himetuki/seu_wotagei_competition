/**
 * 定时搬化棒 - 数据模块
 * 负责游戏数据的加载和保存
 */

// 默认游戏设置
const defaultSettings = {
  timeLimit: 60,
  interfaceOpacity: 0.8, // 添加默认透明度设置
};

// 加载游戏设置
async function loadGameSettings() {
  try {
    // 尝试从服务器加载设置
    const response = await fetch(
      "http://localhost:3000/api/settings/moving-sth"
    );

    if (response.ok) {
      const settings = await response.json();

      // 更新游戏状态
      GameState.timeLimit = settings.timeLimit || defaultSettings.timeLimit;
      GameState.interfaceOpacity =
        settings.interfaceOpacity !== undefined
          ? settings.interfaceOpacity
          : defaultSettings.interfaceOpacity;

      console.log("从服务器加载设置成功:", settings);
      return settings;
    } else {
      console.log("无法从服务器加载设置，尝试从localStorage加载");

      // 尝试从localStorage加载
      const localSettings = localStorage.getItem("movingSthSettings");
      if (localSettings) {
        const settings = JSON.parse(localSettings);
        GameState.timeLimit = settings.timeLimit || defaultSettings.timeLimit;
        GameState.interfaceOpacity =
          settings.interfaceOpacity !== undefined
            ? settings.interfaceOpacity
            : defaultSettings.interfaceOpacity;
        console.log("从localStorage加载设置成功:", settings);
        return settings;
      }

      // 如果都失败，使用默认设置
      console.log("使用默认设置");
      useDefaultSettings();
      return defaultSettings;
    }
  } catch (error) {
    console.error("加载设置出错:", error);

    // 尝试从localStorage加载
    const localSettings = localStorage.getItem("movingSthSettings");
    if (localSettings) {
      const settings = JSON.parse(localSettings);
      GameState.timeLimit = settings.timeLimit || defaultSettings.timeLimit;
      GameState.interfaceOpacity =
        settings.interfaceOpacity !== undefined
          ? settings.interfaceOpacity
          : defaultSettings.interfaceOpacity;
      console.log("从localStorage加载设置成功:", settings);
      return settings;
    }

    // 使用默认设置
    useDefaultSettings();
    return defaultSettings;
  }
}

// 保存游戏设置
async function saveGameSettings(settings) {
  try {
    // 先保存到本地
    localStorage.setItem("movingSthSettings", JSON.stringify(settings));

    try {
      // 再尝试保存到服务器
      const response = await fetch(
        "http://localhost:3000/api/settings/moving-sth",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settings),
        }
      );

      if (response.ok) {
        console.log("设置保存到服务器成功");
      } else {
        console.log("设置保存到服务器失败，但已保存到本地");
      }
    } catch (serverError) {
      console.log("服务器保存出错，但已保存到本地:", serverError);
    }

    return true;
  } catch (error) {
    console.error("保存设置出错:", error);
    return false;
  }
}

// 使用默认设置
function useDefaultSettings() {
  GameState.timeLimit = defaultSettings.timeLimit;
  GameState.interfaceOpacity = defaultSettings.interfaceOpacity;
}
