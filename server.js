/**
 * Claude Code Transparent Reverse Proxy
 * 
 * Allows using standard Anthropic API keys & promotional developer credits with Claude Code
 * by stripping client billing watermarks, sanitizing request structures, and routing transparently.
 * 
 * Zero external dependencies — runs on native Node.js (v18+).
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env if present (native parser, no dotenv dependency needed)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const TARGET_HOST = process.env.ANTHROPIC_HOST || 'api.anthropic.com';
const STATIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

// Map legacy 3.x model identifiers to modern flagship generations if requested
const LEGACY_MAP = {
  'claude-3-7-sonnet': 'claude-sonnet-5-5',
  'claude-3-5-sonnet': 'claude-sonnet-5-5',
  'claude-3-sonnet': 'claude-sonnet-5-5',
  'claude-3-opus': 'claude-opus-5-5',
  'claude-3-5-haiku': 'claude-haiku-5-5',
  'claude-3-haiku': 'claude-haiku-5-5'
};

function resolveModel(requestedModel) {
  if (!requestedModel || requestedModel === 'default') {
    return 'claude-opus-5-5';
  }
  for (const [legacy, target] of Object.entries(LEGACY_MAP)) {
    if (requestedModel.includes(legacy)) {
      return target;
    }
  }
  // Modern models (claude-opus-5-5, claude-sonnet-5-5, claude-opus-5, etc.) preserved 1:1
  return requestedModel;
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'accept-encoding' // Stripped to prevent BrotliDecompressionError on error payloads
]);

const server = http.createServer((req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
    });
    return res.end();
  }

  // Health check
  if (req.url.includes('/api/hello') || req.url.includes('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', client: 'claude-code-proxy' }));
  }

  // Normalize path (handle double /v1/v1 or missing /v1)
  let cleanPath = req.url.replace(/^\/v1\/v1/, '/v1');
  if (!cleanPath.startsWith('/v1')) {
    cleanPath = '/v1' + cleanPath;
  }

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    let finalBody = Buffer.concat(chunks);
    let originalModel = '';
    let finalModel = '';

    if (finalBody.length > 0) {
      try {
        const json = JSON.parse(finalBody.toString('utf8'));

        // 1. Model resolution
        originalModel = json.model || 'default';
        json.model = resolveModel(originalModel);
        finalModel = json.model;

        // 2. Strip Claude Code watermarks from system prompt
        // Anthropic edge servers inspect system prompts for `x-anthropic-billing-header` and `You are Claude Code`
        if (Array.isArray(json.system)) {
          json.system = json.system.filter(item => {
            const text = item.text || '';
            if (text.includes('x-anthropic-billing-header') || text.includes('cc_version')) return false;
            if (text.includes('You are Claude Code')) return false;
            return true;
          });
        } else if (typeof json.system === 'string') {
          json.system = json.system
            .replace(/x-anthropic-billing-header:[^\n]*\n?/g, '')
            .replace(/You are Claude Code[^\n]*\n?/g, '');
        }

        // 3. Sanitize message payload
        // Public API models reject `role: 'system'` inside messages and `tool_addition`/`tool_removal` blocks
        if (Array.isArray(json.messages)) {
          const cleanMessages = [];
          for (const m of json.messages) {
            let content = m.content;
            if (Array.isArray(content)) {
              content = content.filter(b => b.type !== 'tool_addition' && b.type !== 'tool_removal');
            }
            if (!content || (Array.isArray(content) && content.length === 0)) {
              continue;
            }
            let role = m.role;
            if (role === 'system') {
              role = 'user';
            }
            const cleanM = { ...m, role, content };
            delete cleanM.output_config;
            cleanMessages.push(cleanM);
          }
          json.messages = cleanMessages;
        }

        // 4. Token limit sanity check (Prevents Anthropic "Credit balance is too low" 400 errors)
        // Claude Code uses Haiku for background memory logs (remember-summarizer) and context compaction.
        // The Claude Code SDK inadvertently passes max_tokens: 128000 to Haiku, even though Anthropic API's
        // official architectural output limit for the Claude Haiku family is strictly 8,192 tokens.
        // This mismatch causes Anthropic's upfront credit reservation to fail with 400 "Credit balance is too low".
        // We safely clamp Haiku requests to its official architectural ceiling of 8,192 tokens:
        if (typeof json.max_tokens === 'number' && json.model && json.model.includes('haiku')) {
          if (json.max_tokens > 8192) {
            json.max_tokens = 8192;
          }
          if (json.thinking && typeof json.thinking.budget_tokens === 'number' && json.thinking.budget_tokens >= json.max_tokens) {
            json.thinking.budget_tokens = Math.max(1024, json.max_tokens - 1024);
          }
        }

        finalBody = Buffer.from(JSON.stringify(json));
      } catch (e) {
        if (DEBUG) console.error('[Proxy] JSON parse warning:', e.message);
      }
    }

    // Build upstream headers
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    headers['host'] = TARGET_HOST;
    headers['user-agent'] = 'anthropic-sdk-typescript/0.39.0';
    headers['anthropic-version'] = headers['anthropic-version'] || '2023-06-01';

    // Remove OAuth authorization headers that hijack API billing to subscription plans
    delete headers['authorization'];
    delete headers['anthropic-auth-token'];

    // Remove Claude Code and Stainless client fingerprinting
    delete headers['anthropic-client'];
    delete headers['anthropic-cli-version'];
    delete headers['x-stainless-lang'];
    delete headers['x-stainless-package-version'];
    delete headers['x-stainless-os'];
    delete headers['x-stainless-arch'];
    delete headers['x-stainless-runtime'];
    delete headers['x-stainless-runtime-version'];

    // Clean anthropic-beta: strip claude-code and oauth gates, keep capability betas
    if (headers['anthropic-beta']) {
      const betas = headers['anthropic-beta'].split(',').map(s => s.trim());
      const safeBetas = betas.filter(b => !b.includes('claude-code') && !b.includes('oauth'));
      if (safeBetas.length > 0) {
        headers['anthropic-beta'] = safeBetas.join(', ');
      } else {
        delete headers['anthropic-beta'];
      }
    }

    // API Key resolution: prefer STATIC_API_KEY from env, fallback to incoming x-api-key
    if (STATIC_API_KEY) {
      headers['x-api-key'] = STATIC_API_KEY;
    }

    if (finalBody.length > 0) {
      headers['content-length'] = Buffer.byteLength(finalBody);
    } else {
      delete headers['content-length'];
    }

    console.log(`[Proxy] >>> ${req.method} ${cleanPath} | Model: ${finalModel || 'n/a'} (requested: ${originalModel || 'n/a'})`);

    const proxyReq = https.request({
      hostname: TARGET_HOST,
      port: 443,
      path: cleanPath,
      method: req.method,
      headers: headers,
    }, (proxyRes) => {
      console.log(`[Proxy] <<< Anthropic: ${proxyRes.statusCode} (${finalModel || cleanPath})`);

      const resHeaders = { ...proxyRes.headers };
      delete resHeaders['content-encoding'];

      if (proxyRes.statusCode >= 400) {
        let errChunks = [];
        proxyRes.on('data', d => errChunks.push(d));
        proxyRes.on('end', () => {
          const errBody = Buffer.concat(errChunks).toString('utf8');
          console.error(`[Proxy ERROR ${proxyRes.statusCode}] Anthropic response:`, errBody);
          res.writeHead(proxyRes.statusCode, {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(errBody)
          });
          res.end(errBody);
        });
      } else {
        res.writeHead(proxyRes.statusCode, resHeaders);
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      console.error('[Proxy] Network error to Anthropic:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `Proxy network error: ${err.message}` } }));
    });

    if (finalBody.length > 0) {
      proxyReq.write(finalBody);
    }
    proxyReq.end();
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`=======================================================`);
  console.log(` Claude Code Proxy running on http://127.0.0.1:${PORT}`);
  console.log(` Target Host: https://${TARGET_HOST}`);
  console.log(` Auth Mode  : ${STATIC_API_KEY ? 'Configured via ANTHROPIC_API_KEY' : 'Pass-through from client header'}`);
  console.log(`=======================================================`);
});
