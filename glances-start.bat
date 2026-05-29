@echo off
REM Launches Glances web/REST server (port 61208) for Homarr, logging to glances.log.
REM pythonw.exe = no console window; output redirected so Glances has valid stdio.
"%LOCALAPPDATA%\Programs\Python\Python312\pythonw.exe" -m glances -w > "E:\selfhosted\glances.log" 2>&1
