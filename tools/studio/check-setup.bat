@echo off
rem Writes setup-report.txt listing the tools Drayspo Studio needs.
cd /d "%~dp0"
(
  echo == python ==
  where python 2^>^&1
  python --version 2^>^&1
  echo == py launcher ==
  py -0p 2^>^&1
  echo == tkinter ==
  python -c "import tkinter; print(tkinter.TkVersion)" 2^>^&1
  echo == git ==
  where git 2^>^&1
  git --version 2^>^&1
  git config --global user.name 2^>^&1
  git config --global credential.helper 2^>^&1
  echo == bun ==
  where bun 2^>^&1
  bun --version 2^>^&1
  if exist "%USERPROFILE%\.bun\bin\bun.exe" echo found %USERPROFILE%\.bun\bin\bun.exe
  echo == winget ==
  winget --version 2^>^&1
  echo == repo ==
  git -C "%~dp0..\.." status --short --branch 2^>^&1
  git -C "%~dp0..\.." remote -v 2^>^&1
  echo == done ==
) > setup-report.txt
