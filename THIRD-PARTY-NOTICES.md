# 第三方许可与来源声明（THIRD-PARTY NOTICES）

本文件记录 Y.Stage3 内置的第三方资产、其版权归属与许可条款。所有第三方资产均为
**本地内置、离线可用**：不含 CDN 引用、不含运行时网络请求、不含需 `npm install` 的运行时依赖。

---

## Tabler Icons

- **用途**：全项目统一图标基座。UI 图标（导航、按钮、状态位、表格操作等）以内联 SVG
  形式内置于 `web/icons.mjs`，供各模块前端插件 `import { icon, iconEl, ICON_NAMES } from "/web/icons.mjs"` 使用。
- **来源**：<https://tabler.io/icons> · 仓库 <https://github.com/tabler/tabler-icons>
- **内置版本**：`@tabler/icons` v3.46.0（outline 风格），构建期一次性提取 SVG path 数据，
  仅保留本项目实际使用的 61 枚图标子集（非全量导入），运行期零依赖。
- **许可**：MIT License，全文见下方。

```
MIT License

Copyright (c) 2020-2026 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

> 维护约定：新增图标时，从官方图标集提取准确 path 数据写入 `web/icons.mjs`（禁止手绘/凭记忆），
> 并保持 `ICON_NAMES` 与需求清单一致；`web/icons.test.js` 会守门清单完整性与下游引用正确性。

---

## petite-vue

- **用途**：`web/lib/reactive.mjs` 响应式装配基座的底层（细粒度状态 → DOM 同步，AGENTS §4.3）。
  供 plugin-manager 整页视图与 setting 三个列表编辑器使用；经 `web/lib/vendor/petite-vue.mjs`
  以浏览器原生 ESM 按需动态加载，未使用响应式的页面不产生任何请求。
- **来源**：<https://github.com/vuejs/petite-vue>
- **版本**：0.4.1（npm devDependencies 精确锁定）。`web/lib/vendor/petite-vue.mjs` 为**构建产物**
  （gitignored，`npm run vendor:petite-vue` 经 esbuild 从 node_modules 生成），运行期零网络依赖。
- **许可**：MIT License（Copyright (c) 2020-present Evan You），全文与上方 Tabler 段的 MIT
  条款相同。
