@echo off
setlocal
cd /d "%~dp0"
set PORT=5500

echo ==============================================
echo       FILA CERO - SERVIDOR LOCAL
ECHO ==============================================
echo.
echo Abriendo http://localhost:%PORT%
echo No cierres esta ventana mientras pruebas la app.
echo.

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%"
  py -m http.server %PORT%
  goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%"
  python -m http.server %PORT%
  goto :end
)

where npx >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%"
  npx --yes http-server . -p %PORT% -c-1
  goto :end
)

echo ERROR: No encontre Python ni Node/npx.
echo Instala uno de ellos o usa la extension Live Server de VS Code.
pause

:end
endlocal
