/**
 * theme-manager 前端插件 —— 系统主题选择页
 *
 * 渲染规则：
 *   - 第一张卡固定为「默认主题」（无插件，即各页面自带皮肤）
 *   - 其余主题卡 = 枚举 ctx.ui.listComponents() 中 "theme:" 前缀组件，逐个以
 *     factory(bodyHost, { active }) 实例化（各主题插件自带预览卡实现）
 *   - 点「设为系统主题」→ PUT /api/theme/active + localStorage 双写 → 整页刷新
 *     （刷新后各页的主题插件按新选择激活；系统级 = 全场屏幕刷新后同步）
 *
 * 降级：某主题 factory 抛错 → 该卡显示错误提示，不影响其余卡片；API 不可达 →
 * 读 localStorage 兜底并标注"仅本机"。
 */
export default {
  name: "theme-manager-front",
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({
      key: "theme-manager",
      component(el, meta, ctx2) {
        const grid = document.getElementById("theme-grid");
        const statusEl = document.getElementById("theme-status") || (() => {
          const s = document.createElement("p");
          s.id = "theme-status";
          grid.after(s);
          return s;
        })();
        const homeBtn = document.getElementById("home-btn");

        const controller = new AbortController();
        const { signal } = controller;
        const STORAGE_KEY = "ystage:theme";

        homeBtn.addEventListener("click", () => {
          window.location.href = "/m/home";
        }, { signal });

        function setStatus(msg, isError) {
          statusEl.textContent = msg || "";
          statusEl.classList.toggle("error", !!isError);
        }

        /** 写系统级偏好（服务端 + 本机双写）→ 刷新生效 */
        async function applyTheme(id) {
          setStatus("正在切换…");
          let res;
          try {
            res = await fetch("/api/theme/active", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ active: id }),
            });
          } catch (e) {
            // 网络失败（服务端不可达）→ 本机单写兜底，刷新后按本机偏好显示
            localStorage.setItem(STORAGE_KEY, id);
            setStatus(`服务端不可达（${e.message}），已仅在本机生效，即将刷新…`, true);
            setTimeout(() => window.location.reload(), 850);
            return;
          }
          // HTTP 拒绝（服务端可达但明确拒绝）→ 就地报错，不做任何写入
          if (!res.ok) {
            setStatus(`服务端拒绝了该主题（HTTP ${res.status}），未做更改`, true);
            return;
          }
          localStorage.setItem(STORAGE_KEY, id);
          setStatus(`已切换为「${id === "default" ? "默认主题" : id}」，即将刷新…`);
          setTimeout(() => window.location.reload(), 550);
        }

        function makeCard(active) {
          const card = document.createElement("div");
          card.className = "tm-card" + (active ? " tm-card--active" : "");
          return card;
        }

        function makeUseBtn(id, active) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "tm-use-btn";
          btn.textContent = active ? "当前系统主题" : "设为系统主题";
          btn.disabled = active;
          btn.addEventListener("click", () => applyTheme(id), { signal });
          return btn;
        }

        (async () => {
          let active = localStorage.getItem(STORAGE_KEY) || "default";
          let serverOk = false;
          try {
            const data = await ctx2.api.get("/api/theme/active");
            if (data && typeof data.active === "string") {
              active = data.active;
              serverOk = true;
            }
          } catch (e) { /* 接口不可达 → 本机偏好兜底 */ }
          if (!serverOk) setStatus("主题服务不可达：当前按本机记忆显示", true);

          // —— 默认主题卡（静态兜底，非插件） ——
          const defaultCard = makeCard(active === "default");
          defaultCard.innerHTML = `
            <div class="tm-default-body">
              <span class="tm-theme-meta">
                <span class="tm-theme-name">默认主题 <span class="tm-theme-tag">CLASSIC</span></span>
                <span class="tm-theme-desc">各页面自带的传统深色皮肤：照片背景 + 灰阶面板 + 语义色按钮。</span>
                <span class="tm-default-note">适合稳定优先的场合；关闭全部装饰动画与氛围层。</span>
              </span>
            </div>
          `;
          if (active === "default") {
            const badge = document.createElement("span");
            badge.className = "tm-active-badge";
            badge.textContent = "当前主题";
            defaultCard.querySelector(".tm-theme-meta").prepend(badge);
          }
          defaultCard.append(makeUseBtn("default", active === "default"));
          grid.appendChild(defaultCard);

          // —— 主题插件卡（"theme:<id>" 组件，各主题自带预览） ——
          const themeNames = ctx2.ui.listComponents().filter((n) => n.startsWith("theme:"));
          for (const name of themeNames) {
            const id = name.slice("theme:".length);
            const factory = ctx2.ui.component(name);
            if (typeof factory !== "function") continue;

            const card = makeCard(active === id);
            const body = document.createElement("div");
            body.className = "tm-card__body";
            card.appendChild(body);
            try {
              const cleanup = factory(body, { active: active === id, signal });
              if (typeof cleanup === "function") {
                controller.signal.addEventListener("abort", () => {
                  try { cleanup(); } catch (e) { /* 忽略卸载异常 */ }
                }, { once: true });
              }
            } catch (e) {
              body.innerHTML = `<span class="tm-theme-desc">主题「${id}」预览渲染失败：${e.message}</span>`;
              console.error(`[theme-manager] 主题 ${id} 预览失败:`, e);
            }
            card.append(makeUseBtn(id, active === id));
            grid.appendChild(card);
          }

          if (themeNames.length === 0 && active !== "default") {
            setStatus("未发现任何主题插件（主题已按记忆回退显示）", true);
          }
        })().catch((e) => {
          setStatus("页面初始化失败：" + e.message, true);
          console.error("[theme-manager] 初始化失败:", e);
        });

        return () => {
          controller.abort();
          grid.innerHTML = "";
          setStatus("");
        };
      },
    });
  },
};
