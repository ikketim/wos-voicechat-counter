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

winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements
winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
winget install -e --id OpenJS.NodeJS --version 20.11.0 --force --accept-package-agreements --accept-source-agreements
git clone https://github.com/Bj0rD/wos-voicechat-counter.git counterbotVC
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

:: Create JSON file
(
echo {
echo   "token": "%token%",
echo   "clientId": "%clientId%",
echo   "guildId": "%guildId%"
echo }
) > config/config.json

echo.
echo %BLUE% config.json created successfully! %RESET%
echo.

timeout /t 1 /nobreak >nul

cls

echo.
echo %BLUE% Everything is set up. Time to build the container. %RESET%
echo %BLUE% Please be patient, this might take a few minutes. %RESET%
echo.

timeout /t 2 /nobreak >nul
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
   timeout /t 15 /nobreak >nul
cmd /c npm install --no-audit --no-fund 2>nul
if %errorLevel% neq 0 (
    echo %RED% npm install failed. Please restart the script.
    pause
    exit /b 1
)
)
docker compose build

:: Create start
(
echo @echo off
echo :: Force elevation
echo net session >nul 2>&1
echo if %errorLevel% neq 0 (
echo     powershell -Command "Start-Process '%~f0' -Verb RunAs -WindowStyle Normal -WorkingDirectory '%~dp0'"
echo     exit /b
echo )
echo :: Force working directory to script location after elevation
echo cd /d "%~dp0"
echo echo.
echo echo Please wait while we get things ready for you.
echo echo.
echo start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo    timeout /t 15 /nobreak >nul
echo docker compose up -d
echo echo.
echo echo you can close this window now
echo echo.
echo pause
) > start.bat

:: Create stop
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
