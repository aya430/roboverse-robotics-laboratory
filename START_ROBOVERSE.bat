@echo off
title ROBOVERSE
cd /d "%~dp0frontend"
where node >nul 2>nul || (echo Node.js is required: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Installing dependencies... & call npm install || (pause & exit /b 1))
if not exist dist\index.html (echo Building... & call npm run build || (pause & exit /b 1))
start "" http://localhost:5173
node serve.mjs 5173
pause
