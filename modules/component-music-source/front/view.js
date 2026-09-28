/**
 * music-source 组件工厂（L2 组件实现，P16）
 *
 * 职责：**曲库数据源**——经 music-library 的 GET /api/music_files?group=<key> 拉取
 * 曲库分组文件清单，组别可切换/可刷新，经 onReady 交付 getList()/refresh()，
 * 供数据连线把「曲库列表（数据）」接到 draw-machine / music-player 的 items
 * （元素形如 { name: 文件名含扩展名, folder: 组别 key }，itemUrl 拼接
 * /resource/musics/<folder>/<name> 可直接播放——name 必须是真实文件名）。
 *
 * 契约：factory(hostEl, props, ctx) => cleanup
 *   props.title   string            卡片头标题（缺省「曲库数据源」）
 *   props.group   string            组别 key（缺省 "1yearplus"；非下表 key 回落默认）
 *   props.onReady ({ getList, refresh }) 实例就绪即交付（fetch 未完成时 getList 返回 []）
 *
 *   getList() → [{ name, folder }]  当前组曲目快照（浅拷贝，不改内部状态；
 *                                   卸载后仍可安全调用，返回最后一次成功结果）
 *   refresh() → void                重拉当前组
 *
 * 组别 key 与 /resource/musics/ 目录段同名（musics_free 回收站不进选择器）：
 *   1yearplus(一年加组第一章节) / 1yearplus_ex(一年加组第二章节) /
 *   1yearminus(一年内组) / games_musics(搬化棒游戏音乐)
 *
 * 降级：fetch 失败 / 数据畸形 → 状态行显示错误 + 重试按钮，list 置 []，不抛错。
 *
 * 纪律（AGENTS §4.2）：无模块级可变状态（全部状态在工厂局部，多实例不串台）；
 * 监听全传 { signal }；fetch 带 AbortController（卸载/切组中止在飞请求，晚到响应
 * 不写 DOM）；不持久化、无定时器、不碰 body class；用户数据（文件名）一律
 * textContent 写入；不 import 其他组件；无 style.css（暗色朴素外观由宿主页
 * 预览容器的通用按钮/inset 规则提供，类名 .music-source__*）。
 */
import { iconEl } from "/web/icons.mjs";

/** 可选组别（顺序 = 选择器按钮顺序；key 必须与 MUSIC_DIRS 目录段同名） */
const GROUPS = Object.freeze([
  { key: "1yearplus", label: "一年加组第一章节" },
  { key: "1yearplus_ex", label: "一年加组第二章节" },
  { key: "1yearminus", label: "一年内组" },
  { key: "games_musics", label: "搬化棒游戏音乐" },
]);

const DEFAULT_GROUP = "1yearplus";

export function createMusicSource(host, props = {}, ctx) {
  if (!host) return undefined;
  const ctrl = new AbortController(); // 生命周期（监听 + 卸载晚到守卫）
  const { signal } = ctrl;

  // 实例状态（工厂局部）：当前组别 + 曲目清单（folder = 组别 key，消费端据此拼 URL）
  let group = GROUPS.some((g) => g.key === props.group) ? props.group : DEFAULT_GROUP;
  let list = [];
  let loadCtrl = null; // 当前在飞请求的 AbortController（切组/刷新/卸载时中止）

  // ---- 静态骨架（模板串只含可信静态结构；文件名等数据一律 createElement/textContent） ----
  host.innerHTML = `
    <div class="music-source" data-component="music-source">
      <div class="music-source__header">
        <span class="music-source__title"></span>
        <span class="music-source__actions"></span>
      </div>
      <div class="music-source__groups" role="group" aria-label="曲库组别"></div>
      <div class="music-source__status">曲库加载中…</div>
    </div>
  `;
  const root = host.querySelector(".music-source");
  const titleEl = root.querySelector(".music-source__title");
  const actionsEl = root.querySelector(".music-source__actions");
  const groupsEl = root.querySelector(".music-source__groups");
  const statusEl = root.querySelector(".music-source__status");

  titleEl.textContent =
    typeof props.title === "string" && props.title.trim() ? props.title : "曲库数据源";
  const titleIcon = iconEl("music"); // 装饰性图标（相邻有标题文字，无需 label）
  if (titleIcon) titleEl.prepend(titleIcon);

  // 刷新按钮：图标即唯一语义 → 必须给 label（4.1 规范 ②）
  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.className = "music-source__refresh";
  refreshBtn.setAttribute("aria-label", "刷新曲库");
  refreshBtn.title = "刷新曲库";
  const refreshIcon = iconEl("refresh", { label: "刷新曲库" });
  if (refreshIcon) refreshBtn.append(refreshIcon);
  actionsEl.append(refreshBtn);

  // ---- 组别切换按钮组（重渲染以更新高亮；textContent 写中文组名） ----
  function renderGroups() {
    groupsEl.textContent = "";
    for (const g of GROUPS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "music-source__group";
      if (g.key === group) btn.classList.add("music-source__group--active");
      btn.setAttribute("aria-pressed", g.key === group ? "true" : "false");
      btn.dataset.group = g.key;
      btn.textContent = g.label;
      groupsEl.append(btn);
    }
  }

  // ---- 状态行：加载中 / 共 N 曲；失败时错误文案 + 重试按钮 ----
  function renderStatus(text) {
    statusEl.textContent = "";
    statusEl.classList.remove("music-source__status--error");
    const span = document.createElement("span");
    span.className = "music-source__status-text";
    span.textContent = text;
    statusEl.append(span);
  }

  function renderError() {
    const label = (GROUPS.find((g) => g.key === group) || {}).label || group;
    statusEl.textContent = "";
    statusEl.classList.add("music-source__status--error");
    const span = document.createElement("span");
    span.className = "music-source__status-text";
    span.textContent = `曲库加载失败（${label}）`;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "music-source__retry";
    retry.textContent = "重试";
    statusEl.append(span, retry);
  }

  // ---- 拉取当前组（origin 相对路径；在飞请求中止 + 晚到守卫双保险） ----
  function load() {
    if (loadCtrl) loadCtrl.abort();
    loadCtrl = new AbortController();
    const fetchSignal = loadCtrl.signal;
    renderStatus("曲库加载中…");

    fetch(`/api/music_files?group=${encodeURIComponent(group)}`, { signal: fetchSignal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (fetchSignal.aborted || signal.aborted) return; // 切组/卸载后迟到响应不写 DOM
        const files = data && Array.isArray(data.files) ? data.files : [];
        list = files
          .map((f) => ({
            name: String(f && f.name != null ? f.name : ""),
            folder: group, // 消费端 itemFolder(item) 取 item.folder → /resource/musics/<group>/
          }))
          .filter((it) => it.name);
        renderStatus(`共 ${list.length} 曲`);
      })
      .catch(() => {
        if (fetchSignal.aborted || signal.aborted) return; // 中止（切组/卸载）不算失败
        list = [];
        renderError();
      });
  }

  // ---- 交互（事件委托，全部 { signal }；cleanup 一次解绑） ----
  groupsEl.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest(".music-source__group");
      if (!btn || !groupsEl.contains(btn)) return;
      const key = btn.dataset.group;
      if (!GROUPS.some((g) => g.key === key) || key === group) return;
      group = key;
      renderGroups();
      load(); // 切组：load() 内先 abort 在飞请求
    },
    { signal }
  );

  statusEl.addEventListener(
    "click",
    (e) => {
      if (e.target.closest(".music-source__retry")) load();
    },
    { signal }
  );

  refreshBtn.addEventListener("click", load, { signal });

  renderGroups();
  load();

  // ---- API 交付：getList 返回快照（数据连线惰性取值；onReady 抛错不影响组件） ----
  if (typeof props.onReady === "function") {
    try {
      props.onReady({
        getList: () => list.slice(),
        refresh: load,
      });
    } catch (e) {
      console.error("[music-source] onReady 回调抛错:", e);
    }
  }

  // ---- cleanup：解绑监听 + 中止在飞请求（晚到响应经 aborted 守卫不再写 DOM） ----
  return function cleanup() {
    if (loadCtrl) loadCtrl.abort();
    ctrl.abort();
  };
}
