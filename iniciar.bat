@echo off
echo.
echo  =================================================================
echo   Simulador de Marketing  ^|  UAGRM - Ingenieria Comercial
echo   COM400A Estrategia Comercial  ^|  Profesor Jhonny David Atila
echo  =================================================================
echo.
cd /d "%~dp0"

echo  Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo  ERROR: Node.js no esta instalado.
  echo  Descarga e instala Node.js desde: https://nodejs.org
  pause
  exit /b 1
)

echo  Node.js encontrado. Iniciando servidor...
echo.
echo  *** Admin:  http://localhost:3000  ^(usuario: admin  /  clave: admin123^) ***
echo  *** Equipo: http://localhost:3000  ^(usar credenciales del registro^) ***
echo.
echo  Para detener: Ctrl+C
echo.
node server.js
pause
