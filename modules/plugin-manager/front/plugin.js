/**
 * modules/plugin-manager 前端插件（P4）
 *
 * key = 模块 id，kernel 装配完按它 render。视图实现整体在 ./view.js
 * （本文件只负责注册组件与 cleanup 契约装配），管理页自身即"界面插件化"示范。
 *
 * cleanup 契约（P3 定稿）：视图内全部监听一律 { signal } + AbortController，
 * 组件 cleanup = abort() + 停止视图内定时器。
 */
import { createManagerView } from "./view.js";

export default {
  name: "plugin-manager",
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({
      key: "plugin-manager",
      component(el, meta, ctx2) {
        const abort = new AbortController();
        const stop = createManagerView({
          root: el,
          api: ctx2.api,
          signal: abort.signal,
        });
        return () => {
          abort.abort();
          if (typeof stop === "function") stop();
        };
      },
    });
  },
};
