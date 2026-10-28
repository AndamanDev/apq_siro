@echo off
rem ================================================================
rem  APQueue - queue display (TV) in Edge, no install needed.
rem  Run on the PC that drives the TV. Only needs Edge + speakers/TV sound.
rem
rem    display-edge.bat              open the display full screen
rem    display-edge.bat ip           change the server address
rem    display-edge.bat autostart    also open the display every time Windows starts
rem
rem  Server address: on the server PC itself -> localhost, never asked.
rem  Other machines: asked the first time, then remembered on THIS machine
rem  (%LOCALAPPDATA%\APQueueDisplay\server.txt).
rem
rem  Why the flags:
rem   --autoplay-policy=no-user-gesture-required   the call voice plays without
rem                      anyone touching the screen. A normal browser window
rem                      blocks it - the display then shows a red "sound blocked"
rem                      banner until someone clicks the screen.
rem   --user-data-dir    own profile - the flag above only applies to a fresh
rem                      Edge process, not to an Edge that is already open
rem
rem  Sound comes out of the Windows DEFAULT playback device (taskbar speaker icon).
rem  TV over HDMI: pick the TV there, and check the TV itself is not muted.
rem  Leave full screen: Alt+F4.
rem
rem  No labels/goto on purpose: this file may arrive with LF line endings
rem  (raw download from GitHub) and cmd mis-reads labels in LF files.
rem ================================================================
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title APQueue Display

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" (
  echo  [x] Microsoft Edge not found
  pause
  exit /b 1
)

set "CFG_DIR=%LOCALAPPDATA%\APQueueDisplay"
set "CFG=%CFG_DIR%\server.txt"
if not exist "%CFG_DIR%" mkdir "%CFG_DIR%"

rem ---- server address ----------------------------------------------
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
  echo  Type the IP ^(e.g. 192.168.1.106^) or the full address ^(http://192.168.1.106:8888^)
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
  echo     If the server IP changed: run "display-edge.bat ip"
  echo     Opening anyway - press F5 on the display once the server is up.
  timeout /t 6 >nul
)

rem ---- autostart: a tiny .cmd in this user's Startup folder -----------
if /i "%~1"=="autostart" (
  set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
  > "!STARTUP!\APQueue-Display.cmd" echo @call "%~f0"
  echo  Autostart set: !STARTUP!\APQueue-Display.cmd
)

start "" "%EDGE%" --kiosk "%SERVER%/display/" --edge-kiosk-type=fullscreen ^
  --no-first-run --autoplay-policy=no-user-gesture-required ^
  --disable-session-crashed-bubble --noerrdialogs ^
  --user-data-dir="%LOCALAPPDATA%\APQueueDisplay\edge-profile"
exit /b 0
