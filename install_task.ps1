# Registers Claude Code Proxy as an independent persistent background task in Windows Task Scheduler.
# This prevents the proxy from being killed when terminal or IDE windows close.

$ErrorActionPreference = "Stop"

$nodePath = (Get-Command node -ErrorAction Stop).Source
$scriptPath = (Resolve-Path (Join-Path $PSScriptRoot "server.js")).Path
$taskName = "ClaudeCodeProxy"

Write-Host "Configuring persistent Task Scheduler service for Claude Code Proxy..."
Write-Host "Node Path: $nodePath"
Write-Host "Server Script: $scriptPath"

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Persistent background reverse proxy for Claude Code</Description>
  </RegistrationInfo>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
    </Principal>
  </Principals>
  <Settings>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
  </Settings>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Actions Context="Author">
    <Exec>
      <Command>cmd.exe</Command>
      <Arguments>/c start "" /b "$nodePath" "$scriptPath"</Arguments>
    </Exec>
  </Actions>
</Task>
"@

$xmlPath = Join-Path $env:TEMP "claude_code_proxy_task.xml"
[System.IO.File]::WriteAllText($xmlPath, $xml, [System.Text.Encoding]::Unicode)

schtasks /create /tn $taskName /xml $xmlPath /f
Remove-Item $xmlPath -Force

Write-Host "Starting task..."
schtasks /run /tn $taskName

Write-Host "SUCCESS: Claude Code Proxy registered as '$taskName' and running in the background."
Write-Host "It will automatically persist across IDE restarts, terminal closures, and system reboots."
