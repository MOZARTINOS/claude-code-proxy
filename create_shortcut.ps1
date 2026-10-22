# Creates a desktop shortcut for Claude Proxy Manager

$WshShell = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$shortcutPath = Join-Path $desktop "Claude Proxy Control.lnk"

$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""$PSScriptRoot\gui.ps1"""
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.Description = "Claude Code Proxy Control Panel"
$Shortcut.IconLocation = "shell32.dll,44"
$Shortcut.Save()

Write-Host "SUCCESS: Desktop shortcut created cleanly at '$shortcutPath'."
