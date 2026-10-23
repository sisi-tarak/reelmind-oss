@echo off
rem Gets the latest ReelMind and updates its packages.
cd /d "%~dp0"
where git >nul 2>nul && git pull
call npm install --no-fund --no-audit
echo.
echo ReelMind is up to date. Start it from the desktop shortcut.
pause
