@echo off
rem ================================================================
rem  APQueue - ONE file for the queue server PC. Just double-click.
rem
rem  It checks this machine first:
rem   - APQueue installed and ready  -> maintenance menu (ops\tools\menu.js)
rem       arrow keys up/down, Enter, Esc to quit
rem       status - restart - server IP - display - kiosk - backup - logs -
rem       update (git pull) - restore - autostart - repair
rem   - not installed / half installed -> installs it (asks Windows for
rem       administrator permission by itself - no right-click needed)
rem       Git + Node.js LTS (winget, Node 24+) -> downloads APQueue from GitHub
rem       -> ops\tools\setup.js does the rest (packages, kiosk config,
rem       firewall 8888, autostart, nightly backup) + "APQueue" desktop shortcut
rem   - "apqueue.bat install" = run the installer again (repair). Safe to
rem       repeat: every step checks first and skips what is already done.
rem
rem  Works on its own (USB stick / downloaded from GitHub) or from inside the repo.
rem  "Ready" = Node.js found + node_modules\express present.
rem  No labels/goto on purpose: this file may arrive with LF line endings
rem  (raw download from GitHub) and cmd mis-reads labels in LF files.
rem  The installer runs from a copy in %TEMP%: "git pull" may replace this
rem  very file, and cmd reads a .bat line by line while it runs.
rem  (Same design as CafeFlow ops\cafeflow.bat.)
rem ================================================================
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title APQueue

set "REPO=https://github.com/AndamanDev/apq_siro.git"

rem ---- where am I / where is APQueue -------------------------------
set "SELF=%~dp0"
if /i "%~2"=="--from-temp" set "SELF=%~3"
set "DIR="
if exist "%SELF%tools\menu.js" if exist "%SELF%..\server\src\index.js" for %%I in ("%SELF%..") do set "DIR=%%~fI"
if not defined DIR if exist "D:\apqueue\ops\tools\menu.js" set "DIR=D:\apqueue"
if not defined DIR if exist "C:\apqueue\ops\tools\menu.js" set "DIR=C:\apqueue"

set "READY=0"
if defined DIR if exist "%DIR%\node_modules\express\package.json" (
    where node >nul 2>&1
    if not errorlevel 1 set "READY=1"
)
if /i "%~1"=="install" set "READY=0"

rem ---- ready: open the menu ----------------------------------------
rem  The menu is in Thai. The old console window (Windows 10) has no Thai
rem  font and shows boxes - reopen this file inside Windows Terminal.
if "%READY%"=="1" if not defined WT_SESSION (
    where wt >nul 2>&1
    if not errorlevel 1 (
        start "" wt -w new --title APQueue -d "%DIR%" cmd /c "%~f0"
        exit /b 0
    )
    echo  Thai text shows as boxes? Install Windows Terminal, then open this file again:
    echo    winget install -e --id Microsoft.WindowsTerminal
    echo.
)
if "%READY%"=="1" (
    cd /d "%DIR%"
    node ops\tools\menu.js
    exit /b !errorlevel!
)

rem ---- not ready: install / repair ---------------------------------
echo.
echo  ===== APQueue installer =====
echo.
if /i not "%~1"=="install" (
    echo  APQueue is not installed on this computer yet ^(or not finished^).
    echo  Installing now - you can run this file again any time, finished steps are skipped.
    echo.
)

net session >nul 2>&1
if errorlevel 1 (
    echo  Asking Windows for administrator permission - press "Yes" ...
    powershell -NoProfile -Command "try { Start-Process -FilePath '%~f0' -ArgumentList 'install' -Verb RunAs -ErrorAction Stop } catch { exit 1 }"
    if errorlevel 1 (
        echo.
        echo  [x] Permission was refused - the installer needs "Yes" to install programs.
        echo.
        pause
        exit /b 1
    )
    exit /b 0
)

if /i not "%~2"=="--from-temp" (
    copy /y "%~f0" "%TEMP%\apqueue-install.bat" >nul
    call "%TEMP%\apqueue-install.bat" install --from-temp "%~dp0"
    exit /b !errorlevel!
)
title APQueue installer

set "WG=winget install -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity"
set "GIT=%ProgramFiles%\Git\cmd\git.exe"
set "NODE=%ProgramFiles%\nodejs\node.exe"
set "NEEDWG=0"
if not exist "%GIT%" set "NEEDWG=1"
if not exist "%NODE%" set "NEEDWG=1"
if "%NEEDWG%"=="1" (
    where winget >nul 2>&1
    if errorlevel 1 (
        echo  [x] winget not found. Open Microsoft Store, install/update "App Installer",
        echo      then run this file again.
        echo.
        pause
        exit /b 1
    )
)

rem ---- 1. Git ------------------------------------------------------
if exist "%GIT%" (
    echo  [1/2] Git ............ already installed
) else (
    echo  [1/2] Git ............ installing
    %WG% --id Git.Git --scope machine
    if not exist "%GIT%" (
        echo  [x] Git install failed - check the internet connection and run again.
        pause
        exit /b 1
    )
)

rem ---- 2. Node.js (24 or newer - the queue database is built into Node) --
if exist "%NODE%" (
    echo  [2/2] Node.js ........ already installed
) else (
    echo  [2/2] Node.js ........ installing
    %WG% --id OpenJS.NodeJS.LTS --scope machine
    if not exist "%NODE%" (
        echo  [x] Node.js install failed - check the internet connection and run again.
        pause
        exit /b 1
    )
)

rem ---- extra: Windows Terminal (Thai text in the menu) - not required --
where wt >nul 2>&1
if errorlevel 1 (
    echo  [+]   Windows Terminal installing - so the menu can show Thai text
    winget install -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity --id Microsoft.WindowsTerminal
    if errorlevel 1 echo  [x] Windows Terminal not installed - the menu still works, Thai may show as boxes.
) else (
    echo  [+]   Windows Terminal . already installed
)

rem ---- APQueue folder ----------------------------------------------
rem  1) the repo this file sits in / an existing install (found above)  2) D: if it is a fixed disk, else C:
if not defined DIR if exist "%SELF%..\.git" if exist "%SELF%..\server\src\index.js" for %%I in ("%SELF%..") do set "DIR=%%~fI"
if not defined DIR if exist "D:\apqueue\.git" set "DIR=D:\apqueue"
if not defined DIR if exist "C:\apqueue\.git" set "DIR=C:\apqueue"
if not defined DIR (
    set "DIR=C:\apqueue"
    fsutil fsinfo drivetype D: 2>nul | find /i "Fixed" >nul
    if not errorlevel 1 set "DIR=D:\apqueue"
)

if exist "%DIR%\.git" (
    echo.
    echo  APQueue folder: %DIR% - getting the latest version
    "%GIT%" -C "%DIR%" pull --ff-only
    if errorlevel 1 echo  [x] Could not update - continuing with the current version.
) else if exist "%DIR%\server\src\index.js" (
    echo.
    echo  APQueue folder: %DIR% - copied without Git, using it as it is
    echo  ^(automatic updates need a Git install - see ops\README.md^)
) else (
    echo.
    echo  Downloading APQueue to %DIR%
    "%GIT%" clone %REPO% "%DIR%"
    if not exist "%DIR%\.git" (
        echo  [x] Download failed - check the internet connection ^(private repo: sign in to GitHub when asked^) and run again.
        pause
        exit /b 1
    )
)

rem  Files created here are owned by Administrators. APQueue later runs as the
rem  normal (non-elevated) user, which must be able to write logs\ backup\ server\data\
icacls "%DIR%" /grant "%USERNAME%":(OI)(CI)M /Q >nul
set "SAFE=%DIR:\=/%"
"%GIT%" config --global --get-all safe.directory 2>nul | find /i "%SAFE%" >nul
if errorlevel 1 "%GIT%" config --global --add safe.directory "%SAFE%"

rem  Freshly installed programs are not on this window's PATH yet
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%PATH%"

echo.
"%NODE%" "%DIR%\ops\tools\setup.js"
set "RC=%errorlevel%"

rem  Desktop shortcut for every user -> the menu inside the APQueue folder
if "%RC%"=="0" (
    powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('CommonDesktopDirectory')+'\APQueue.lnk'); $s.TargetPath='%DIR%\ops\apqueue.bat'; $s.WorkingDirectory='%DIR%'; $s.Description='APQueue menu'; $s.Save()" >nul 2>&1
    echo.
    echo  From now on: double-click "APQueue" on the desktop ^(= %DIR%\ops\apqueue.bat^)
    echo  for every task - status, restart, update, backup ...
)
echo.
pause
exit /b %RC%
