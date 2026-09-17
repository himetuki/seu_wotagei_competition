@echo off
chcp 65001 >nul
echo ========================================
echo   Y.Stage 依赖安装工具
echo ========================================
echo.

REM 检查 Node.js 是否已安装
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

echo [检测] Node.js 已安装:
node -v
echo.
echo [提示] 打包已改为便携式（build.bat = build + scripts/make-portable.js），本脚本仅负责安装依赖。
echo.

REM 检查 package.json 是否存在
if not exist "package.json" (
    echo [错误] 未找到 package.json，请确保在项目根目录运行
    pause
    exit /b 1
)

REM 判断是否需要安装：对比 package.json 是否与上次一致
set NEED_INSTALL=1
if exist "node_modules\.pj-snapshot" (
    fc "package.json" "node_modules\.pj-snapshot" >nul 2>&1
    if %errorlevel% equ 0 set NEED_INSTALL=0
)

if "%NEED_INSTALL%"=="0" (
    echo [跳过] 依赖已是最新，无需重复安装。
    echo.
    echo [提示] 如需强制重装，请删除 node_modules 文件夹后重试。
    pause
    exit /b 0
)

REM 使用阿里云镜像加速（仅本次安装生效，不修改全局 npm 配置）
echo [镜像] 使用阿里云镜像加速...
echo.

if exist "node_modules" (
    echo [检测] 依赖已过期，正在更新...
) else (
    echo [安装] 首次安装，正在下载依赖...
)
echo.

REM 安装依赖
call npm install --registry=https://registry.npmmirror.com

if %errorlevel% equ 0 (
    REM 记录快照，供下次对比
    copy /y "package.json" "node_modules\.pj-snapshot" >nul 2>&1
    echo.
    echo ========================================
    echo   依赖安装完成！
    echo ========================================
) else (
    echo.
    echo [失败] 依赖安装出错，请检查上方错误信息。
    echo [提示] 可尝试: 删除 node_modules 文件夹后重试
    goto :end
)

REM pkg 打包缓存机制已随 P6b 便携化退役（打包走 scripts/make-portable.js）
echo.
echo   启动命令: node server.js

:end
pause
