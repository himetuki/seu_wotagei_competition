/**
 * 直接抽取音乐页面
 */

const state = {
  musicLists: {
    "1yearminus": [],
    "1yearplus": [],
    "1yearplus-ex": [],
  },
  drawnMusic: {
    "1yearminus": null,
    "1yearplus": null,
    "1yearplus-ex": null,
  },
  isPlaying: false,
  isLoaded: false,
};

const DOM = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheDOM();
  loadMusicLists();
  bindEvents();
});

function cacheDOM() {
  DOM.musicPlayer = document.getElementById("music-player");
  DOM.battleStartOverlay = document.getElementById("battle-start-overlay");
  DOM.battleStartText = document.getElementById("battle-start-text");
  DOM.clickToStop = document.getElementById("click-to-stop");

  // 1yearminus
  DOM.draw1yearminusBtn = document.getElementById("draw-1yearminus-btn");
  DOM.battle1yearminusBtn = document.getElementById("battle-1yearminus-btn");
  DOM.musicInfo1yearminus = document.getElementById("music-info-1yearminus");

  // 1yearplus
  DOM.draw1yearplusBtn = document.getElementById("draw-1yearplus-btn");
  DOM.battle1yearplusBtn = document.getElementById("battle-1yearplus-btn");
  DOM.musicInfo1yearplus = document.getElementById("music-info-1yearplus");

  // 1yearplus-ex
  DOM.draw1yearplusExBtn = document.getElementById("draw-1yearplus-ex-btn");
  DOM.battle1yearplusExBtn = document.getElementById("battle-1yearplus-ex-btn");
  DOM.musicInfo1yearplusEx = document.getElementById("music-info-1yearplus-ex");

  DOM.homeBtn = document.getElementById("home-btn");
}

function loadMusicLists() {
  console.log("开始加载音乐列表...");

  Promise.all([
    fetch("../resource/json/musics_list.json")
      .then((r) => {
        console.log("musics_list.json 状态:", r.status);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("加载 musics_list.json 失败:", err);
        return [];
      }),
    fetch("../resource/json/musics_list_2.json")
      .then((r) => {
        console.log("musics_list_2.json 状态:", r.status);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("加载 musics_list_2.json 失败:", err);
        return [];
      }),
    fetch("../resource/json/musics_list_ex.json")
      .then((r) => {
        console.log("musics_list_ex.json 状态:", r.status);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("加载 musics_list_ex.json 失败:", err);
        return [];
      }),
  ])
    .then(([list1, list2, list3]) => {
      state.musicLists["1yearminus"] = list2;
      state.musicLists["1yearplus"] = list1;
      state.musicLists["1yearplus-ex"] = list3;
      state.isLoaded = true;

      console.log("音乐列表加载完成:");
      console.log("- 1yearminus:", list1.length, "首");
      console.log("- 1yearplus:", list2.length, "首");
      console.log("- 1yearplus-ex:", list3.length, "首");
      console.log("完整数据:", state.musicLists);

      if (list1.length === 0 && list2.length === 0 && list3.length === 0) {
        showToast("警告：所有音乐列表为空", "warning");
      } else {
        showToast("音乐列表加载成功", "success");
      }
    })
    .catch((err) => {
      console.error("加载音乐列表失败:", err);
      showToast("音乐列表加载失败", "error");
    });
}

function bindEvents() {
  // 抽取音乐按钮
  DOM.draw1yearminusBtn.addEventListener("click", () =>
    drawMusic("1yearminus"),
  );
  DOM.draw1yearplusBtn.addEventListener("click", () => drawMusic("1yearplus"));
  DOM.draw1yearplusExBtn.addEventListener("click", () =>
    drawMusic("1yearplus-ex"),
  );

  // 比赛开始按钮
  DOM.battle1yearminusBtn.addEventListener("click", () =>
    startBattle("1yearminus"),
  );
  DOM.battle1yearplusBtn.addEventListener("click", () =>
    startBattle("1yearplus"),
  );
  DOM.battle1yearplusExBtn.addEventListener("click", () =>
    startBattle("1yearplus-ex"),
  );

  // 回到主页
  DOM.homeBtn.addEventListener("click", () => {
    window.location.href = "../html/index.html";
  });

  // 双击退出播放
  document.addEventListener("dblclick", handleDoubleClick);
}

function drawMusic(library) {
  console.log("抽取音乐:", library);
  console.log("当前音乐列表:", state.musicLists);

  const list = state.musicLists[library];
  console.log("选中列表:", list);

  if (!list || list.length === 0) {
    showToast("音乐列表为空，请等待加载完成", "error");
    console.error("音乐列表为空:", library);
    return;
  }

  const infoElement = getMusicInfoElement(library);
  const battleBtn = getBattleButton(library);

  // 禁用抽取按钮，防止重复点击
  const drawBtn = getDrawButton(library);
  if (drawBtn) drawBtn.disabled = true;

  // 闪现效果参数
  const flashCount = 15; // 闪现次数
  const flashInterval = 80; // 闪现间隔（毫秒）
  let currentFlash = 0;

  // 闪现动画
  const flashTimer = setInterval(() => {
    // 随机选择一个音乐显示
    const randomIdx = Math.floor(Math.random() * list.length);
    const flashMusic = list[randomIdx];

    if (infoElement) {
      infoElement.textContent = flashMusic;
      infoElement.style.color = "#fbbf24"; // 闪现时为黄色
    }

    currentFlash++;

    // 最后一次闪现，确定最终结果
    if (currentFlash >= flashCount) {
      clearInterval(flashTimer);

      // 最终随机选择
      const finalIdx = Math.floor(Math.random() * list.length);
      const finalMusic = list[finalIdx];
      state.drawnMusic[library] = finalMusic;

      console.log("抽取到的音乐:", finalMusic);

      // 更新最终显示
      if (infoElement) {
        infoElement.textContent = finalMusic;
        infoElement.style.color = "#10b981"; // 最终结果为绿色
      }

      // 启用按钮
      if (battleBtn) {
        battleBtn.disabled = false;
      }
      if (drawBtn) {
        drawBtn.disabled = false;
      }

      showToast(`已抽取音乐：${finalMusic}`, "success");
    }
  }, flashInterval);
}

function getDrawButton(library) {
  switch (library) {
    case "1yearminus":
      return DOM.draw1yearminusBtn;
    case "1yearplus":
      return DOM.draw1yearplusBtn;
    case "1yearplus-ex":
      return DOM.draw1yearplusExBtn;
    default:
      return null;
  }
}

function startBattle(library) {
  const music = state.drawnMusic[library];
  if (!music) {
    showToast("请先抽取音乐", "warning");
    return;
  }

  // 设置音乐路径
  const pathMap = {
    "1yearminus": "../resource/musics/1yearminus/",
    "1yearplus": "../resource/musics/1yearplus/",
    "1yearplus-ex": "../resource/musics/1yearplus_ex/",
  };

  DOM.musicPlayer.src = pathMap[library] + music;

  // 显示 Battle Start 动画
  document.body.classList.add("battle-mode");
  DOM.battleStartOverlay.classList.remove("hidden");
  DOM.battleStartText.classList.remove("hidden");

  // 播放动画文字
  const text = "BATTLE START";
  let current = "",
    i = 0;
  const interval = setInterval(() => {
    if (i < text.length) {
      current += text[i];
      DOM.battleStartText.textContent = current;
      i++;
    } else {
      clearInterval(interval);
    }
  }, 130);

  setTimeout(() => {
    DOM.clickToStop.classList.remove("hidden");
  }, 1500);

  // 4.5秒后开始播放音乐
  setTimeout(() => {
    endBattleStart();
  }, 4500);
}

let battleStartTimer = null;

function endBattleStart() {
  if (!document.body.classList.contains("battle-mode")) return;

  // 隐藏动画元素，但保持 battle-mode 以显示背景
  DOM.battleStartOverlay.classList.add("hidden");
  DOM.battleStartText.classList.add("hidden");
  DOM.clickToStop.classList.add("hidden");
  DOM.battleStartText.textContent = "";

  // 播放音乐
  if (DOM.musicPlayer.src) {
    DOM.musicPlayer.play().catch((err) => {
      console.error("音乐播放失败:", err);
      showToast("音乐播放失败", "error");
    });
    state.isPlaying = true;
    showToast("双击屏幕退出播放", "info");
    
    // 监听音乐播放完毕事件
    DOM.musicPlayer.onended = () => {
      console.log("音乐播放完毕");
      stopPlaying();
    };
  }
}

function stopPlaying() {
  if (!state.isPlaying) return;
  
  DOM.musicPlayer.pause();
  DOM.musicPlayer.currentTime = 0;
  document.body.classList.remove("battle-mode");
  state.isPlaying = false;
  showToast("已退出播放", "info");
}

function handleDoubleClick(e) {
  stopPlaying();
}

function getMusicInfoElement(library) {
  switch (library) {
    case "1yearminus":
      return DOM.musicInfo1yearminus;
    case "1yearplus":
      return DOM.musicInfo1yearplus;
    case "1yearplus-ex":
      return DOM.musicInfo1yearplusEx;
    default:
      return null;
  }
}

function getBattleButton(library) {
  switch (library) {
    case "1yearminus":
      return DOM.battle1yearminusBtn;
    case "1yearplus":
      return DOM.battle1yearplusBtn;
    case "1yearplus-ex":
      return DOM.battle1yearplusExBtn;
    default:
      return null;
  }
}

function showToast(message, type) {
  const toast = document.createElement("div");
  toast.className = "toast " + type;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: 8px;
    z-index: 2000;
    font-weight: bold;
    animation: toast-in 0.3s ease;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
  `;

  if (type === "success") {
    toast.style.backgroundColor = "rgba(34, 139, 34, 0.95)";
    toast.style.color = "white";
  } else if (type === "error") {
    toast.style.backgroundColor = "rgba(178, 34, 34, 0.95)";
    toast.style.color = "white";
  } else if (type === "warning") {
    toast.style.backgroundColor = "rgba(180, 83, 9, 0.95)";
    toast.style.color = "white";
  } else {
    toast.style.backgroundColor = "rgba(30, 64, 175, 0.95)";
    toast.style.color = "white";
  }

  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 2500);
}
