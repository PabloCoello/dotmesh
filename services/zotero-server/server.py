#!/usr/bin/env python3
"""Zotero MCP - simple parser for Better BibTeX export (.bib)
Exposes endpoints:
- GET /health
- GET /items  -> returns parsed entries (basic fields)
- GET /items/<id> -> returns single entry

This is intentionally minimal and read-only.
"""
import os
import sys
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import unquote

BBT_PATH = os.environ.get(
    'ZOTERO_BBT_PATH',
    os.path.join(os.path.expanduser('~'), 'Documents', 'Zotero', 'betterbibtex.bib'),
)
PORT = int(os.environ.get('PORT', '3002'))

# Very small .bib parser for common @article{key, field = {value}, ...}

def parse_bib(path):
    if not os.path.exists(path):
        return []
    entries = []
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    parts = content.split('@')
    for part in parts:
        part = part.strip()
        if not part:
            continue
        try:
            kind, rest = part.split('{', 1)
            key, body = rest.split('}', 1)[0].split(',', 1)
            key = key.strip()
            fields = {}
            for line in body.split(','):
                if '=' in line:
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip().strip('{}').strip()
                    fields[k] = v
            entries.append({'id': key, 'type': kind.strip(), 'fields': fields})
        except Exception:
            # skip malformed
            continue
    return entries

entries_cache = parse_bib(BBT_PATH)

class Handler(BaseHTTPRequestHandler):
    def _send_json(self, obj, code=200):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode('utf-8'))

    def do_GET(self):
        if self.path == '/health':
            self._send_json({'status': 'ok'})
            return
        if self.path == '/items':
            self._send_json({'count': len(entries_cache), 'items': entries_cache})
            return
        if self.path.startswith('/items/'):
            ident = unquote(self.path[len('/items/'):])
            for e in entries_cache:
                if e['id'] == ident:
                    self._send_json(e)
                    return
            self._send_json({'error': 'not found'}, code=404)
            return
        # fallback
        self.send_response(404)
        self.end_headers()

def run():
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    print('Zotero MCP listening on', PORT, 'BBT=', BBT_PATH)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()

if __name__ == '__main__':
    run()
