@echo off
rem Inicia o Validador PJe/TJPA e abre a pagina no navegador.
rem Para encerrar, feche esta janela ou pressione Ctrl+C.
title Validador PJe/TJPA
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js 18 ou superior: https://nodejs.org
  echo.
  pause
  exit /b 1
)

rem Se o validador ja estiver rodando, apenas abre a pagina
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:3000/saude | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo O validador ja esta rodando. Abrindo no navegador...
  start "" http://localhost:3000
  timeout /t 3 >nul
  exit /b 0
)

set "IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1).IPv4Address.IPAddress"`) do set "IP=%%i"

echo ==========================================================
echo   Validador PJe/TJPA
echo ==========================================================
echo.
echo   Nesta maquina:   http://localhost:3000
if defined IP echo   Pela rede/VPN:   http://%IP%:3000
echo.
echo   Para encerrar, feche esta janela ou pressione Ctrl+C.
echo ==========================================================
echo.

rem Abre o navegador assim que o servidor subir
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"

node server.js

echo.
echo O servidor foi encerrado.
pause
