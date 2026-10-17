import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import { config } from './config.js';
import { authRouter, requireAuth } from './auth.js';
import { metaRouter } from './routes/meta.js';
import { settingsRouter } from './routes/settings.js';
import { builderRouter } from './routes/builder.js';
import { autoRouter } from './routes/auto.js';
import { startWatcher } from './auto/clients.js';
import { MetaApiError } from './meta/client.js';
import { listUsers } from './store.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api', requireAuth);
app.use('/api/meta', metaRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/builder', builderRouter);
app.use('/api/auto', autoRouter);
app.use('/api', (req, res) => res.status(404).json({ error: { message: 'Rota não encontrada.' } }));

// Frontend (build do Vite em web/dist).
const indexHtml = path.join(config.distDir, 'index.html');
app.use('/assets', express.static(path.join(config.distDir, 'assets'), { maxAge: '1y', immutable: true }));
app.use(express.static(config.distDir, { index: false }));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (!fs.existsSync(indexHtml)) return res.status(503).send('Frontend não compilado. Rode "npm run build".');
  res.set('Cache-Control', 'no-cache');
  res.sendFile(indexHtml);
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof MetaApiError) {
    const code = {
      token: 'META_TOKEN',
      rate_limit: 'META_RATE_LIMIT',
      permission: 'META_PERMISSION',
    }[err.kind] || 'META_ERROR';
    const message = err.kind === 'token'
      ? 'O token da Meta expirou ou é inválido. Atualize-o em Configurações.'
      : err.kind === 'rate_limit'
        ? 'Limite de requisições da Meta atingido. Aguarde alguns minutos e tente de novo.'
        : err.message;
    console.warn(`[meta] ${err.kind} code=${err.metaCode} ${err.message} trace=${err.fbtraceId || '-'}`);
    return res.status(502).json({ error: { message, code } });
  }
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: { message: err.message } });
  console.error(err);
  res.status(500).json({ error: { message: 'Erro interno no servidor.' } });
});

app.listen(config.port, config.host, () => {
  console.log(`Esteira de Tráfego rodando em http://${config.host}:${config.port}`);
  startWatcher();
  if (listUsers().length === 0) {
    console.warn('Nenhum usuário cadastrado. Crie um com: npm run user:create -- <usuario> <senha> "<Nome>"');
  }
});
