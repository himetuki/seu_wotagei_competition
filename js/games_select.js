/**
 * 游戏选择页面 - 处理游戏卡片点击和导航
 */

document.addEventListener("DOMContentLoaded", function () {
  // 获取所有游戏卡片
  const gameCards = document.querySelectorAll(".game-card");
  const homeButton = document.getElementById("home-btn");

  // 为每个游戏卡片添加点击事件监听
  gameCards.forEach((card) => {
    card.addEventListener("click", function () {
      const gameType = this.dataset.game;

      // 根据游戏类型跳转到相应页面
      switch (gameType) {
        case "memory":
          window.location.href = "../html/games/memory_game.html";
          break;
        case "quiz":
          window.location.href = "../html/games/quiz_game.html";
          break;
        case "rhythm":
          window.location.href = "../html/games/rhythm_game.html";
          break;
        case "puzzle":
          window.location.href = "../html/games/puzzle_game.html";
          break;
        case "moving-sth-in-times":
          window.location.href = "../html/games/moving_sth_in_times.html";
          break;
        case "movement-to-tell":
          window.location.href = "../html/games/movement_without_hands.html";
          break;
        default:
          console.error("未知的游戏类型:", gameType);
      }
    });

    // 添加卡片悬停动画效果
    card.addEventListener("mouseover", function () {
      this.style.transform = "translateY(-8px)";
    });

    card.addEventListener("mouseout", function () {
      this.style.transform = "translateY(-5px)";
    });
  });

  // 返回主页的按钮事件监听
  homeButton.addEventListener("click", function () {
    window.location.href = "../html/index.html";
  });

  // 添加页面淡入效果
  document.body.classList.add("fade-in");
});
