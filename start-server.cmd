@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Queue 2026 - Server (แม่ข่าย)
REM ============================================================
REM  เปิดเครื่องแม่ข่าย (server) ของระบบคิว APQueue
REM  - รัน Node.js เสิร์ฟพอร์ต 8888 ให้ทุกเครื่องใน LAN เข้าถึง
REM  - ฐานข้อมูล/ข้อมูล seed จะถูกสร้างอัตโนมัติครั้งแรก
REM  - ถ้า server หลุด/ปิดเอง จะเปิดใหม่ให้อัตโนมัติ (auto-restart)
REM
REM  เปิดอัตโนมัติตอนบูต: สร้าง shortcut ของไฟล์นี้
REM  ไปวางใน  Win+R -> shell:startup
REM
REM  ปิด server: ปิดหน้าต่างนี้ หรือกด Ctrl+C สองครั้ง
REM ============================================================

cd /d "%~dp0"

REM ---- หา node.exe (PATH ก่อน ถ้าไม่เจอลองตำแหน่งติดตั้งมาตรฐาน) ----
set "NODE="
for %%N in (node.exe) do if not defined NODE set "NODE=%%~$PATH:N"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE=%ProgramFiles(x86)%\nodejs\node.exe"

if not defined NODE (
  echo [ผิดพลาด] ไม่พบ Node.js บนเครื่องนี้
  echo ติดตั้ง Node.js 24 จาก https://nodejs.org  แล้วลองใหม่อีกครั้ง
  echo.
  pause
  exit /b 1
)

REM ---- ตรวจว่าติดตั้ง dependencies แล้วหรือยัง (deps อยู่ที่ node_modules ของ root) ----
if not exist "%~dp0node_modules\express" (
  echo [แจ้งเตือน] ยังไม่พบ dependencies ^(node_modules^)
  echo กำลังติดตั้งครั้งแรกด้วย  npm install  ^(ใช้เวลาสักครู่ ต้องต่ออินเทอร์เน็ต^)...
  echo หากเครื่องนี้ไม่มีเน็ต ให้คัดลอกโฟลเดอร์ node_modules จากเครื่องต้นทางมาวางแทน
  echo.
  call npm install
  if errorlevel 1 (
    echo [ผิดพลาด] npm install ไม่สำเร็จ
    pause
    exit /b 1
  )
)

REM ---- แสดง IP ของเครื่องนี้ (ให้เครื่องจอ/เครื่องเรียกคิวใช้ตั้งค่า) ----
echo ============================================================
echo  Queue 2026 Server
echo ------------------------------------------------------------
echo  เครื่องนี้ ^(server^) มี IP ในวง LAN ดังนี้ :
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
  set "IPADDR=%%a"
  set "IPADDR=!IPADDR: =!"
  echo     http://!IPADDR!:8888
)
echo.
echo  ให้เครื่องจอแสดงผลใช้ :   http://^<ip ด้านบน^>:8888/display/
echo  ให้เครื่องประจำห้องใช้ :  http://^<ip ด้านบน^>:8888/calling
echo ============================================================
echo.

REM ---- รัน server แบบลูป auto-restart ----
:run
echo [%date% %time%] เริ่ม server ...
"%NODE%" --no-warnings=ExperimentalWarning "%~dp0server\src\index.js"
echo.
echo [%date% %time%] server หยุดทำงาน (exit code %errorlevel%) - จะเปิดใหม่อีกครั้งใน 3 วินาที
echo (ถ้าต้องการปิดถาวร ให้ปิดหน้าต่างนี้)
timeout /t 3 /nobreak >nul
goto run
