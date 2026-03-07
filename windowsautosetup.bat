@echo off
setlocal

:: Force elevation
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs -WindowStyle Normal -WorkingDirectory '%~dp0'"
    exit /b
)

:: Force working directory to script location after elevation
cd /d "%~dp0"

for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "BLUE=%ESC%[34m"
set "GREEN=%ESC%[32m"
set "MAGENTA=%ESC%[35m"
set "RED=%ESC%[31m"
set "RESET=%ESC%[0m"

echo %MAGENTA%==============================
echo Rally Countdown Voice bot
echo ==============================%RESET%
echo.
echo %BLUE% Let's start by setting things up... %RESET%
timeout /t 2

:: ----------------------------------------
:: Node.js v22 check and install
:: ----------------------------------------
echo.
echo %BLUE% Checking Node.js version... %RESET%

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo %RED% Node.js not found. Installing v22... %RESET%
    goto :install_node
)

for /f "tokens=2 delims=v." %%a in ('node --version') do set "NODE_MAJOR=%%a"
echo %BLUE% Detected Node.js major version: %NODE_MAJOR% %RESET%

if "%NODE_MAJOR%"=="22" (
    echo %GREEN% Node.js v22 already installed. %RESET%
    goto :install_packages
)

echo %RED% Node.js v%NODE_MAJOR% detected but v22 is required. Upgrading... %RESET%

:install_node
echo %BLUE% Downloading Node.js v22.14.0... %RESET%
curl -L --progress-bar -o "%TEMP%\node-installer.msi" "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
if %errorlevel% neq 0 (
    echo %RED% Failed to download Node.js installer. Check your internet connection. %RESET%
    pause
    exit /b 1
)

echo %BLUE% Installing Node.js v22.14.0... %RESET%
msiexec /i "%TEMP%\node-installer.msi" /quiet /norestart ADDLOCAL=ALL
if %errorlevel% neq 0 (
    echo %RED% Node.js installation failed. %RESET%
    pause
    exit /b 1
)
del "%TEMP%\node-installer.msi" >nul 2>&1

:: Refresh PATH so node is available in this session
set "PATH=%PATH%;C:\Program Files\nodejs"

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo %RED% Node.js installed but PATH not updated yet. %RESET%
    echo %BLUE% Please close this window and re-run the script once more. %RESET%
    pause
    exit /b 0
)
echo %GREEN% Node.js v22 installed successfully! %RESET%

:: ----------------------------------------
:: Other winget installs
:: ----------------------------------------
:install_packages
winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements
winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
winget install -e --id Python.Python.3 --accept-package-agreements --accept-source-agreements
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --accept-package-agreements --accept-source-agreements

git clone https://github.com/ikketimnl/wos-voicechat-counter.git counterbotVC
cd counterbotVC

del /q deploy.sh
del /q *.md
del /q env.example
del /q config.json
del /q .gitignore
del /q *.bat

mkdir config

cls
echo.
echo %RED% CLICK ON THIS WINDOW BEFORE TYPING! %RESET%
echo.
echo %BLUE% Now we need some info to create the config %RESET%
echo.
timeout /t 1 /nobreak >nul

set /p token=%GREEN%Enter your Discord Bot Token:%RESET%
set /p clientId=%GREEN%Enter your Client ID:%RESET%
set /p guildId=%GREEN%Enter your Guild ID:%RESET%

echo.
echo %BLUE% Creating config.json ... %RESET%

(
echo {
echo   "token": "%token%",
echo   "clientId": "%clientId%",
echo   "guildId": "%guildId%"
echo }
) > config.json

echo.
echo %BLUE% config.json created successfully! %RESET%
echo.
timeout /t 1 /nobreak >nul

cls
echo.
echo %BLUE% Installing dependencies... %RESET%
echo.
timeout /t 2 /nobreak >nul

cmd /c npm install --no-audit --no-fund 2>nul
if %errorLevel% neq 0 (
    echo %RED% npm install failed. Please restart the script. %RESET%
    pause
    exit /b 1
)

:: Install DAVE-compatible voice packages
echo.
echo %BLUE% Installing Discord voice packages with DAVE protocol support... %RESET%
cmd /c npm install @discordjs/voice@0.19.1-dev.1772841884-52173b6ca --legacy-peer-deps
cmd /c npm install @snazzah/davey --legacy-peer-deps
cmd /c npm install tweetnacl --legacy-peer-deps

cls
echo.
echo %BLUE% Everything is set up. Time to build the container. %RESET%
echo.
echo %BLUE% Please be patient, this might take a few minutes. %RESET%
echo.
timeout /t 2 /nobreak >nul

start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
timeout /t 15 /nobreak >nul

docker compose build

:: Create start.bat
(
echo @echo off
echo net session ^>nul 2^>^&1
echo if %%errorLevel%% neq 0 ^(
echo     powershell -Command "Start-Process '%%~f0' -Verb RunAs -WindowStyle Normal -WorkingDirectory '%%~dp0'"
echo     exit /b
echo ^)
echo cd /d "%%~dp0"
echo echo.
echo echo Please wait while we get things ready for you.
echo echo.
echo start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo timeout /t 15 /nobreak ^>nul
echo docker compose up -d
echo echo.
echo echo you can close this window now
echo echo.
echo pause
) > start.bat

:: Create stop.bat
(
echo @echo off
echo timeout /t 5 /nobreak >nul
echo docker compose down
echo echo.
echo echo you can close this window now
echo echo.
echo pause
) > stop.bat

cls
echo %MAGENTA% ==============================
echo Installation has successfully finished
echo ============================== %RESET%
echo.
echo %BLUE% You can now start your bot by clicking the start.bat file. %RESET%
echo.
echo %MAGENTA% Happy battling! %RESET%
pause

endlocal

