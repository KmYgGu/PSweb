@echo off
chcp 65001 >nul
echo [PSweb] assets PNG -^> js\assets_data.js ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_assets_data.ps1"
echo.
echo Done. Reload the game page (F5).
pause
