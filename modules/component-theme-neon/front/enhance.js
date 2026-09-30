/**
 * NEON STAGE 结构增强层 —— 把静态样例（.tmp/design-samples/）的结构元素注入真实页面
 *
 * 为什么需要：主题 v1 只做 CSS 覆盖，而样例的"观感"一半来自结构（单字徽标、VS 徽章、
 * kicker/日文副标行、ENTER 角标、卡片描述、竖排侧轨、入场动画）。本层在主题激活时
 * 按页注入这些节点，复现样例版式；默认主题零影响（不激活不注入，切主题 = 整页重载）。
 *
 * 纪律：
 *   - 全部注入幂等（dataset.nt 标记判重），不绑定事件、不触碰业务逻辑与既有监听；
 *   - 动态渲染容器（#nav-buttons / #mode-sections / #games-grid）由页面插件异步填充，
 *     用 MutationObserver 跟踪装饰（页面生命周期内常驻，随页面卸载释放）；
 *   - 注入节点类名一律 nt- 前缀，显隐全部由 theme.css 挂在 html.theme-neon 下。
 */

/** 建元素小工具 */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** 给一批节点挂入场揭示（错峰 --d；reduced-motion 时 CSS 停用动画） */
function stagger(nodes, step) {
  let i = 0;
  const s = step || 0.07;
  nodes.forEach((n) => {
    if (!n || n.dataset.ntReveal) return;
    n.dataset.ntReveal = "1";
    n.classList.add("nt-reveal");
    n.style.setProperty("--d", (Math.min(i, 10) * s).toFixed(2) + "s");
    i++;
  });
}

/** 竖排日文侧轨（样例氛围件；<1000px 由 CSS 隐藏） */
function ensureRails(leftText, rightText) {
  if (!document.querySelector(".nt-rail--l")) {
    const l = el("span", "nt-rail nt-rail--l", leftText || "ヲタ芸バトルステージ");
    l.setAttribute("aria-hidden", "true");
    document.body.appendChild(l);
  }
  if (!document.querySelector(".nt-rail--r")) {
    const r = el("span", "nt-rail nt-rail--r", rightText || "PEN-LIGHT SYNC 2027");
    r.setAttribute("aria-hidden", "true");
    document.body.appendChild(r);
  }
}

/** 头部三件套：kicker（h1 前插入）+ 日文行（h1 后插入）+ h1 标注类 */
function dressHeader(header, kicker, jp) {
  const h1 = header && header.querySelector("h1");
  if (!h1) return;
  if (kicker && !header.dataset.ntKicker) {
    header.dataset.ntKicker = "1";
    header.insertBefore(el("p", "nt-kicker", kicker), header.firstChild);
  }
  h1.classList.add("nt-title");
  if (jp && !header.dataset.ntJp) {
    header.dataset.ntJp = "1";
    h1.insertAdjacentElement("afterend", el("p", "nt-jp", jp));
  }
}

/** 观察动态容器并立即+持续装饰（decorate 幂等）
 *  注意：去抖用 setTimeout 而非 requestAnimationFrame——后台标签页不触发 rAF，
 *  装饰会被无限推迟（实测踩坑）。 */
function watchDynamic(containerSel, decorate) {
  const host = document.querySelector(containerSel);
  if (!host) return;
  decorate(host);
  let timer = 0;
  const mo = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => decorate(host), 30);
  });
  mo.observe(host, { childList: true, subtree: true });
}

/* ============================================================
 * 各页增强
 * ============================================================ */

function enhanceHome() {
  ensureRails("異度沸騰ヲタ芸団", "STAGE 5 · 2027");
  const header = document.querySelector("header");
  dressHeader(header, "WOTA-GEI BATTLE PLATFORM · 2027", "異度沸騰ヲタ芸団 · 比賽現場");

  // 大标题：末尾独立数字描边化（样例 "Y.Stage 5" 的空心 5）
  const h1 = header && header.querySelector("h1");
  if (h1 && !h1.dataset.ntSplit) {
    const parts = (h1.textContent || "").trim().split(/\s+/);
    const last = parts[parts.length - 1];
    if (parts.length > 1 && /^\d+[.5XIXV]*$/.test(last)) {
      h1.dataset.ntSplit = "1";
      h1.innerHTML = "";
      h1.appendChild(el("span", "nt-title-main", parts.slice(0, -1).join(" ")));
      h1.appendChild(document.createTextNode(" "));
      h1.appendChild(el("span", "nt-outline-num", last));
    }
  }

  // 导航按钮：拉 /api/modules 拿描述，重排为 标徽体 + ENTER 角标（样例卡结构）。
  // 描述列表异步就位：装饰幂等，先结构后补描述（两段式，均由 observer 重入）。
  let moduleList = [];
  const decorateNavCards = () => {
    document.querySelectorAll("#nav-buttons .nav-btn").forEach((btn, i) => {
      const info = moduleList[i];
      if (!btn.dataset.ntCard) {
        btn.dataset.ntCard = "1";
        const label = btn.querySelector(".btn-label");
        const body = el("span", "nt-card-body");
        if (label) body.appendChild(label);
        body.appendChild(el("span", "nt-card-desc", ""));
        btn.appendChild(body);
        btn.appendChild(el("span", "nt-card-en", "ENTER"));
      }
      if (btn.dataset.ntCard && !btn.dataset.ntDesc && info && info.description) {
        btn.dataset.ntDesc = "1";
        const desc = btn.querySelector(".nt-card-desc");
        if (desc) desc.textContent = info.description;
      }
    });
  };
  watchDynamic("#nav-buttons", (host) => {
    if (!host.querySelector(".nt-cta-en-row") && host.querySelector(".start-btn")) {
      const row = el("span", "nt-cta-en-row nt-cta-en", "PRESS TO SELECT");
      host.appendChild(row);
    }
    decorateNavCards();
    stagger([host.querySelector(".start-btn")].filter(Boolean), 0.05);
    stagger([...host.querySelectorAll(".nav-btn")], 0.06);
  });

  fetch("/api/modules")
    .then((r) => (r.ok ? r.json() : null))
    .then((mods) => {
      if (!Array.isArray(mods)) return;
      moduleList = mods
        .filter((m) => (m.nav || []).includes("index") && m.id !== "home" && m.id !== "select")
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      decorateNavCards();
    })
    .catch(() => {});
}

/** 赛制卡单字徽标映射（沿用 select 页配色 class） */
const SELECT_BADGES = {
  "card--g1": "PRF",
  "card--g1-alt": "PF·II",
  "card--g2": "RK·II",
  "card--g2-alt": "RK·I",
  "card--team": "TEAM",
  "card--drag": "DRAG",
  "card--music": "MUS",
};

function enhanceSelect() {
  ensureRails("セレクトモード", "SELECT MODE");
  dressHeader(
    document.querySelector("header"),
    "SELECT MODE",
    "選択してくれ · センテイ"
  );
  watchDynamic("#mode-sections", (host) => {
    host.querySelectorAll(".mode-card").forEach((card) => {
      if (card.dataset.ntCard) return;
      card.dataset.ntCard = "1";
      const cls = [...card.classList].find((c) => SELECT_BADGES[c]);
      const badge = el("span", "nt-badge" + (cls ? " nt-badge--" + cls.replace("card--", "") : ""), cls ? SELECT_BADGES[cls] : "?");
      const icon = card.querySelector(".card-icon");
      card.insertBefore(badge, icon || card.firstChild);
      card.appendChild(el("span", "nt-card-en", "ENTER"));
    });
    stagger([...host.querySelectorAll(".mode-card")], 0.05);
  });
}

function enhanceGames() {
  ensureRails("ゲームセンター", "ARCADE CORNER");
  const header = document.querySelector("header");
  dressHeader(header, "ARCADE CORNER", "光棒猴のゲームコーナー");
  if (header && !header.dataset.ntCoin) {
    header.dataset.ntCoin = "1";
    header.appendChild(el("p", "nt-coin", "— INSERT COIN · PRESS START —"));
  }
  watchDynamic("#games-grid", (host) => {
    host.querySelectorAll(".game-card").forEach((card) => {
      if (card.dataset.ntCard) return;
      card.dataset.ntCard = "1";
      card.appendChild(el("span", "nt-play", "PRESS START"));
    });
    stagger([...host.querySelectorAll(".game-card")], 0.1);
  });
}

/** battle-group 系列：VS 徽章 + 选手侧标 + 面板英文小标 */
const BATTLE_TAGS = {
  "battle-group1": "PROF BATTLE",
  "battle-group1-2": "PROF CH.2",
  "battle-group2": "ROOKIES BATTLE",
  "battle-group2-2": "ROOKIES CH.1",
};

function enhanceBattle(page) {
  ensureRails("バトルステージ", BATTLE_TAGS[page] || "BATTLE");
  const h1 = document.querySelector("header h1");
  if (h1 && !h1.dataset.ntTag) {
    h1.dataset.ntTag = "1";
    h1.classList.add("nt-title");
    h1.appendChild(el("span", "nt-h1-tag", BATTLE_TAGS[page] || "BATTLE"));
  }

  // VS 徽章：插入两名选手卡之间（theme.css 将 .players 改三列竞技场）
  const players = document.querySelector(".players");
  const p1 = document.getElementById("player1");
  const p2 = document.getElementById("player2");
  if (players && p1 && p2 && !document.getElementById("nt-vs-emblem")) {
    const emblem = el("div", "nt-vs-emblem", "VS");
    emblem.id = "nt-vs-emblem";
    emblem.setAttribute("aria-hidden", "true");
    players.insertBefore(emblem, p2);
  }
  [["player1", "PLAYER 1"], ["player2", "PLAYER 2"]].forEach(([id, tag]) => {
    const card = document.getElementById(id);
    if (card && !card.dataset.ntTag) {
      card.dataset.ntTag = "1";
      card.insertBefore(el("span", "nt-side-tag", tag), card.firstChild);
    }
  });

  // 结果面板 / 技池小标（g1 家族：.random-tricks / .music / .tricks-pool）
  const h3Map = [
    [".random-tricks h3", "TRICKS"],
    [".music h3", "MUSIC"],
    [".tricks-pool h3", "TRICK POOL"],
  ];
  h3Map.forEach(([sel, en]) => {
    const h = document.querySelector(sel);
    if (h && !h.dataset.ntEn) {
      h.dataset.ntEn = "1";
      h.appendChild(el("small", "nt-h3-en", en));
    }
  });

  // g2 家族（battle-group2 / 2-2 为抽签式结构）：大字展示位英文小标。
  // 页面脚本会用 textContent 反复写这三个 h3（清空其子节点），故小标插成兄弟节点
  //（h3 之后），判重也看兄弟而非 dataset。
  [["currentPlayer", "PLAYER"], ["currentTrick", "TRICK"], ["currentMusic", "MUSIC"]].forEach(([id, en]) => {
    const h = document.getElementById(id);
    if (!h) return;
    const next = h.nextElementSibling;
    if (next && next.classList && next.classList.contains("nt-h3-en")) return;
    const tag = el("small", "nt-h3-en nt-h3-en--side", en);
    h.insertAdjacentElement("afterend", tag);
  });

  stagger([
    document.querySelector("#battle-info"),
    document.querySelector(".players"),
    document.querySelector(".actions"),
    document.querySelector("#battle-display"),
    document.querySelector(".tricks-pool"),
    document.querySelector("#playerSection"),
    document.querySelector("#trickSection"),
    document.querySelector("#buttons"),
  ].filter(Boolean), 0.08);
}

function enhanceGroupBattle() {
  ensureRails("チームバトル", "TEAM BATTLE");
  const h1 = document.querySelector("header h1");
  if (h1 && !h1.dataset.ntTag) {
    h1.dataset.ntTag = "1";
    h1.classList.add("nt-title");
    h1.appendChild(el("span", "nt-h1-tag", "TEAM BATTLE"));
  }
  [["arena-player1", "PLAYER 1"], ["arena-player2", "PLAYER 2"]].forEach(([id, tag]) => {
    const card = document.getElementById(id);
    if (card && !card.dataset.ntTag) {
      card.dataset.ntTag = "1";
      card.insertBefore(el("span", "nt-side-tag", tag), card.firstChild);
    }
  });
  stagger([
    document.querySelector("#status-section"),
    document.querySelector("#unassigned-section"),
    document.querySelector("#groups-grid"),
    document.querySelector("#battle-arena"),
    document.querySelector("#history-section"),
  ].filter(Boolean), 0.08);
}

function enhanceDrag() {
  ensureRails("トーナメント", "GRAND FINAL");
  const h1 = document.querySelector(".control-bar h1");
  if (h1 && !h1.dataset.ntTag) {
    h1.dataset.ntTag = "1";
    h1.classList.add("nt-title");
  }
  const canvas = document.querySelector(".canvas");
  if (canvas && !canvas.querySelector(".nt-axis-tag")) {
    const t = el("span", "nt-axis-tag", "GRAND FINAL");
    t.setAttribute("aria-hidden", "true");
    canvas.insertBefore(t, canvas.firstChild);
  }
  stagger([
    document.querySelector(".control-bar"),
    document.querySelector(".canvas"),
    document.querySelector(".music-bar"),
  ].filter(Boolean), 0.09);
}

const MD_LIB_TAGS = ["ROOKIES LIB", "PROF LIB", "FINAL FOUR LIB"];

function enhanceMusicDraw() {
  ensureRails("セトリ抽選", "MUSIC DRAW");
  dressHeader(document.querySelector("header"), "MUSIC DRAW · セトリ抽選", "三曲庫同時抽選 · ライブ直結");
  document.querySelectorAll(".music-group").forEach((g, i) => {
    const h2 = g.querySelector("h2");
    if (h2 && !h2.dataset.ntEn) {
      h2.dataset.ntEn = "1";
      h2.appendChild(el("small", "nt-lib-tag", MD_LIB_TAGS[i] || ""));
    }
  });
  stagger([...document.querySelectorAll(".music-group")], 0.1);
}

/* ============================================================
 * 入口：仅主题激活时调用（plugin.js 装配完成同步判定后）
 * ============================================================ */
export function applyEnhancements(page) {
  try {
    if (page === "home") return enhanceHome();
    if (page === "select") return enhanceSelect();
    if (page === "games") return enhanceGames();
    if (/^battle-group/.test(page)) return enhanceBattle(page);
    if (page === "group-battle") return enhanceGroupBattle();
    if (page === "drag") return enhanceDrag();
    if (page === "music-draw") return enhanceMusicDraw();
  } catch (e) {
    console.error("[theme-neon] 结构增强失败（不影响页面功能）:", e);
  }
}
