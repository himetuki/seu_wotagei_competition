document.addEventListener("DOMContentLoaded", function () {
  const startButton = document.querySelector(".start-btn");
  const settingButton = document.querySelector(".setting-btn");
  const gameButton = document.querySelector(".game-btn");

  startButton.addEventListener("click", function () {
    window.location.href = "../html/select.html"; // 跳转到组别选择页面
  });

  settingButton.addEventListener("click", function () {
    window.location.href = "../html/setting.html"; // 跳转到设置页面
  });

  gameButton.addEventListener("click", function () {
    window.location.href = "../html/games_select.html"; // 跳转到游戏选择页面
  });
});
