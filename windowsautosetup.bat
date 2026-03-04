@echo off
setlocal

for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"

set "BLUE=%ESC%[34m"
set "GREEN=%ESC%[32m"
set "MAGNETA=%ESC%[35m"
set "RESET=%ESC%[0m"

echo %MAGNETA%==============================
echo Rally Countdown Voice bot
echo ==============================%RESET%
echo.

echo %BLUE% Let's start by setting things up... %RESET%

timeout /t 2 /nobreak >nul

winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements
winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
winget install -e --id OpenJS.NodeJS --accept-package-agreements --accept-source-agreements
git clone https://github.com/Bj0rD/wos-voicechat-counter.git counterbotVC
cd counterbotVC
mkdir config

cls

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
echo.

timeout /t 2 /nobreak >nul
npm install --omit=dev --no-audit --no-fund --quiet
net start com.docker.service
docker compose build

:: Create start
(
echo @echo
echo timeout /t 5 /nobreak >nul
echo docker compose up -d
echo echo.
echo echo you can close this window now
echo echo.
echo pause
) > start.bat

cls
echo %MAGNETA% ==============================
echo Installation has successfully finished
echo ============================== %RESET
echo.
echo %BLUE% You can now start your bot by clicking the start.bat file. %RESET%
echo.
echo %MAGNETA% Happy battling! %RESET%
pause

endlocal

