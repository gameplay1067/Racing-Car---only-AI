@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo ULTIMATE RACING - Windows EXE Builder
 echo ==============================================
where node >nul 2>nul || (echo [ERROR] Node.js 20 or newer is required.& pause & exit /b 1)
for /f "tokens=1 delims=v" %%v in ('node -v') do set NODE_VERSION=%%v
for /f "tokens=1 delims=." %%v in ("%NODE_VERSION%") do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 (echo [ERROR] Please install Node.js 20 LTS or newer.& pause & exit /b 1)
where npm >nul 2>nul || (echo [ERROR] npm was not found.& pause & exit /b 1)
if not exist node_modules (
  echo [1/3] Installing dependencies...
  call npm install || (echo [ERROR] npm install failed. Check your internet connection.& pause & exit /b 1)
) else (
  echo [1/3] Dependencies already installed.
)
echo [2/3] Building Next.js static app...
call npm run build || (echo [ERROR] Next.js build failed.& pause & exit /b 1)
echo [3/3] Packaging Windows installer...
call npx electron-builder --win nsis --x64 || (echo [ERROR] EXE packaging failed.& pause & exit /b 1)
echo.
echo BUILD COMPLETE. Check the release folder.
pause
