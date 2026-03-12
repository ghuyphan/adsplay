@echo off
setlocal

cd /d %~dp0

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in your PATH.
    echo Please install Node.js from https://nodejs.org/
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

node launch-adplay.cjs %*
if %errorlevel% neq 0 (
    echo.
    echo AdPlay could not start.
    echo Press any key to close this window.
    pause >nul
    exit /b %errorlevel%
)
