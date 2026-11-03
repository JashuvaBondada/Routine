@echo off
title Michael (n8n) - keep this window open
cd /d "%~dp0"

where node >nul 2>nul || (
  echo Node.js is not installed. Get it from https://nodejs.org ^(LTS^), then double-click this file again.
  start "" https://nodejs.org
  pause & exit /b
)

call n8n --version >nul 2>nul || (
  echo First run: installing n8n. This takes a few minutes...
  call npm install -g n8n
)

netstat -ano | findstr ":5678" | findstr LISTENING >nul && (
  echo Michael is already running.
  start "" http://localhost:5678
  timeout /t 3 >nul & exit /b
)

echo Starting Michael... the n8n page opens in your browser in about 20 seconds.
echo Close this window to stop Michael.
start "" /min cmd /c "timeout /t 20 >nul & start http://localhost:5678"
call n8n start
