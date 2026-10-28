@echo off
rem ================================================================
rem  APQueue - kiosk (queue tickets) in Edge, no install needed.
rem  Run on the kiosk machine. Only needs Edge + the receipt printer.
rem
rem    kiosk-edge.bat              open the kiosk full screen
rem    kiosk-edge.bat ip           change the server address
rem    kiosk-edge.bat autostart    also open the kiosk every time Windows starts
rem
rem  Server address: on the server PC itself -> localhost, never asked.
rem  Other machines: asked the first time, then remembered on THIS machine
rem  (%LOCALAPPDATA%\APQueueKiosk\server.txt). Find it on the server PC:
rem  APQueue menu > "server IP". If the server IP changes: "kiosk-edge.bat ip".
rem
rem  Printer: plug the receipt printer into this machine and make it the
rem  Windows DEFAULT printer (Settings > Printers > turn off "Let Windows
rem  manage my default printer"), paper size 80mm / Receipt in its driver.
rem  Test print: press Ctrl+Shift+P on the kiosk screen (no queue is taken).
rem  Leave full screen: Alt+F4.
rem
rem  Why the flags:
rem   --kiosk-printing   ticket goes straight to the default printer, no dialog
rem   --user-data-dir    own profile - the flag above needs it, and staff
rem                      logins stay out of the kiosk
rem   ?print=1           the page prints tickets (without it: test mode, no print)
rem
rem  No labels/goto on purpose: this file may arrive with LF line endings
rem  (raw download from GitHub) and cmd mis-reads labels in LF files.
rem ================================================================
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title APQueue Kiosk

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" (
  echo  [x] Microsoft Edge not found
  pause
  exit /b 1
)

set "CFG_DIR=%LOCALAPPDATA%\APQueueKiosk"
set "CFG=%CFG_DIR%\server.txt"
if not exist "%CFG_DIR%" mkdir "%CFG_DIR%"

rem ---- server address ----------------------------------------------
rem  This machine IS the server -> localhost. Otherwise remembered, or ask.
set "SERVER="
set "ASK=0"
if /i "%~1"=="ip" set "ASK=1"
if "%ASK%"=="0" (
  curl -s -f -m 2 -o nul http://localhost:8888/api/health >nul 2>&1
  if not errorlevel 1 set "SERVER=http://localhost:8888"
)
if "%ASK%"=="0" if not defined SERVER if exist "%CFG%" set /p SERVER=<"%CFG%"
if not defined SERVER set "ASK=1"

if "%ASK%"=="1" (
  echo.
  echo  Server address - on the server PC: APQueue menu ^> "server IP"
  echo  Type the IP ^(e.g. 192.168.1.103^) or the full address ^(http://192.168.1.103:8888^)
  set "IN="
  set /p IN=  Server:
  if not defined IN exit /b 1
  set "IN=!IN: =!"
  echo !IN! | findstr /b /i "http" >nul
  if errorlevel 1 (
    echo !IN! | findstr ":" >nul
    if errorlevel 1 ( set "IN=http://!IN!:8888" ) else ( set "IN=http://!IN!" )
  )
  if "!IN:~-1!"=="/" set "IN=!IN:~0,-1!"
  > "%CFG%" echo !IN!
  set "SERVER=!IN!"
  echo  Saved: !SERVER!
  if /i "%~1"=="ip" exit /b 0
)

rem ---- can we reach the server? (warn, still open - it may be booting) ----
curl -s -f -m 4 -o nul "%SERVER%/api/health" >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [x] Cannot reach %SERVER%
  echo     Is the server PC on, and is this machine on the same network?
  echo     If the server IP changed: run "kiosk-edge.bat ip"
  echo     Opening anyway - press F5 on the kiosk once the server is up.
  timeout /t 6 >nul
)

rem ---- autostart: a tiny .cmd in this user's Startup folder -----------
if /i "%~1"=="autostart" (
  set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
  > "!STARTUP!\APQueue-Kiosk.cmd" echo @call "%~f0"
  echo  Autostart set: !STARTUP!\APQueue-Kiosk.cmd
  echo  ^(some antivirus removes Startup items - if it does not open after reboot, add it again^)
)

start "" "%EDGE%" --kiosk "%SERVER%/kiosk-web/?print=1" --edge-kiosk-type=fullscreen ^
  --no-first-run --kiosk-printing --autoplay-policy=no-user-gesture-required ^
  --user-data-dir="%LOCALAPPDATA%\APQueueKiosk\edge-profile"
exit /b 0
