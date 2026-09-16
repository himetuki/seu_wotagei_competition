/**
 * __MODULE_ID__ 模块前端逻辑
 * 注意：本模块文件与 index.html 同目录，所有引用使用相对或绝对路径（/resource/...）。
 */
document.addEventListener("DOMContentLoaded", () => {
  // 主页按钮
  document.getElementById("home-btn").addEventListener("click", () => {
    window.location.href = "/m/home";
  });

  // 调用模块自带 API（示例，如需后端请在同目录 server/routes.js 中定义）
  fetch("/api/hello")
    .then((r) => r.json())
    .then((data) => {
      document.getElementById("api-status").textContent = `后端响应: ${data.message}`;
    })
    .catch(() => {
      document.getElementById("api-status").textContent = "后端未启动（纯前端模块可忽略）";
    });
});