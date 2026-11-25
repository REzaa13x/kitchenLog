import express from 'express';
import { fileURLToPath } from 'node:url';
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
export function registerFrontend(app) {
  app.use(express.static(dist, { dotfiles: 'deny', index: false, maxAge: '1h', setHeaders(res, path) { if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get('*', (req, res, next) => {
    if (req.path.split('/').some(part => part.includes('.')) || !req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile('index.html', { root: dist });
  });
  app.use((_req, res) => res.status(404).json({ error: 'Tidak ditemukan.' }));
}
