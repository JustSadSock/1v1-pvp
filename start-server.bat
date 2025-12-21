@echo off
title 1v1 PVP Game Server

echo ========================================
echo Starting 1v1 PVP Game Server
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if node_modules exists, if not install dependencies
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install dependencies!
        pause
        exit /b 1
    )
    echo.
)

echo Starting game server on http://localhost:3000
echo.

REM Start the Node.js server in a new window
start "1v1 PVP Server" cmd /k "node server.js"

REM Wait a moment for server to start
timeout /t 3 /nobreak >nul

echo Server started!
echo.

REM Check if cloudflared is installed
where cloudflared >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: cloudflared is not installed or not in PATH!
    echo Download from: https://github.com/cloudflare/cloudflared/releases
    echo.
    echo The game server is running locally at http://localhost:3000
    echo But the cloudflared tunnel will not start.
    echo.
    pause
    exit /b 0
)

echo Starting cloudflared tunnel...
echo Configuration: cloudflared-config.yml
echo Tunnel: irgri-tunnel
echo Public URLs: irgri.uk, www.irgri.uk
echo.

REM Start cloudflared tunnel
cloudflared tunnel --config cloudflared-config.yml run irgri-tunnel

echo.
echo ========================================
echo Server stopped.
echo ========================================
pause
