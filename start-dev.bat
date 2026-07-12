@echo off
setlocal

set "ROOT=%~dp0"

if /i "%~1"=="backend" goto backend
if /i "%~1"=="frontend" goto frontend

if not exist "%ROOT%backend\app\main.py" (
  echo Backend entry was not found: %ROOT%backend\app\main.py
  pause
  exit /b 1
)

if not exist "%ROOT%frontend\package.json" (
  echo Frontend package.json was not found: %ROOT%frontend\package.json
  pause
  exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found in PATH.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found in PATH.
  pause
  exit /b 1
)

echo Starting backend on http://127.0.0.1:8000 ...
start "Software Cup Backend :8000" "%~f0" backend

echo Starting frontend on http://127.0.0.1:3000 ...
start "Software Cup Frontend :3000" "%~f0" frontend

echo.
echo Open http://127.0.0.1:3000/ after the frontend finishes compiling.
echo Keep the two server windows open while using the app.
exit /b 0

:backend
cd /d "%ROOT%backend" || (
  echo Failed to enter backend directory.
  pause
  exit /b 1
)
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
echo.
echo Backend server stopped.
pause
exit /b %ERRORLEVEL%

:frontend
cd /d "%ROOT%frontend" || (
  echo Failed to enter frontend directory.
  pause
  exit /b 1
)
call npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
echo.
echo Frontend server stopped.
pause
exit /b %ERRORLEVEL%
