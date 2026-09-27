/**
 * web/components/compose.mjs —— 页面组件装配器（L1 共享资产，P11-B7）
 *
 * 分层归属：L1（与 /web/icons.mjs、/web/lib/*.mjs、/web/components/grid.css 同级）——
 * 可直接 import、不注册插件、不进清单；可在 node 中单测（web/components/compose.test.js）。
 *
 * 准入理由（P11 §3 问 6 纯函数条款）：本模块**不持有任何跨调用状态** —— 无监听、无定时器、
 * 无网络、无模块级可变变量；DOM 编排（查宿主、调工厂）全部发生在 mountFromConfig(spec)
 * 调用内，状态只存在于该次调用的局部变量（cleanups 数组随返回值移交调用方）。
 * 它自己不产生生命周期，生命周期由调用方（L4 页面插件）持有与释放 —— 故合规。
 *
 * API：
 *   mountFromConfig(spec) → { cleanups, mountAll(), cleanup() }
 *   spec = {
 *     el,              // 页面根容器（#plugin-root）
 *     meta,            // front.json 中该页面条目的 config（可 null）
 *     ctx,             // 前端 ctx（内部只用 ctx.ui.component(name)）
 *     label,           // 日志前缀，如 "battle-group1"（所有 warn 消息用 `[${label}]`）
 *     defaultSlots,    // 缺省插槽表 { "<组件名>": "[data-slot=x]" | [sel, ...] }
 *     runtimeProps,    // 可选：运行时 props，按组件名索引；值 = 对象（单/共用）| 数组（多实例按下标）
 *     names,           // 可选：只装配这些组件名（对 derive 出的 compose 取交集，保持其顺序；
 *                      //       传 [] = 本页零装配，供"仅某页变体需要组件"的模块表达条件装配）
 *   }
 *   cleanups      已实例化组件的 cleanup 函数数组（按挂载顺序；调用方亦可自行 push 页面 cleanup）
 *   mountAll()    执行一次装配循环（返回前已调用一次；**非幂等**：再次调用会在同一宿主再建一个实例
 *                 并追加 cleanup —— 旧的监听、`body` class 等副作用需先 cleanup() 释放，
 *                 切勿当作"重渲染"使用）
 *   cleanup()     逆序调用 cleanups 并清空；单个抛错不影响其余（console.error 上报，不向外抛）
 *
 * front.json 声明语义（页面条目的 `config`，即 spec.meta）：
 *   compose    ["music-player", "draw-machine"]          需要装配的组件名（顺序即挂载顺序）
 *   slots      { "music-player": "[data-slot=music]" }   组件宿主选择器（**键 = 组件名**；
 *                                                        值可为字符串或数组 = 多实例）
 *   components { "music-player": { …props } }            组件静态 props（值可为对象 = 单/共用，
 *                                                        或数组 = 多实例按下标）
 *   · slots = { ...defaultSlots, ...(meta.slots || {}) } —— 模块缺省表兜底，清单可覆盖/追加；
 *     模块的 DEFAULT_SLOTS 常量留在模块内（属模块语义，不是共享逻辑）
 *   · compose 缺省 = Object.keys(slots)；staticProps = meta.components || {}
 *   · 宿主查找顺序：`el.querySelector(selector) || document.querySelector(selector)`
 *   · props 优先级：静态 props < 运行时 props（浅合并）；多实例按**实例下标一一对应**取
 *     （propsAtIndex 语义：数组取第 i 项，非对象项按 {} 处理；对象视为所有实例共用）
 *   · factory(host, props, ctx) 返回函数才入 cleanups
 *
 * 优雅降级（P11 §3 问 6）：ctx.ui.component(name) 未注册（组件被 enabled:false 禁用）→
 * factory 为 null → warn 后跳过该组件（插槽留空），页面其余部分照常工作；槽位未声明、
 * 宿主不存在、选择器非法（非字符串 / DOM 拒收）一律 warn 后跳过；meta / slots / components /
 * runtimeProps 畸形（null、数组、原始值）一律按空表降级（slots 畸形即回退 defaultSlots），
 * **装配器自身的畸形输入一律降级不抛错**（选择器解析、cleanup 调用各自 try/catch 自吞）；
 * 而**组件工厂 `factory(host, props, ctx)` 自身抛错则向上传播、不被吞**（降级归调用方，
 * 见 web/ui.mjs 契约），以免掩盖组件真实缺陷；抛错时已挂载实例会被逆序清理后再抛出
 * （失败即整体回滚：要么全部挂好、要么一个不留），调用方无需（也无法）做半挂清理。
 *
 * 参考实例（P11-B7 接入的 L4 页面插件的 front/plugin.js）：
 *   battle-group1 / battle-group1-2 / battle-group2 / battle-group2-2 / drag（单实例同构）
 *   music-draw（多实例：3 曲库 = 3 个 music-player + 3 个 draw-machine）
 *   group-battle（三页分发：runtimeProps 来自 detectPage()，页面 cleanup 另行 try/catch 逆序）
 *   movement-teaching（三页分发 + 条件装配：names 传空数组即"本页零装配"）
 */

/** 表类型入参归一：非"普通对象"（null / 数组 / 原始值）一律降级为空表 */
function tableOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** 按实例下标取 props：数组取第 i 项（非对象项 → {}），对象/其它 → 该对象或 {}（所有实例共用） */
function propsAtIndex(value, index) {
  if (Array.isArray(value)) {
    const item = value[index];
    return item && typeof item === "object" ? item : {};
  }
  return value && typeof value === "object" ? value : {};
}

/**
 * 按 front.json config 装配 L2 组件到页面插槽。
 * @param {object} spec 见文件头 API 段
 * @returns {{ cleanups: Function[], mountAll: () => void, cleanup: () => void }}
 */
export function mountFromConfig(specRaw = {}) {
  // 默认参只覆盖 undefined；null / 原始值等畸形入参一律降级为空 spec（装配器自身的畸形输入一律不抛错）
  const spec = specRaw && typeof specRaw === "object" ? specRaw : {};
  const el = spec.el || null;
  const ctx = spec.ctx || {};
  const label = spec.label || "compose";
  const meta = tableOf(spec.meta);
  const slots = { ...tableOf(spec.defaultSlots), ...tableOf(meta.slots) };
  const staticProps = tableOf(meta.components);
  const runtimeProps = tableOf(spec.runtimeProps);
  const derived = Array.isArray(meta.compose) && meta.compose.length ? meta.compose : Object.keys(slots);
  if (Array.isArray(meta.compose) && meta.compose.length === 0 && Object.keys(slots).length > 0) {
    // 显式空数组落入"缺省"分支是易踩的语义陷阱（与 names: [] 的"零装配"相反）——
    // 保留既有缺省语义不变，但必须让清单作者看得见
    console.warn(
      `[${label}] config.compose 为空数组：按缺省语义装配全部 slots（如需本页零装配请改用 names: []）`,
    );
  }
  const filter = Array.isArray(spec.names) ? spec.names : null;
  if (filter) {
    // 交集语义：names 中的未知名字若静默丢弃，条件装配（movement-teaching 三页分发）会无声退化为
    // "零装配"——逐条 warn；names: [] 是合法用法（本页零装配），不产生告警
    for (const name of filter) {
      if (!derived.includes(name)) {
        console.warn(`[${label}] names 中的组件 "${name}" 不在 compose/slots 中，已忽略`);
      }
    }
  }
  const compose = filter ? derived.filter((name) => filter.includes(name)) : derived;
  const cleanups = [];

  /** 宿主查找：页面根内优先，回退全文档（兼容插槽在 #plugin-root 之外的既有约定）；非法选择器 → null */
  function findHost(selector) {
    if (typeof selector !== "string" || !selector) return null;
    try {
      if (el && typeof el.querySelector === "function") {
        const inRoot = el.querySelector(selector);
        if (inRoot) return inRoot;
      }
      if (typeof document !== "undefined" && document.querySelector) {
        return document.querySelector(selector);
      }
    } catch (e) {
      // 畸形选择器（如 "[") 在真实 DOM 上抛 SyntaxError —— 降级为"宿主不存在"
      console.warn(`[${label}] 插槽选择器 ${selector} 非法，跳过挂载`);
      return null;
    }
    return null;
  }

  /** 装配循环（compose 顺序 = 挂载顺序；每一项独立降级） */
  function mountAll() {
    for (const name of compose) {
      const ui = ctx && ctx.ui;
      const factory = ui && typeof ui.component === "function" ? ui.component(name) : null;
      if (typeof factory !== "function") {
        console.warn(`[${label}] 组件 "${name}" 未注册或已禁用，插槽留空（优雅降级）`);
        continue;
      }
      const selector = slots[name];
      if (!selector) {
        console.warn(`[${label}] 组件 "${name}" 未在 config.slots 声明插槽，跳过挂载`);
        continue;
      }
      const multi = Array.isArray(selector);
      const selectors = multi ? selector : [selector];
      if (selectors.length === 0) {
        // 数组恒真值，上方的 !selector 守卫拦不住 []——静默零挂载缺告警，排查无线索
        console.warn(`[${label}] 组件 "${name}" 的插槽选择器为空数组，跳过挂载`);
        continue;
      }
      selectors.forEach((sel, index) => {
        const host = findHost(sel);
        if (!host) {
          console.warn(
            multi
              ? `[${label}] 组件 "${name}" 的第 ${index + 1} 个插槽 ${sel} 不存在，跳过挂载`
              : `[${label}] 组件 "${name}" 的插槽 ${sel} 不存在，跳过挂载`,
          );
          return;
        }
        // 静态 props < 运行时 props；多实例按下标一一对应
        const props = {
          ...propsAtIndex(staticProps[name], index),
          ...propsAtIndex(runtimeProps[name], index),
        };
        // 工厂抛错 = 失败即整体回滚：逆序释放已挂实例（单错隔离）后，原错误对象原样向上传播
        // （不吞、不包新 Error，以免掩盖组件真实缺陷；返回值随异常丢失，故回滚必须在抛出前完成）
        let dispose;
        try {
          dispose = factory(host, props, ctx);
        } catch (e) {
          releaseCleanups();
          throw e;
        }
        if (typeof dispose === "function") cleanups.push(dispose);
      });
    }
  }

  /** 逆序释放 cleanups（后进先出：多实例按实例逆序、组件间按挂载逆序）；单错隔离，不向外抛 */
  function releaseCleanups() {
    while (cleanups.length) {
      const fn = cleanups.pop();
      if (typeof fn !== "function") continue;
      try {
        fn();
      } catch (e) {
        console.error(`[${label}] 组件 cleanup 失败:`, e);
      }
    }
  }

  mountAll(); // 立即装配一次：页面 flow 紧随其后创建，需拿到组件 onReady 已回填的 bridge

  return {
    cleanups,
    mountAll,
    cleanup: releaseCleanups,
  };
}
