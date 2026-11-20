@echo off
echo Stopping Event Ticketing Platform...

where docker >nul 2>nul
if %ERRORLEVEL% equ 0 (
  docker compose down
)

echo Services stopped.
