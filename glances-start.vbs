' Launches the Glances web server fully hidden (no console window) at logon.
Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c ""E:\selfhosted\glances-start.bat""", 0, False
