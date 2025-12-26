// Obsidian MCP server - simple file indexer
const http = require('http');
const fs = require('fs');
const path = require('path');

const VAULT =
  process.env.VAULT_PATH || path.join(process.env.HOME || '', 'Documents', 'Pandora');
const PORT = parseInt(process.env.PORT || '3001', 10);

function safeJoin(base, target) {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(path.join(base, target));
  if (!resolvedTarget.startsWith(resolvedBase)) throw new Error('out of bounds');
  return resolvedTarget;
}

function listMarkdown(dir) {
  const files = [];
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.md')) files.push(path.relative(VAULT, p));
    }
  }
  walk(dir);
  return files;
}

const server = http.createServer((req, res) => {
  try {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.method === 'GET' && (req.url === '/' || req.url === '/list')) {
      const list = listMarkdown(VAULT);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: list.length, files: list }));
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/note/')) {
      const rel = decodeURIComponent(req.url.slice('/note/'.length));
      try {
        const abs = safeJoin(VAULT, rel);
        const content = fs.readFileSync(abs, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/markdown' });
        res.end(content);
      } catch (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
      return;
    }

    // fallback
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => console.log('Obsidian MCP listening on', PORT, 'VAULT=', VAULT));
