const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const homeDir = os.homedir();
const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');

const VSCODE_SETTINGS = path.join(appData, 'Code', 'User', 'settings.json');
const CLAUDE_SETTINGS = path.join(homeDir, '.claude', 'settings.json');
const CREDENTIALS_FILE = path.join(homeDir, '.claude', '.credentials.json');
const CREDENTIALS_BAK = path.join(homeDir, '.claude', '.credentials.json.bak-oauth');
const PROXY_DIR = __dirname;
const ENV_FILE = path.join(PROXY_DIR, '.env');

function readJsonSafe(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeJsonPretty(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 4), 'utf8');
}

function getApiKey() {
  if (fs.existsSync(ENV_FILE)) {
    const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
    for (const l of lines) {
      if (l.trim().startsWith('ANTHROPIC_API_KEY=')) {
        return l.trim().slice('ANTHROPIC_API_KEY='.length).trim();
      }
    }
  }
  const vsc = readJsonSafe(VSCODE_SETTINGS);
  if (vsc && Array.isArray(vsc['claudeCode.environmentVariables'])) {
    const item = vsc['claudeCode.environmentVariables'].find(x => x.name === 'ANTHROPIC_API_KEY');
    if (item && item.value) return item.value;
  }
  return '';
}

function isProxyPortListening() {
  try {
    const out = execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue"', { encoding: 'utf8' });
    return out.includes('3000') || out.includes('Listen');
  } catch (e) {
    return false;
  }
}

function isConfiguredForProxy() {
  const vsc = readJsonSafe(VSCODE_SETTINGS);
  if (vsc && Array.isArray(vsc['claudeCode.environmentVariables'])) {
    return vsc['claudeCode.environmentVariables'].some(x => x.name === 'ANTHROPIC_BASE_URL' && x.value.includes('3000'));
  }
  return false;
}

const action = process.argv[2] || 'status';

if (action === 'status') {
  const listening = isProxyPortListening();
  const configured = isConfiguredForProxy();
  const apiKey = getApiKey();
  console.log(JSON.stringify({
    listening,
    configured,
    active: listening && configured,
    apiKey
  }));
} else if (action === 'enable') {
  const apiKey = process.argv[3] || getApiKey();

  // 1. Save .env
  fs.writeFileSync(ENV_FILE, `ANTHROPIC_API_KEY=${apiKey}\nPORT=3000\n`, 'utf8');

  // 2. Update VS Code settings
  const vsc = readJsonSafe(VSCODE_SETTINGS) || {};
  vsc['claudeCode.disableLoginPrompt'] = true;
  vsc['claudeCode.environmentVariables'] = [
    { name: 'ANTHROPIC_BASE_URL', value: 'http://127.0.0.1:3000' },
    { name: 'ANTHROPIC_API_KEY', value: apiKey },
    { name: 'CLAUDE_CODE_SKIP_AUTH_LOGIN', value: '1' }
  ];
  writeJsonPretty(VSCODE_SETTINGS, vsc);

  // 3. Update ~/.claude/settings.json
  const cld = readJsonSafe(CLAUDE_SETTINGS) || {};
  cld.env = cld.env || {};
  cld.env['ANTHROPIC_BASE_URL'] = 'http://127.0.0.1:3000';
  cld.env['ANTHROPIC_API_KEY'] = apiKey;
  cld.env['CLAUDE_CODE_SKIP_AUTH_LOGIN'] = '1';
  writeJsonPretty(CLAUDE_SETTINGS, cld);

  // 4. Start Windows Task Scheduler
  try {
    execSync('schtasks /run /tn "LaunchClaudeProxy"', { stdio: 'ignore' });
  } catch (e) {}

  console.log(JSON.stringify({ success: true, mode: 'proxy_enabled', apiKey }));
} else if (action === 'disable') {
  // 1. Revert VS Code settings
  const vsc = readJsonSafe(VSCODE_SETTINGS);
  if (vsc) {
    delete vsc['claudeCode.environmentVariables'];
    delete vsc['claudeCode.disableLoginPrompt'];
    writeJsonPretty(VSCODE_SETTINGS, vsc);
  }

  // 2. Revert ~/.claude/settings.json
  const cld = readJsonSafe(CLAUDE_SETTINGS);
  if (cld && cld.env) {
    delete cld.env['ANTHROPIC_BASE_URL'];
    delete cld.env['ANTHROPIC_API_KEY'];
    delete cld.env['CLAUDE_CODE_SKIP_AUTH_LOGIN'];
    writeJsonPretty(CLAUDE_SETTINGS, cld);
  }

  // 3. Restore OAuth credentials if backup exists
  if (fs.existsSync(CREDENTIALS_BAK)) {
    try {
      fs.copyFileSync(CREDENTIALS_BAK, CREDENTIALS_FILE);
    } catch(e) {}
  }

  // 4. Stop proxy service
  try {
    execSync('schtasks /end /tn "LaunchClaudeProxy"', { stdio: 'ignore' });
  } catch (e) {}
  try {
    execSync('powershell -Command "$p = (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess; if ($p) { Stop-Process -Id $p -Force }"', { stdio: 'ignore' });
  } catch (e) {}

  console.log(JSON.stringify({ success: true, mode: 'default_restored' }));
} else if (action === 'save-key') {
  const apiKey = process.argv[3];
  if (!apiKey) {
    console.error('API key required');
    process.exit(1);
  }
  fs.writeFileSync(ENV_FILE, `ANTHROPIC_API_KEY=${apiKey}\nPORT=3000\n`, 'utf8');

  const vsc = readJsonSafe(VSCODE_SETTINGS);
  if (vsc && Array.isArray(vsc['claudeCode.environmentVariables'])) {
    vsc['claudeCode.environmentVariables'] = [
      { name: 'ANTHROPIC_BASE_URL', value: 'http://127.0.0.1:3000' },
      { name: 'ANTHROPIC_API_KEY', value: apiKey },
      { name: 'CLAUDE_CODE_SKIP_AUTH_LOGIN', value: '1' }
    ];
    writeJsonPretty(VSCODE_SETTINGS, vsc);
  }

  const cld = readJsonSafe(CLAUDE_SETTINGS);
  if (cld && cld.env && cld.env['ANTHROPIC_BASE_URL']) {
    cld.env['ANTHROPIC_API_KEY'] = apiKey;
    writeJsonPretty(CLAUDE_SETTINGS, cld);
  }

  try {
    execSync('schtasks /run /tn "LaunchClaudeProxy"', { stdio: 'ignore' });
  } catch (e) {}

  console.log(JSON.stringify({ success: true, apiKey }));
}
