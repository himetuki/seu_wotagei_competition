document.addEventListener("DOMContentLoaded", function () {
  // 获取按钮元素
  const group1PreButton = document.querySelector(".group1-pre-btn");
  const group1Button = document.querySelector(".group1-btn");
  const group2Button = document.querySelector(".group2-btn");

  // 检查按钮是否存在，并在控制台输出调试信息
  console.log("一年内组第二章节按钮:", group1PreButton);
  console.log("一年加组按钮:", group1Button);
  console.log("一年内组按钮:", group2Button);

  // 修改为跳转到一年内组第二章节页面
  if (group1PreButton) {
    group1PreButton.addEventListener("click", function (event) {
      // 左键点击 - 修改为battle-group2-2.html
      window.location.href = "../html/battle-group2-2.html";
    });

    group1PreButton.addEventListener("mousedown", function (event) {
      if (event.button === 1) {
        // 中键点击
        window.location.href = "../html/performance.html";
      }
    });
  } else {
    console.error("找不到一年内组第二章节按钮元素");
  }

  // 为一年加组按钮添加事件
  if (group1Button) {
    group1Button.addEventListener("click", function () {
      // 左键点击
      window.location.href = "../html/battle-group1.html";
    });

    group1Button.addEventListener("mousedown", function (event) {
      if (event.button === 1) {
        // 中键点击
        window.location.href = "../html/performance.html";
      }
    });
  } else {
    console.error("找不到一年加组按钮元素");
  }

  // 为一年内组按钮添加事件
  if (group2Button) {
    group2Button.addEventListener("click", function () {
      // 左键点击
      window.location.href = "../html/battle-group2.html";
    });

    group2Button.addEventListener("mousedown", function (event) {
      if (event.button === 1) {
        // 中键点击
        window.location.href = "../html/performance.html";
      }
    });
  } else {
    console.error("找不到一年内组按钮元素");
  }
});
