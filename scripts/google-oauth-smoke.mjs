#!/usr/bin/env node

import 'dotenv/config';
import http from 'node:http';

const clientId = process.env.GOOGLE_CLIENT_ID;
const port = Number(process.env.GOOGLE_TEST_PORT ?? 4555);
const authServiceUrl =
  process.env.AUTH_SERVICE_URL ??
  `http://localhost:${process.env.AUTH_SERVICE_PORT ?? 3001}`;

if (!clientId) {
  console.error('Missing GOOGLE_CLIENT_ID in .env');
  process.exit(1);
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ghostless Google OAuth Smoke Test</title>
    <script src="https://accounts.google.com/gsi/client" async defer></script>
    <style>
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 40px;
        max-width: 720px;
        line-height: 1.5;
      }
      pre {
        background: #111827;
        color: #e5e7eb;
        padding: 16px;
        overflow: auto;
      }
    </style>
  </head>
  <body>
    <h1>Ghostless Google OAuth Smoke Test</h1>
    <p>Sign in with Google. This page sends the Google ID token to your local auth service.</p>
    <div id="button"></div>
    <h2>Backend response</h2>
    <pre id="output">Waiting...</pre>

    <script>
      const output = document.getElementById('output');

      async function handleCredentialResponse(response) {
        output.textContent = 'Sending ID token to backend...';
        const res = await fetch('/google-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: response.credential }),
        });
        const text = await res.text();
        try {
          output.textContent = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          output.textContent = text;
        }
      }

      window.onload = () => {
        google.accounts.id.initialize({
          client_id: ${JSON.stringify(clientId)},
          callback: handleCredentialResponse,
        });
        google.accounts.id.renderButton(document.getElementById('button'), {
          theme: 'outline',
          size: 'large',
          type: 'standard',
        });
      };
    </script>
  </body>
</html>`;

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (req.method === 'POST' && req.url === '/google-token') {
    let body = '';
    req.on('data', (chunk) => {
      console.log('Received chunk:', chunk.toString());
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const { idToken } = JSON.parse(body);
        const authResponse = await fetch(`${authServiceUrl}/auth/oauth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'GOOGLE', idToken }),
        });
        const text = await authResponse.text();
        res.writeHead(authResponse.status, {
          'Content-Type': authResponse.headers.get('content-type') ?? 'application/json',
        });
        res.end(text);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        );
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Google OAuth smoke test: http://localhost:${port}`);
  console.log(`Forwarding tokens to: ${authServiceUrl}/auth/oauth`);
  console.log('');
  console.log('Google Console setup:');
  console.log(`- Application type: Web application`);
  console.log(`- Authorized JavaScript origin: http://localhost:${port}`);
  console.log('- Authorized redirect URI: leave empty');
});
