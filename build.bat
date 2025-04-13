@echo off
echo 正在打包Y.Stage 3为独立应用...

REM 确保安装了所有依赖
call npm install

REM 安装pkg全局工具(如果尚未安装)
call npm install -g pkg

REM 使用pkg打包应用
call pkg . --targets node16-win-x64 --output y-stage3.exe

echo 打包完成！
echo 生成的可执行文件：y-stage3.exe

pause
