Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = "Claude Proxy Manager"
$form.Size = New-Object System.Drawing.Size(560, 430)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(26, 27, 38)
$form.ForeColor = [System.Drawing.Color]::FromArgb(192, 202, 245)

$fontTitle = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$fontLabel = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$fontText = New-Object System.Drawing.Font("Segoe UI", 9.5)
$fontMono = New-Object System.Drawing.Font("Consolas", 9.5)
$fontButton = New-Object System.Drawing.Font("Segoe UI", 10.5, [System.Drawing.FontStyle]::Bold)

$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = "Claude Code Proxy Control"
$lblTitle.Font = $fontTitle
$lblTitle.ForeColor = [System.Drawing.Color]::FromArgb(122, 162, 247)
$lblTitle.Location = New-Object System.Drawing.Point(24, 18)
$lblTitle.Size = New-Object System.Drawing.Size(500, 32)
$form.Controls.Add($lblTitle)

$panelStatus = New-Object System.Windows.Forms.Panel
$panelStatus.Location = New-Object System.Drawing.Point(24, 58)
$panelStatus.Size = New-Object System.Drawing.Size(496, 52)
$panelStatus.BackColor = [System.Drawing.Color]::FromArgb(36, 40, 59)
$form.Controls.Add($panelStatus)

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Location = New-Object System.Drawing.Point(16, 14)
$lblStatus.Size = New-Object System.Drawing.Size(464, 26)
$lblStatus.Font = $fontLabel
$panelStatus.Controls.Add($lblStatus)

$lblKey = New-Object System.Windows.Forms.Label
$lblKey.Text = "Anthropic API Key (sk-ant-...):"
$lblKey.Font = $fontLabel
$lblKey.ForeColor = [System.Drawing.Color]::FromArgb(169, 177, 214)
$lblKey.Location = New-Object System.Drawing.Point(24, 126)
$lblKey.Size = New-Object System.Drawing.Size(300, 22)
$form.Controls.Add($lblKey)

$txtKey = New-Object System.Windows.Forms.TextBox
$txtKey.Location = New-Object System.Drawing.Point(24, 150)
$txtKey.Size = New-Object System.Drawing.Size(380, 26)
$txtKey.Font = $fontMono
$txtKey.BackColor = [System.Drawing.Color]::FromArgb(36, 40, 59)
$txtKey.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($txtKey)

$btnSaveKey = New-Object System.Windows.Forms.Button
$btnSaveKey.Text = "Save Key"
$btnSaveKey.Font = $fontLabel
$btnSaveKey.Location = New-Object System.Drawing.Point(412, 148)
$btnSaveKey.Size = New-Object System.Drawing.Size(108, 28)
$btnSaveKey.BackColor = [System.Drawing.Color]::FromArgb(65, 72, 104)
$btnSaveKey.ForeColor = [System.Drawing.Color]::White
$btnSaveKey.FlatStyle = "Flat"
$form.Controls.Add($btnSaveKey)

$btnEnable = New-Object System.Windows.Forms.Button
$btnEnable.Text = "Enable Proxy (API Credits Mode)"
$btnEnable.Font = $fontButton
$btnEnable.Location = New-Object System.Drawing.Point(24, 202)
$btnEnable.Size = New-Object System.Drawing.Size(496, 46)
$btnEnable.BackColor = [System.Drawing.Color]::FromArgb(158, 206, 106)
$btnEnable.ForeColor = [System.Drawing.Color]::FromArgb(26, 27, 38)
$btnEnable.FlatStyle = "Flat"
$btnEnable.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($btnEnable)

$btnDisable = New-Object System.Windows.Forms.Button
$btnDisable.Text = "Disable Proxy (Revert to Default)"
$btnDisable.Font = $fontButton
$btnDisable.Location = New-Object System.Drawing.Point(24, 258)
$btnDisable.Size = New-Object System.Drawing.Size(496, 44)
$btnDisable.BackColor = [System.Drawing.Color]::FromArgb(247, 118, 142)
$btnDisable.ForeColor = [System.Drawing.Color]::White
$btnDisable.FlatStyle = "Flat"
$btnDisable.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($btnDisable)

$btnLogs = New-Object System.Windows.Forms.Button
$btnLogs.Text = "View Logs"
$btnLogs.Font = $fontText
$btnLogs.Location = New-Object System.Drawing.Point(24, 318)
$btnLogs.Size = New-Object System.Drawing.Size(140, 32)
$btnLogs.BackColor = [System.Drawing.Color]::FromArgb(41, 46, 66)
$btnLogs.ForeColor = [System.Drawing.Color]::FromArgb(169, 177, 214)
$btnLogs.FlatStyle = "Flat"
$form.Controls.Add($btnLogs)

$lblInfo = New-Object System.Windows.Forms.Label
$lblInfo.Text = "Ready"
$lblInfo.Font = $fontText
$lblInfo.ForeColor = [System.Drawing.Color]::FromArgb(115, 122, 162)
$lblInfo.Location = New-Object System.Drawing.Point(180, 324)
$lblInfo.Size = New-Object System.Drawing.Size(340, 24)
$form.Controls.Add($lblInfo)

$toggleScript = Join-Path $PSScriptRoot "toggle.js"

function Refresh-Status {
    try {
        $json = & node "$toggleScript" status | ConvertFrom-Json
        $txtKey.Text = $json.apiKey
        if ($json.active) {
            $lblStatus.Text = "STATUS: ACTIVE (Port 3000 - API Credits Mode)"
            $lblStatus.ForeColor = [System.Drawing.Color]::FromArgb(158, 206, 106)
            $lblInfo.Text = "Claude Code in VS Code is routing requests through proxy."
        } else {
            $lblStatus.Text = "STATUS: DISABLED (Direct Anthropic Mode)"
            $lblStatus.ForeColor = [System.Drawing.Color]::FromArgb(169, 177, 214)
            $lblInfo.Text = "Claude Code is connected directly to Anthropic servers."
        }
    } catch {
        $lblStatus.Text = "Error checking status"
        $lblStatus.ForeColor = [System.Drawing.Color]::Red
    }
}

$btnSaveKey.Add_Click({
    $k = $txtKey.Text.Trim()
    if ($k) {
        & node "$toggleScript" save-key "$k"
        $lblInfo.Text = "API Key saved successfully!"
        $lblInfo.ForeColor = [System.Drawing.Color]::FromArgb(158, 206, 106)
        Refresh-Status
    }
})

$btnEnable.Add_Click({
    $k = $txtKey.Text.Trim()
    & node "$toggleScript" enable "$k"
    $lblInfo.Text = "Proxy enabled and configured successfully!"
    $lblInfo.ForeColor = [System.Drawing.Color]::FromArgb(158, 206, 106)
    Refresh-Status
})

$btnDisable.Add_Click({
    & node "$toggleScript" disable
    $lblInfo.Text = "Proxy disabled. Original settings restored."
    $lblInfo.ForeColor = [System.Drawing.Color]::FromArgb(247, 118, 142)
    Refresh-Status
})

$btnLogs.Add_Click({
    $logPath = Join-Path $PSScriptRoot "run.log"
    if (Test-Path $logPath) {
        Start-Process notepad.exe $logPath
    } else {
        [System.Windows.Forms.MessageBox]::Show("Log file does not exist yet.", "Logs")
    }
})

Refresh-Status
[void]$form.ShowDialog()
