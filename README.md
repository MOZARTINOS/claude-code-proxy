<p align="center">
  <img src="assets/banner.jpg" alt="Claude Code Proxy Banner" width="100%" />
</p>

# Claude Code Proxy

> **Transparent reverse proxy enabling standard Anthropic API keys & promotional developer credits with Claude Code.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-orange.svg)](#)

---

## The Problem

Anthropic provides recurring monthly API credits to subscribers on **Max** and **Team** plans (see [API credits for Max and Team plans](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers)):

| Subscription Tier | Included Monthly API Credits | Rollover |
|-------------------|------------------------------|----------|
| **Max 5x** | **$100 / month** | ❌ Expires each billing cycle |
| **Max 20x** | **$200 / month** | ❌ Expires each billing cycle |
| **Team (Standard Seat)** | **$20 / seat / month** | ❌ Expires each billing cycle |
| **Team (Premium Seat)** | **$100 / seat / month** (up to $500/mo per org) | ❌ Expires each billing cycle |

### The Arbitrary Exclusion
These credits are designated for the Claude API (Messages and Batches), Console Playground, and Agent SDK. However, Anthropic's official policy explicitly **excludes Claude Code**:

> *"The credits do not cover interactive usage of Claude Code (whether in the terminal, IDE, desktop, or web apps), nor do they change your chat app usage limits."*  
> — [Claude Platform Documentation: API credits for subscribers](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers)

When an organization with active monthly credits creates an API key and plugs it into Claude Code, Anthropic's edge gateway intercepts the request and rejects it:

```
API Error: 400 Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.
```

As a result, subscribers are pressured to purchase duplicate prepaid credits with a separate credit card, while their legitimate $100–$500/month allocation expires unused at the end of each billing cycle.

### How Anthropic Enforces the Gate
Under the hood, Claude Code uses the standard `POST /v1/messages` endpoint. To enforce this billing gate, the Claude Code client secretly fingerprints requests before they leave your machine:
1. **System Prompt Watermarks**: Injects `x-anthropic-billing-header: cc_version=...` and `You are Claude Code` into system prompts.
2. **Client Telemetry**: Appends headers such as `anthropic-client: claude-code`, Stainless metadata, and `claude-code-*` beta feature tags.
3. **OAuth Overrides**: Stale local OAuth session tokens intercept and override developer `x-api-key` headers, redirecting billing to exhausted chat quotas.

When Anthropic's API gateway spots these client markers, it disallows promotional subscriber credits and enforces paid prepaid balances.

---

## How It Works

This lightweight proxy acts as an intermediary between Claude Code (CLI or VS Code Extension) and `api.anthropic.com`. It transparently sanitizes outgoing requests so Anthropic perceives standard API SDK calls:

1. **Strips Billing Watermarks**: Automatically removes `x-anthropic-billing-header`, `cc_version`, and `You are Claude Code` injected into system prompts.
2. **Removes Client Telemetry**: Strips `anthropic-client`, `anthropic-cli-version`, `x-stainless-*`, and Claude Code beta gates.
3. **Cleans OAuth Interception**: Removes stale OAuth tokens that hijack requests to exhausted Claude web subscriptions.
4. **Fixes Schema Discrepancies**: Translates `role: 'system'` inside message history into `role: 'user'` and removes non-standard `tool_addition`/`tool_removal` blocks that trigger 400 errors.
5. **Prevents Brotli Compression Crashes**: Strips `accept-encoding: br` to ensure pristine, uncorrupted error messages.
6. **Preserves Model Selection**: Keeps your chosen model (e.g., `claude-opus-5-5`, `claude-sonnet-5-5`, etc.) intact with zero downgrades.
7. **Credit Pre-Auth Overdraft Protection**: Safely clamps excessive `max_tokens` allocations (e.g., Claude Code's internal background `remember-summarizer` requesting 128,000 output tokens on Haiku for a single-sentence memory log). This prevents Anthropic's API gateway from rejecting requests with `400: Credit balance is too low` during pre-authorization credit holds on prepaid or promotional balances.

---

## Desktop GUI Control Panel (Windows)

The repository includes a modern graphical control panel for Windows with zero dependencies (runs on native Windows Forms):

<p align="center">
  <img src="assets/gui_preview.png" alt="GUI Control Panel" width="480" />
</p>

### Features:
- **1-Click Mode Toggle**:
  - 🟢 **Enable Proxy (API Credits)**: Automatically configures VS Code & CLI settings to use the local proxy and launches the background service.
  - ⚪ **Disable Proxy (Revert to Default)**: Completely reverts VS Code & CLI settings back to official Anthropic direct connection and restores subscription credentials.
- **In-App API Key Manager**: Edit and save your Anthropic API key directly in the UI.
- **Real-Time Status**: Visual indicator of whether the proxy is active on port 3000.
- **Live Logs**: Open `run.log` in Notepad to inspect model requests and status codes.

### Launch GUI or Create Desktop Shortcut:
```powershell
# Create Desktop Shortcut:
npm run create-shortcut
# or: powershell -ExecutionPolicy Bypass -File .\create_shortcut.ps1

# Launch GUI directly:
npm run gui
# or: powershell -ExecutionPolicy Bypass -File .\gui.ps1
```

---

## Quick Start (Manual / Headless)

### 1. Requirements
- Node.js 18 or newer (no `npm install` needed — pure native Node.js).

### 2. Run the Proxy Directly
```bash
# Clone the repository
git clone https://github.com/MOZARTINOS/claude-code-proxy.git
cd claude-code-proxy

# (Optional) Set your API key in environment or .env
cp .env.example .env

# Start the proxy
node server.js
```

The proxy starts listening on `http://127.0.0.1:3000`.

---

## Configuration

### Option A: VS Code Claude Code Extension

Open your VS Code `settings.json` (`Ctrl+Shift+P` -> `Preferences: Open User Settings (JSON)`) and add:

```json
{
  "claudeCode.disableLoginPrompt": true,
  "claudeCode.environmentVariables": [
    {
      "name": "ANTHROPIC_BASE_URL",
      "value": "http://127.0.0.1:3000"
    },
    {
      "name": "ANTHROPIC_API_KEY",
      "value": "sk-ant-api03-YOUR_KEY_HERE"
    },
    {
      "name": "CLAUDE_CODE_SKIP_AUTH_LOGIN",
      "value": "1"
    }
  ]
}
```

### Option B: Claude Code CLI

In your global settings file (`~/.claude/settings.json`):

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:3000",
    "ANTHROPIC_API_KEY": "sk-ant-api03-YOUR_KEY_HERE",
    "CLAUDE_CODE_SKIP_AUTH_LOGIN": "1"
  }
}
```

Or set environment variables in your terminal session:
```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:3000
export ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE
export CLAUDE_CODE_SKIP_AUTH_LOGIN=1
claude
```

---

## Persistent Background Service (Windows Task Scheduler)

When running the proxy in a regular terminal or inside an IDE subprocess, closing the window or reloading the IDE terminates the proxy process, leading to `ECONNREFUSED`.

To ensure 100% uptime, you can register the proxy as an independent persistent background task in **Windows Task Scheduler**:

### Install as Windows Task Scheduler Service
```powershell
.\install_task.ps1
# or using npm:
npm run install-service
```
This registers a task `ClaudeCodeProxy` that runs detached in your user session and starts automatically upon Windows logon.

### Uninstall Service
```powershell
.\uninstall_task.ps1
# or using npm:
npm run uninstall-service
```

---

## License

[MIT](LICENSE)
