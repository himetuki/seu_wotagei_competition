/**
 * 体态传技 — 记录页面前端组件（P4 迁移 + P11-R1 响应式改造）
 *
 * 由原 m-w-h_records_data.js + m-w-h_records_ui.js 按加载顺序并入同一闭包。
 * P11-R1：记录表（tbody#records-list）与统计卡片（.records-stats）改为 petite-vue
 * 响应式视图——CRUD 只改 R.records 数组，行/统计自动更新（删 renderRecordsList/
 * updateUI/updateStatsDisplay/escapeHtml 全量重建与手工转义：插值自带转义）；
 * 搜索框经 input 事件桥接进 R.query（实时过滤，替代旧"点按钮/回车才筛"），
 * 行内删除按钮改 @click 指令（删内联 onclick 与 window.confirmDeleteRecord 桥接）。
 * 数字变化动画经 v-effect（依赖 stats 值，值变才脉冲）。
 *
 * cleanup 覆盖：signal 登记的静态监听；响应式视图 dispose；toast/对话框均自清理。
 */

import { icon } from "/web/icons.mjs";
import { createReactiveScope, mountReactiveSafe } from "/web/lib/reactive.mjs";

// 响应式状态（异步就绪前为 null）：records/loading/query 单一事实源，
// filtered()/stats() 为派生方法（替代旧 filteredRecords/stats 存储字段）
let R = null;
const listViews = []; // 两个响应式视图（记录表 + 统计卡）的 dispose（cleanup 统一卸载）
let listsDisposed = false;

// 初始化数据
async function initializeData() {
  try {
    await loadRecords();
    console.log("记录数据初始化完成");
  } catch (error) {
    console.error("初始化记录数据失败:", error);
    showToast("加载记录数据失败", "error");
  }
}

// 加载所有记录
async function loadRecords() {
  if (!R) return;
  R.isLoading = true;

  try {
    const response = await fetch("/api/movement-partys");

    if (!response.ok) {
      throw new Error(`获取记录失败: ${response.status}`);
    }

    const data = await response.json();

    if (data && data.records && Array.isArray(data.records)) {
      // 按时间降序排序，最新的排在前面
      R.records = data.records.sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
      });
    } else {
      R.records = [];
    }

    console.log(`成功加载 ${R.records.length} 条记录`);
  } catch (error) {
    console.error("加载记录数据失败:", error);
    showToast("无法连接到服务器", "error");
    R.records = [];
  } finally {
    R.isLoading = false;
  }
}

// 删除单条记录
async function deleteRecord(id) {
  try {
    showToast("正在删除记录...", "info");

    const response = await fetch(`/api/movement-partys/${id}`, {
      method: "DELETE",
    });

    // 解析JSON响应
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || `删除失败: ${response.status}`);
    }

    // 从记录列表中移除（响应式：行与统计自动更新）
    R.records = R.records.filter((record) => record.id !== id);

    showToast("记录已删除", "success");
    return true;
  } catch (error) {
    console.error("删除记录失败:", error);
    showToast(`删除记录失败: ${error.message}`, "error");
    return false;
  }
}

// 清空所有记录
async function clearAllRecords() {
  try {
    const response = await fetch("/api/clear-movement-partys", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`清空记录失败: ${response.status}`);
    }

    // 清空记录列表（响应式：行与统计自动更新）
    R.records = [];

    showToast("所有记录已清空", "success");
    return true;
  } catch (error) {
    console.error("清空记录失败:", error);
    showToast("清空记录失败", "error");
    return false;
  }
}

// 格式化时间显示（将秒数转换为 MM:SS 格式）
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

// 格式化日期显示
function formatDate(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// toast 桥（P12）：toast 组件实例 onReady 回填；13 个调用点零改动。
// 降级语义：组件缺失（enabled:false / 未注册）→ console.log（toast 属非关键 UX，不保留旧实现副本）
let toastApi = null;
function showToast(message, type = "info", duration = 3000) {
  if (toastApi) toastApi.show(message, type, duration);
  else console.log("[toast]", type, message);
}

// DOM元素引用（原脚本顶层缓存，改为 init 时填充）
const DOM = {};

// 初始化UI事件监听器
function initializeUI(signal) {
  // 搜索：input 事件桥接进响应式 query（实时过滤；搜索按钮/回车成为冗余但无害的
  // 显式触发，保留监听以维持骨架交互契约）
  DOM.searchInput.addEventListener("input", handleSearch, { signal });

  // 搜索按钮
  DOM.searchBtn.addEventListener("click", handleSearch, { signal });

  // 搜索输入框回车事件
  DOM.searchInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  }, { signal });

  // 刷新按钮
  DOM.refreshBtn.addEventListener("click", refreshRecords, { signal });

  // 清空所有记录按钮
  DOM.clearAllBtn.addEventListener("click", confirmClearAllRecords, { signal });

  // 返回按钮
  DOM.backBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  }, { signal });

  // 主页按钮
  DOM.homeBtn.addEventListener("click", () => {
    window.location.href = "/m/home";
  }, { signal });
}

// 处理搜索：命令式桥接——把搜索框当前值同步进响应式 query
function handleSearch() {
  if (R) R.query = DOM.searchInput.value;
}

// 刷新记录
function refreshRecords() {
  // 清空搜索框（同步响应式 query）
  DOM.searchInput.value = "";
  if (R) R.query = "";
  // 重新加载记录
  loadRecords().then(() => {
    showToast("记录已刷新", "info");
  });
}

// 确认清空所有记录
function confirmClearAllRecords() {
  showConfirmDialog(
    "确定要清空所有游戏记录吗？此操作无法撤销。",
    clearAllRecords
  );
}

// 确认删除单条记录
function confirmDeleteRecord(id) {
  showConfirmDialog(
    "确定要删除此条记录吗？",
    () => deleteRecord(parseInt(id)) // 确保id是数字类型
  );
}

// 确认对话框桥（P12）：confirm-dialog 组件实例 onReady 回填；调用点零改动。
// 降级语义：组件缺失（enabled:false / 未注册）→ console.warn 且**不回调 onConfirm**（防误触发删除/清空）
let confirmApi = null;
function showConfirmDialog(message, onConfirm) {
  if (confirmApi) confirmApi(message, onConfirm);
  else console.warn("[records] confirm-dialog 组件不可用，已忽略确认请求");
}

/* =================================================================
 *  组件入口（原两个 DOMContentLoaded 初始化 + 顶层 DOM 缓存，kernel render 时执行）
 * ================================================================= */
export function initMovementTeachingRecords(ctx) {
  // cleanup 契约：静态骨架监听经 signal 登记，重渲染时 abort 统一解绑
  const bindAbort = new AbortController();
  const { signal } = bindAbort;

  // DOM元素引用
  DOM.recordsList = document.getElementById("records-list");
  DOM.totalRecords = document.getElementById("total-records");
  DOM.correctPercentage = document.getElementById("correct-percentage");
  DOM.averageTime = document.getElementById("average-time");
  DOM.searchInput = document.getElementById("search-input");
  DOM.searchBtn = document.getElementById("search-btn");
  DOM.refreshBtn = document.getElementById("refresh-btn");
  DOM.clearAllBtn = document.getElementById("clear-all-btn");
  DOM.backBtn = document.getElementById("back-btn");
  DOM.homeBtn = document.getElementById("home-btn");
  // （confirm-dialog-template <template> 已弃用：P12 起确认弹窗由 component-confirm-dialog 提供）

  // 静态骨架图标：刷新 / 清空 / 搜索按钮（原 HTML 内 emoji，此处注入 Tabler SVG）
  const staticIcons = [
    [DOM.refreshBtn, "refresh", "刷新记录列表"],
    [DOM.clearAllBtn, "trash", "清空所有记录"],
    [DOM.searchBtn, "search", "搜索"],
  ];
  for (const [btn, name, label] of staticIcons) {
    const host = btn && btn.querySelector(".icon");
    if (host) host.innerHTML = icon(name, { size: 16, label });
  }

  // 页面加载完成时初始化（原两个 DOMContentLoaded 按 data→ui 注册序触发）
  // P11-R1：先建响应式视图（记录表 + 统计卡），数据加载写入 R.records 后自动渲染
  const pencilCheck = icon("check", { size: 16 });
  const pencilX = icon("x", { size: 16 });
  const pencilTrash = icon("trash", { size: 16, label: "删除记录" });

  const TABLE_TPL = `
<tr class="loading-row" v-if="isLoading"><td colspan="6">正在加载记录...</td></tr>
<tr class="empty-row" v-if="!isLoading && filtered().length === 0"><td colspan="6">暂无游戏记录</td></tr>
<tr v-for="record in isLoading ? [] : filtered()" :key="record.id" :data-id="record.id">
  <td>{{ record.teamName }}</td>
  <td>{{ record.trickName }}</td>
  <td>{{ formatTime(record.duration) }}</td>
  <td :class="record.isGuessCorrect ? 'correct' : 'incorrect'">
    {{ record.isGuessCorrect ? "猜中" : "未猜中" }}<span v-html="record.isGuessCorrect ? checkIcon : xIcon"></span>
  </td>
  <td>{{ formatDate(record.date) }}</td>
  <td>
    <div class="record-actions">
      <button class="btn-icon btn-delete" title="删除记录" @click="confirmDelete(record.id)">
        <span class="icon" v-html="trashIcon"></span>
      </button>
    </div>
  </td>
</tr>`;

  const STATS_TPL = `
<div class="stat-card">
  <h3>总记录数</h3>
  <p id="total-records" v-effect="pulse($el, stats().totalRecords)">{{ stats().totalRecords }}</p>
</div>
<div class="stat-card">
  <h3>猜中率</h3>
  <p id="correct-percentage" v-effect="pulse($el, stats().correctPercentage)">{{ stats().correctPercentage }}%</p>
</div>
<div class="stat-card">
  <h3>平均时间</h3>
  <p id="average-time" v-effect="pulse($el, stats().averageTime)">{{ formatTime(stats().averageTime) }}</p>
</div>`;

  initializeUI(signal);

  // 复位（P2-2 修复）：同文档重复 render 时从上次 cleanup 状态恢复——
  // 放同步开头（IIFE await 前）：放 await 后会覆盖 cleanup 置位构成竞态
  listsDisposed = false;
  listViews.length = 0;
  toastApi = null;
  confirmApi = null;

  (async () => {
    // P12：toast / confirm-dialog 组件实例化（自挂 body；onReady 回填模块级桥）。cleanup 入
    // listViews 随既有 dispose 统一卸载；组件缺失时各自桥接降级（toast→log / confirm→warn）
    const toastFactory = ctx && ctx.ui ? ctx.ui.component("toast") : null;
    if (toastFactory) {
      listViews.push(
        toastFactory(document.body, { onReady: (api) => { toastApi = api; } }, ctx)
      );
    }
    const confirmFactory = ctx && ctx.ui ? ctx.ui.component("confirm-dialog") : null;
    if (confirmFactory) {
      listViews.push(
        confirmFactory(document.body, { onReady: (api) => { confirmApi = api; } }, ctx)
      );
    }
    R = await createReactiveScope({
      isLoading: true,
      query: "",
      records: [],
      checkIcon: pencilCheck,
      xIcon: pencilX,
      trashIcon: pencilTrash,
      // 派生视图（闭包函数直挂：内部经闭包引用 R，不依赖 this 绑定）
      filtered() {
        const q = (this.query || "").trim().toLowerCase();
        if (!q) return this.records;
        return this.records.filter(
          (record) =>
            String(record.teamName || "").toLowerCase().includes(q) ||
            String(record.trickName || "").toLowerCase().includes(q)
        );
      },
      stats() {
        const records = this.records;
        const totalRecords = records.length;
        let correctPercentage = 0;
        let averageTime = 0;
        if (totalRecords > 0) {
          const correctCount = records.filter(
            (record) => record.isGuessCorrect
          ).length;
          correctPercentage = Math.round((correctCount / totalRecords) * 100);
          averageTime = Math.round(
            records.reduce((sum, record) => sum + record.duration, 0) /
              totalRecords
          );
        }
        return { totalRecords, correctPercentage, averageTime };
      },
      formatTime,
      formatDate,
      confirmDelete: (id) => confirmDeleteRecord(id),
      // 数字变化动画（v-effect 依赖对应 stats 值，值变才脉冲）
      pulse: (el) => {
        el.classList.add("number-change");
        setTimeout(() => el.classList.remove("number-change"), 500);
      },
    });
    // 复位已在 initMovementTeachingRecords 同步开头完成（P2-2 修复）：
    // 此处不再复位——若在 await createReactiveScope 间隙 cleanup 置 listsDisposed=true，
    // 异步块内复位会覆盖之导致双挂载。守卫保留（保护 await 间隙的 cleanup 竞态）。
    if (listsDisposed) return;
    if (DOM.recordsList) {
      listViews.push(mountReactiveSafe(DOM.recordsList, { template: TABLE_TPL, scope: R }));
    }
    const statsHost = document.querySelector(".records-stats");
    if (statsHost) {
      listViews.push(mountReactiveSafe(statsHost, { template: STATS_TPL, scope: R }));
    }
    await initializeData();
  })().catch((e) => console.error("[records] 响应式视图初始化失败:", e));

  return () => {
    // signal 登记的静态骨架监听统一解绑
    if (bindAbort) bindAbort.abort();
    // 响应式视图卸载（petite-vue effects + 指令监听随 unmount 释放）
    listsDisposed = true;
    for (const dispose of listViews) dispose();
    // 桥复位（P2-2 修复）：toast/confirm API 指向已 dispose 的实例——
    // 不置 null 则迟到调用会触碰已卸载 DOM（全屏 opacity:0 遮罩致整页不可点）
    toastApi = null;
    confirmApi = null;
  };
}
