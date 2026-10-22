# Unregisters Claude Code Proxy from Windows Task Scheduler.

$taskName = "ClaudeCodeProxy"

Write-Host "Stopping and removing '$taskName' from Windows Task Scheduler..."
schtasks /end /tn $taskName 2>$null
schtasks /delete /tn $taskName /f

Write-Host "SUCCESS: Claude Code Proxy task has been removed."
