@echo off
setlocal
REM ============================================================
REM  เปิดจอแสดงผลคิว (display) แบบเต็มจอ + เปิดเสียงเรียกอัตโนมัติ
REM  ใช้ flag --autoplay-policy=no-user-gesture-required
REM  เพื่อให้เสียงเล่นได้ทันทีโดยไม่ต้องกด "แตะเพื่อเปิดเสียง"
REM
REM  เลือกจอ (กรณี PC ต่อหลายจอ):  จอ 1 = จอหลัก เสมอ, จากนั้นไล่ซ้าย->ขวา
REM    start-display.cmd        -> จอหลัก (ค่าเริ่มต้น)
REM    start-display.cmd 2      -> จอที่ 2
REM    start-display.cmd 3      -> จอที่ 3  ...
REM  เปิดพร้อมกันหลายจอได้ (แต่ละจอใช้โปรไฟล์แยก)
REM
REM  ออกจากโหมดเต็มจอ: กด Alt+F4
REM ============================================================

set "URL=http://localhost:8888/display/"

REM ---- จอที่ต้องการ (ค่าเริ่มต้น = 1) ----
set "MON=%~1"
if not defined MON set "MON=1"
set "PROFILE=%LOCALAPPDATA%\SiroDisplay\chrome-profile-%MON%"

REM ---- หาพิกัดมุมซ้ายบนของจอที่เลือก (ผ่าน PowerShell) ----
set "POSX=0"
set "POSY=0"
for /f "tokens=1,2 delims=," %%a in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pick-monitor.ps1" %MON%') do (
  set "POSX=%%a"
  set "POSY=%%b"
)
echo เปิดจอแสดงผลที่จอ %MON%  (ตำแหน่ง %POSX%,%POSY%)

REM ---- หา Chrome ก่อน ถ้าไม่เจอใช้ Edge ----
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if not defined BROWSER (
  echo ไม่พบ Chrome หรือ Edge บนเครื่องนี้
  echo ติดตั้ง Google Chrome แล้วลองใหม่อีกครั้ง
  pause
  exit /b 1
)

start "" "%BROWSER%" ^
  --kiosk "%URL%" ^
  --window-position=%POSX%,%POSY% ^
  --autoplay-policy=no-user-gesture-required ^
  --user-data-dir="%PROFILE%" ^
  --no-first-run ^
  --disable-session-crashed-bubble ^
  --disable-infobars ^
  --noerrdialogs

endlocal
