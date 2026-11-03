@echo off
rem Installs Python 3.12 and Bun for Drayspo Studio, logging to install-report.txt.
cd /d "%~dp0"
(
  echo == python ==
  winget install -e --id Python.Python.3.12 --scope user --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
  echo exit %errorlevel%
  echo == bun ==
  winget install -e --id Oven-sh.Bun --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
  echo exit %errorlevel%
  echo == done ==
) > install-report.txt 2>&1
