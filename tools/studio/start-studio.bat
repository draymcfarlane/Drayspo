@echo off
rem Double-click to run Drayspo Studio. The first run sets everything up.
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.bun\bin;%LOCALAPPDATA%\Microsoft\WinGet\Links;%LOCALAPPDATA%\Programs\Python\Python312;%PATH%"
set "PY="
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PY (py -3.12 -c "" >NUL 2>&1 && set "PY=py -3.12")
if not defined PY (
  echo Python 3.12 is not installed. Run install-tools.bat first.
  pause
  exit /b 1
)
if not exist .venv\Scripts\python.exe %PY% -m venv .venv
.venv\Scripts\python.exe -m pip install -q --disable-pip-version-check -r requirements.txt
.venv\Scripts\python.exe studio.py
if errorlevel 1 pause
