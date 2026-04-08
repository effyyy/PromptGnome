@echo off
REM dev.bat — Start PromptGnome in local dev mode with verbose audit logging.
REM
REM Usage:
REM   dev.bat              — default: verbose logging, Chrome target
REM   dev.bat --quiet      — only warnings and errors
REM   dev.bat --firefox    — target Firefox
REM   dev.bat --edge       — target Edge
REM   dev.bat --clean      — wipe build cache and node_modules, reinstall

setlocal enabledelayedexpansion

cd /d "%~dp0"

set "LOG_LEVEL=debug"
set "TARGET=chrome-mv3"
set "CLEAN=false"

:parse_args
if "%~1"=="" goto after_args
if /i "%~1"=="--quiet"   set "LOG_LEVEL=warn" & shift & goto parse_args
if /i "%~1"=="--firefox" set "TARGET=firefox-mv3" & shift & goto parse_args
if /i "%~1"=="--edge"    set "TARGET=edge-mv3" & shift & goto parse_args
if /i "%~1"=="--clean"   set "CLEAN=true" & shift & goto parse_args
if /i "%~1"=="--help"    goto show_help
if /i "%~1"=="-h"        goto show_help
echo [warn]  Unknown argument: %~1 (ignored)
shift
goto parse_args

:show_help
echo Usage: dev.bat [--quiet] [--firefox^|--edge] [--clean]
echo.
echo   --quiet     Only show warnings and errors
echo   --firefox   Build for Firefox (Manifest V3)
echo   --edge      Build for Edge (Manifest V3)
echo   --clean     Wipe build cache and node_modules, then reinstall
echo   --help      Show this help message
exit /b 0

:after_args

REM ---------------------------------------------------------------------------
REM Pre-flight: Node.js
REM ---------------------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo [error] Node.js is not installed.
  echo.
  echo   Install from: https://nodejs.org/
  echo   Or via winget: winget install OpenJS.NodeJS.LTS
  exit /b 1
)

for /f "delims=" %%v in ('node -e "console.log(process.versions.node.split('.')[0])"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 18 (
  echo [error] Node.js v18+ required.
  node -v
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [ok]    Node.js %%v

REM ---------------------------------------------------------------------------
REM Pre-flight: pnpm
REM ---------------------------------------------------------------------------
where pnpm >nul 2>&1
if errorlevel 1 (
  echo [warn]  pnpm is not installed. Attempting to install...
  where corepack >nul 2>&1
  if not errorlevel 1 (
    echo [info]  Installing via corepack...
    call corepack enable
    call corepack prepare pnpm@latest --activate
  ) else (
    where npm >nul 2>&1
    if not errorlevel 1 (
      echo [info]  Installing via npm...
      call npm install -g pnpm
    ) else (
      echo [error] Cannot auto-install pnpm. Install it manually:
      echo   npm install -g pnpm
      exit /b 1
    )
  )
  where pnpm >nul 2>&1
  if errorlevel 1 (
    echo [error] pnpm installation failed.
    exit /b 1
  )
  echo [ok]    pnpm installed successfully
)
for /f "delims=" %%v in ('pnpm -v') do echo [ok]    pnpm %%v

REM ---------------------------------------------------------------------------
REM Clean mode
REM ---------------------------------------------------------------------------
if "%CLEAN%"=="true" (
  echo [info]  Cleaning build artifacts and node_modules...
  if exist node_modules rmdir /s /q node_modules
  if exist build rmdir /s /q build
  if exist .plasmo rmdir /s /q .plasmo
  echo [info]  Reinstalling dependencies...
  call pnpm install
  if errorlevel 1 exit /b 1
  echo [ok]    Clean install complete
)

REM ---------------------------------------------------------------------------
REM Install dependencies if needed
REM ---------------------------------------------------------------------------
if not exist node_modules (
  echo [info]  node_modules not found — running pnpm install...
  call pnpm install
  if errorlevel 1 (
    echo [error] pnpm install failed.
    exit /b 1
  )
  echo [ok]    Dependencies installed
)

REM ---------------------------------------------------------------------------
REM Verify Plasmo is available
REM ---------------------------------------------------------------------------
call pnpm exec plasmo --version >nul 2>&1
if errorlevel 1 (
  echo [warn]  Plasmo binary not found. Reinstalling...
  call pnpm install
  call pnpm exec plasmo --version >nul 2>&1
  if errorlevel 1 (
    echo [error] Plasmo is not available after install.
    exit /b 1
  )
)
echo [ok]    Plasmo installed

REM ---------------------------------------------------------------------------
REM Banner
REM ---------------------------------------------------------------------------
set "BUILD_DIR=build\%TARGET%-dev"

echo.
echo ============================================
echo   PromptGnome — Dev Mode
echo ============================================
echo.
echo   Log level:      %LOG_LEVEL%
echo   Target:         %TARGET%
echo   Hot reload:     enabled
echo   Build output:   %BUILD_DIR%
echo.
echo How to use:
echo   1. Wait for the build to finish (watch for 'Built in X ms')
if "%TARGET%"=="firefox-mv3" (
  echo   2. Open Firefox ^> about:debugging#/runtime/this-firefox
  echo   3. Click 'Load Temporary Add-on' ^> select any file in:
  echo      %CD%\%BUILD_DIR%
) else (
  echo   2. Open Chrome ^> chrome://extensions ^> Enable Developer mode
  echo   3. Click 'Load unpacked' ^> select:
  echo      %CD%\%BUILD_DIR%
)
echo   4. Open any supported AI chat (ChatGPT, Claude, Gemini)
echo   5. Open DevTools (F12) ^> Console tab
echo   6. Filter console by: PromptGnome
echo.
echo Starting Plasmo dev server...
echo --------------------------------------------
echo.

set "NODE_ENV=development"
set "PII_SHIELD_LOG_LEVEL=%LOG_LEVEL%"

if not "%TARGET%"=="chrome-mv3" (
  call pnpm exec plasmo dev --target=%TARGET%
) else (
  call pnpm exec plasmo dev
)

endlocal
