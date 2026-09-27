@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   Y.Stage X 便携式打包（P6b，无 pkg）
echo ========================================

REM 安装依赖
call npm install

echo.
echo [vendor] 生成 petite-vue 产物（web\lib\vendor\petite-vue.mjs，P12 响应式基座）...
call npm run vendor:petite-vue
if %errorlevel% neq 0 goto :fail

echo.
echo [内核] 构建 cordis 内核（create-root.cjs → server\cordis\kernel.cjs）...
call npm run build:kernel
if %errorlevel% neq 0 goto :fail

echo.
echo [内核] 构建前端内核（web\kernel.mjs → web\dist\kernel.js，/web/kernel.js 发布依赖）...
call npm run build:web
if %errorlevel% neq 0 goto :fail

echo.
echo [核心] 构建服务端 bundle（server.js + 生产依赖 → dist-server\server.bundle.cjs）...
call npm run build:server
if %errorlevel% neq 0 goto :fail

echo.
echo [便携] 组装 YStage3-Portable\（bundle 形态：运行时 + 单文件 app + plugins 组件层 + resource 数据层 + zip）...
call node scripts/make-portable.js --zip
if %errorlevel% neq 0 goto :fail

echo.
echo 打包完成！
echo   产物: YStage3-Portable\        （bundle 形态，整个目录拷走即用，双击 启动YStage.bat）
echo   压缩: YStage3-Portable.zip
echo.
echo 调试源码形态: node scripts/make-portable.js --loose
echo 插件热替换：改 plugins\ 下文件 → 管理页（/m/plugin-manager/）热重载；清单改动即时落盘。
goto :end

:fail
echo.
echo 打包失败！请检查上方错误信息。

:end
pause
