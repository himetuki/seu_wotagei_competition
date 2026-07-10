@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   Y.Stage X 打包工具（旧版 pkg + Node 18）
echo ========================================

REM 安装依赖
call npm install

REM 设置路径
set NODE_MIRROR=https://mirrors.huaweicloud.com/nodejs/
set LOCAL_CACHE=%~dp0.pkg-cache
set GLOBAL_CACHE=%USERPROFILE%\.pkg-cache
if not exist "%LOCAL_CACHE%" mkdir "%LOCAL_CACHE%"

REM ===== 同步缓存：项目内 > C盘 =====
if not exist "%LOCAL_CACHE%\v3.4\fetched-v18.5.0-win-x64" (
    if exist "%GLOBAL_CACHE%\v3.4\fetched-v18.5.0-win-x64" (
        xcopy "%GLOBAL_CACHE%\v3.4\fetched-v18.5.0-win-x64" "%LOCAL_CACHE%\v3.4\" /Y /I >nul
        echo [同步] 从 C盘复制 Node 18.5 缓存
    )
)

REM ===== 检测缓存 =====
if not exist "%LOCAL_CACHE%\v3.4\fetched-v18.5.0-win-x64" (
    echo [下载] 通过 GHProxy 加速下载 Node 18 二进制...
    if not exist "%LOCAL_CACHE%\v3.4" mkdir "%LOCAL_CACHE%\v3.4"
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://ghproxy.com/https://github.com/vercel/pkg-fetch/releases/download/v3.4/fetched-v18.5.0-win-x64' -OutFile '%LOCAL_CACHE%\v3.4\fetched-v18.5.0-win-x64' -UseBasicParsing" 2>nul
    if exist "%LOCAL_CACHE%\v3.4\fetched-v18.5.0-win-x64" (
        echo [完成] Node 18.5 缓存已下载到项目内
    ) else (
        echo [提示] 自动下载失败，请手动下载放到 .pkg-cache\v3.4\ 后重试
        echo         链接: https://ghproxy.com/https://github.com/vercel/pkg-fetch/releases/download/v3.4/fetched-v18.5.0-win-x64
    )
) else (
    echo [缓存] Node 18.5 ^(v3.4^)
)

set PKG_CACHE_PATH=%LOCAL_CACHE%

echo.
echo [内联] 将网页文件打包到 JS 模块中...
call node build-inline.js

echo.
echo [打包] 开始...
del y-stageX.exe 2>nul
call npx pkg server.js --targets node18-win-x64 --output y-stageX.exe

if %errorlevel% equ 0 (
    echo.
    echo 打包完成！
    echo y-stageX .exe
) else (
    echo.
    echo 打包失败！请检查上方错误信息。
    echo 提示：旧版 pkg 需要 Node.js 16/18 环境运行。
)

pause
