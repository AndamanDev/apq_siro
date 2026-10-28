@echo off
REM ============================================================
REM  ตัวเรียกโปรแกรม Kiosk (พิมพ์บัตรคิว)
REM  - ล้าง ELECTRON_RUN_AS_NODE ที่บาง terminal (เช่น VS Code) ตั้งไว้
REM    ซึ่งทำให้ Electron ทำงานเป็น Node ธรรมดาแทนที่จะเปิดเป็นแอป
REM  - หา electron.exe ทั้งใน kiosk\node_modules และ root node_modules
REM    (โปรเจกต์นี้เป็น npm workspaces -> มักถูก hoist ไป root)
REM  ออกจากแอป: Ctrl+Shift+Q   |  หน้าตั้งค่าเครื่องพิมพ์: Ctrl+Shift+P
REM ============================================================
set "ELECTRON_RUN_AS_NODE="

set "ELECTRON="
if exist "%~dp0node_modules\electron\dist\electron.exe" set "ELECTRON=%~dp0node_modules\electron\dist\electron.exe"
if not defined ELECTRON if exist "%~dp0..\node_modules\electron\dist\electron.exe" set "ELECTRON=%~dp0..\node_modules\electron\dist\electron.exe"

if not defined ELECTRON (
  echo [ผิดพลาด] ไม่พบ Electron
  echo ติดตั้ง dependencies ก่อนด้วยคำสั่ง  npm install  ที่โฟลเดอร์รากของโปรเจกต์
  pause
  exit /b 1
)

pushd "%~dp0"
"%ELECTRON%" "%~dp0."
popd
