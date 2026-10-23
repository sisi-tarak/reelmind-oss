@echo off
rem Starts the ReelMind helper. Keep this window open while you use ReelMind.
title ReelMind helper
cd /d "%~dp0helper"
if /i "%~1"=="minimized" (
  node --env-file-if-exists=.env src\cli.js
) else (
  node --env-file-if-exists=.env src\cli.js --open
)
if errorlevel 1 pause
