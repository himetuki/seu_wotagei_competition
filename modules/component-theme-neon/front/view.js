/**
 * theme:neon 预览卡组件（theme-manager 页实例化）
 *
 * 契约：factory(hostEl, props) => cleanup | void
 *   props.active  当前是否为系统主题（由 theme-manager 传入，决定卡片选中态徽标）
 * 卡片布局由 theme-manager 的 style.css 提供（.tm-card / .tm-card__body 等），
 * 本文件只填内容（名称 / 标语 / 色板 / 特性清单）——两主题（默认/霓虹）下均正常显示。
 */

export function createThemePreview(host, props = {}) {
  const active = !!props.active;

  host.innerHTML = `
    <div class="tm-theme-meta">
      <span class="tm-theme-name">霓虹舞台 <span class="tm-theme-tag">NEON STAGE</span></span>
      <span class="tm-theme-desc">WOTA live 会场 × 电竞转播 HUD：荧光棒人浪、舞台光束、网格地板、扫描线质感；标题流光 + 霓虹描边面板；赛制语义色按组别分光。</span>
      <span class="tm-swatches" aria-hidden="true">
        <i style="--v:#00e5ff"></i><i style="--v:#ff2e88"></i><i style="--v:#8f6bff"></i><i style="--v:#3dffa0"></i><i style="--v:#ffd166"></i><i style="--v:#ff8a3d"></i>
      </span>
      <span class="tm-theme-features">覆盖页面：首页 / 赛制选择 / 游戏中心 / 四个单人对战 / 团体赛 / 对阵树 / 音乐抽取；比赛模式自动退场只留背景图</span>
    </div>
  `;

  if (active) {
    const badge = document.createElement("span");
    badge.className = "tm-active-badge";
    badge.textContent = "当前主题";
    host.querySelector(".tm-theme-meta").prepend(badge);
  }

  return () => {
    host.innerHTML = "";
  };
}
