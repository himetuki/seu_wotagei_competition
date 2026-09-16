/**
 * 定时搬化棒 - UI模块
 * 负责游戏界面交互
 */

// 浮动化棒的状态管理
const FloatingSticks = {
  sticks: [],
  container: null,
  animationId: null,
  active: false,

  // 初始化
  init() {
    this.container = document.querySelector(".floating-sticks-container");
    this.createSticks();

    // 设置容器样式，防止点击事件
    this.container.style.pointerEvents = "none";
    this.container.style.zIndex = "900"; // 设置较高的z-index但低于模态框
  },

  // 创建浮动化棒
  createSticks() {
    // 清空现有的化棒
    this.container.innerHTML = "";
    this.sticks = [];

    // 创建10根化棒 (原来是5根)
    for (let i = 0; i < 10; i++) {
      const stick = document.createElement("div");
      stick.className = "floating-stick";

      // 随机位置和旋转
      const x = Math.random() * (window.innerWidth - 100);
      const y = Math.random() * (window.innerHeight - 150);
      const rotation = Math.random() * 360;

      stick.style.left = `${x}px`;
      stick.style.top = `${y}px`;
      stick.style.transform = `rotate(${rotation}deg)`;

      // 确保每个化棒也不可点击
      stick.style.pointerEvents = "none";

      // 添加到容器
      this.container.appendChild(stick);

      // 记录化棒状态
      this.sticks.push({
        element: stick,
        x,
        y,
        rotation,
        velocityX: (Math.random() - 0.5) * 2, // -1 ~ 1的速度
        velocityY: (Math.random() - 0.5) * 2,
        rotationSpeed: (Math.random() - 0.5) * 1.5, // 旋转速度
      });
    }
  },

  // 启动动画
  start() {
    if (this.active) return;

    this.active = true;
    // 游戏开始时，提高化棒容器的z-index，让它显示在最上层
    this.container.style.zIndex = "900";
    this.animate();
  },

  // 停止动画
  stop() {
    this.active = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  },

  // 动画循环
  animate() {
    if (!this.active) return;

    // 更新每根化棒的位置
    this.sticks.forEach((stick) => {
      // 更新位置
      stick.x += stick.velocityX;
      stick.y += stick.velocityY;
      stick.rotation += stick.rotationSpeed;

      // 边缘碰撞检测与反弹
      if (stick.x <= 0 || stick.x >= window.innerWidth - 30) {
        stick.velocityX *= -1; // 反向
        stick.rotationSpeed = (Math.random() - 0.5) * 1.5; // 随机新旋转速度
      }

      if (stick.y <= 0 || stick.y >= window.innerHeight - 120) {
        stick.velocityY *= -1; // 反向
        stick.rotationSpeed = (Math.random() - 0.5) * 1.5; // 随机新旋转速度
      }

      // 限制在窗口内
      stick.x = Math.max(0, Math.min(window.innerWidth - 30, stick.x));
      stick.y = Math.max(0, Math.min(window.innerHeight - 120, stick.y));

      // 更新DOM
      stick.element.style.left = `${stick.x}px`;
      stick.element.style.top = `${stick.y}px`;
      stick.element.style.transform = `rotate(${stick.rotation}deg)`;
    });

    // 继续动画循环
    this.animationId = requestAnimationFrame(() => this.animate());
  },

  // 窗口大小变化时调整
  handleResize() {
    this.sticks.forEach((stick) => {
      // 确保化棒不超出新的窗口边界
      stick.x = Math.min(stick.x, window.innerWidth - 30);
      stick.y = Math.min(stick.y, window.innerHeight - 120);

      stick.element.style.left = `${stick.x}px`;
      stick.element.style.top = `${stick.y}px`;
    });
  },
};

// 更新得分显示
function updateScoreDisplay() {
  const sticksMovedElement = document.getElementById("sticks-moved");
  sticksMovedElement.textContent = GameState.sticksMoved;
}

// 显示结果模态框
function showResultModal() {
  const resultModal = document.getElementById("result-modal");
  const resultTitle = document.getElementById("result-title");
  const resultMessage = document.getElementById("result-message");

  resultTitle.textContent = "时间到！";
  resultMessage.textContent = "计时结束";

  resultTitle.style.color = "var(--primary-color)";
  resultModal.classList.add("show");

  // 添加动画效果
  addFireworks();

  // 停止化棒动画
  FloatingSticks.stop();
}

// 隐藏结果模态框
function hideResultModal() {
  const resultModal = document.getElementById("result-modal");
  resultModal.classList.remove("show");

  // 如果游戏正在进行，重新启动化棒动画
  if (GameState.isPlaying && !GameState.isPaused) {
    FloatingSticks.start();
  }
}

// 添加动画效果
function addAnimation(element, className, duration) {
  element.classList.add(className);
  setTimeout(() => {
    element.classList.remove(className);
  }, duration);
}

// 添加烟花特效
function addFireworks() {
  const modal = document.getElementById("result-modal");
  const colors = ["#3498db", "#2ecc71", "#e74c3c", "#f39c12", "#9b59b6"];

  // 创建烟花数量
  const fireworksCount = 10;

  for (let i = 0; i < fireworksCount; i++) {
    setTimeout(() => {
      // 创建烟花容器
      const firework = document.createElement("div");
      firework.style.position = "absolute";
      firework.style.left = Math.random() * 100 + "%";
      firework.style.top = Math.random() * 100 + "%";
      firework.style.zIndex = "1100";

      // 烟花动画
      const size = Math.random() * 10 + 10;
      const color = colors[Math.floor(Math.random() * colors.length)];

      firework.innerHTML = `
        <svg width="${size * 2}" height="${size * 2}" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="5" fill="${color}">
            <animate attributeName="r" values="5;30;5" dur="1.5s" repeatCount="1" />
            <animate attributeName="opacity" values="1;0" dur="1.5s" repeatCount="1" />
          </circle>
          ${Array.from({ length: 8 }, (_, i) => {
            const angle = (i * Math.PI) / 4;
            const x1 = 50 + Math.cos(angle) * 10;
            const y1 = 50 + Math.sin(angle) * 10;
            const x2 = 50 + Math.cos(angle) * 40;
            const y2 = 50 + Math.sin(angle) * 40;

            return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2">
              <animate attributeName="opacity" values="0;1;0" dur="1.5s" repeatCount="1" />
              <animate attributeName="stroke-width" values="2;0" dur="1.5s" repeatCount="1" />
            </line>`;
          }).join("")}
        </svg>
      `;

      modal.appendChild(firework);

      // 在动画结束后移除
      setTimeout(() => {
        modal.removeChild(firework);
      }, 1500);
    }, i * 200); // 交错启动烟花
  }
}

// 监听ESC键关闭模态框
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideResultModal();
  }
});

// 窗口大小变化处理
window.addEventListener("resize", () => {
  FloatingSticks.handleResize();
});

// 页面加载完成后初始化浮动化棒
document.addEventListener("DOMContentLoaded", () => {
  FloatingSticks.init();
});
