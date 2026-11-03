@echo off
set "TARGET=%~dp0start-michael.bat"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Michael.lnk'); $s.TargetPath='%TARGET%'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
echo Done. Michael now starts by itself every time you turn on your PC.
echo To undo: press Win+R, type shell:startup, delete "Michael".
pause
