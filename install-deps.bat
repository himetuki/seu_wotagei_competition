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
echo [提示] 旧版 pkg 需要 Node.js 18，当前版本若不兼容请用 nvm 切换。
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

REM 设置 npm 淘宝镜像加速下载
echo [镜像] 使用阿里云镜像加速...
call npm config set registry https://registry.npmmirror.com
echo.

if exist "node_modules" (
    echo [检测] 依赖已过期，正在更新...
) else (
    echo [安装] 首次安装，正在下载依赖...
)
echo.

REM 安装依赖
call npm install

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

REM 同步 pkg 打包缓存：从 C盘复制到项目内（换机器不用重新下载）
echo.
echo [缓存] 检查 pkg 打包缓存...
set LOCAL_CACHE=%~dp0.pkg-cache
set GLOBAL_CACHE=%USERPROFILE%\.pkg-cache
if not exist "%LOCAL_CACHE%" mkdir "%LOCAL_CACHE%"

set SYNCED=0
if not exist "%LOCAL_CACHE%\v3.4\fetched-v18.5.0-win-x64" (
    if exist "%GLOBAL_CACHE%\v3.4\fetched-v18.5.0-win-x64" (
        xcopy "%GLOBAL_CACHE%\v3.4\fetched-v18.5.0-win-x64" "%LOCAL_CACHE%\v3.4\" /Y /I >nul
        echo   ^> 已同步 Node 18.5 缓存 ^(v3.4^)
        set SYNCED=1
    )
)
if "%SYNCED%"=="0" (
    echo   ^> 项目内缓存已完整，无需同步
    echo   ^> 如需获得缓存，请运行 build.bat 自动下载
)
echo.
echo   启动命令: node server.js

:end
pause
