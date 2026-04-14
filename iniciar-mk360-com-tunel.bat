@echo off
setlocal
cd /d "%~dp0"
set "SITE_URL=https://claudinhomaceio.github.io/MK360/"

echo ============================================
echo MK360 - Node + Cloudflare Tunnel
echo ============================================
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm nao encontrado. Instale o Node.js e tente novamente.
  pause
  exit /b 1
)

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo [ERRO] cloudflared nao encontrado.
  echo Instale com: winget install Cloudflare.cloudflared
  pause
  exit /b 1
)

echo [1/3] Abrindo servidor Node (npm start)...
start "MK360 Node" cmd /k "cd /d ""%~dp0"" && npm start"

echo [2/3] Abrindo Cloudflare Tunnel...
start "MK360 Tunnel" cmd /k "cloudflared tunnel --url http://localhost:8080"

echo [3/3] Abrindo site publicado no navegador...
start "" "%SITE_URL%"

echo.
echo Pronto! Foram abertas 2 janelas e o site no navegador:
echo - MK360 Node
echo - MK360 Tunnel
echo - %SITE_URL%
echo.
echo No terminal do Tunnel, copie a URL https://*.trycloudflare.com
echo e cole no campo "URL publica do server.js" no site publicado.
echo.
pause
