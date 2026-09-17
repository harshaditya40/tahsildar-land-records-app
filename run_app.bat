@echo off
title TAHSILDAR - Land Records & Services (SIH26014)
cd /d "%~dp0"

echo ========================================================
echo   TAHSILDAR - Land Records & Services (SIH26014)
echo   Department of Land Resources (DoLR), Govt of India
echo ========================================================
echo.

:: Detect Python executable
set PYTHON_BIN=python
where py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_BIN=py -3
)
if exist "..\.venv\Scripts\python.exe" (
    set PYTHON_BIN="..\.venv\Scripts\python.exe"
)

echo [INFO] Working Directory: %CD%
echo [INFO] Python Executable: %PYTHON_BIN%
echo.
echo Launching server and browser...
echo.

:: Launch browser after 2 seconds delay in background
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000"

:: Start the Python server directly
%PYTHON_BIN% server.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARNING] Could not start with %PYTHON_BIN%. Trying fallback...
    py -3 server.py 2>nul || python server.py
)

echo.
echo Server terminated.
pause
