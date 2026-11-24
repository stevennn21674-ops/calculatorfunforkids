@echo off
cd /d "%~dp0"
title UnStevened Social - Preview (no deploy)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed. Install it from https://nodejs.org then try again.
  pause
  exit /b 1
)
node preview-server.js
pause
