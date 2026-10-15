@echo off
setlocal
echo Installing the Count Up panel for Adobe Premiere Pro...

set "DEST=%APPDATA%\Adobe\CEP\extensions\com.countup.panel"
if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%"
xcopy "%~dp0com.countup.panel" "%DEST%" /e /i /y /q >nul
if errorlevel 1 (
  echo Could not copy the panel files. Make sure the com.countup.panel folder is next to this file.
  pause
  exit /b 1
)

rem The panel isn't signed by Adobe, so allow unsigned panels (one registry key per CEP version).
for %%V in (9 10 11 12 13 14) do reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul

echo.
echo Done. Restart Premiere Pro, then open Window ^> Extensions ^> Count Up.
pause
