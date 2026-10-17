import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { config } from '../config.js';
import { settings } from '../store.js';
import { clearCache, currentToken, MetaApiError, rawRequest, tokenSource } from '../meta/client.js';

export const settingsRouter = Router();

let statusCache = null;

async function inspectToken(token) {
  const appToken = config.meta.appId && config.meta.appSecret ? `${config.meta.appId}|${config.meta.appSecret}` : token;
  const [debug, me] = await Promise.all([
    rawRequest('debug_token', { input_token: token }, appToken),
    rawRequest('me', { fields: 'id,name' }, token).catch(() => null),
  ]);
  const d = debug.data || {};
  return {
    valid: Boolean(d.is_valid),
    type: d.type || null,
    appId: d.app_id || null,
    appName: d.application || null,
    userId: d.user_id || me?.id || null,
    userName: me?.name || null,
    scopes: d.scopes || [],
    // expires_at = 0 significa token sem expiração (ex.: usuário do sistema).
    expiresAt: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : null,
    neverExpires: d.expires_at === 0,
    dataAccessExpiresAt: d.data_access_expires_at ? new Date(d.data_access_expires_at * 1000).toISOString() : null,
    error: d.error?.message || null,
  };
}

async function tokenStatus({ fresh = false } = {}) {
  if (!fresh && statusCache && statusCache.expires > Date.now()) return statusCache.value;
  const token = currentToken();
  const base = {
    source: tokenSource(),
    updatedAt: settings.get().metaTokenUpdatedAt || null,
    exchangeAvailable: Boolean(config.meta.appId && config.meta.appSecret),
    apiVersion: config.meta.apiVersion,
  };
  let value;
  if (!token) {
    value = { ...base, configured: false, info: null };
  } else {
    try {
      value = { ...base, configured: true, info: await inspectToken(token) };
    } catch (err) {
      value = { ...base, configured: true, info: { valid: false, error: err.message } };
    }
  }
  statusCache = { value, expires: Date.now() + 5 * 60_000 };
  return value;
}

/** Troca um token de curta duração por um de ~60 dias (exige META_APP_ID e META_APP_SECRET). */
async function exchangeForLongLived(token) {
  const body = await rawRequest('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: config.meta.appId,
    client_secret: config.meta.appSecret,
    fb_exchange_token: token,
  }, token);
  return body.access_token;
}

settingsRouter.get('/meta', async (req, res) => {
  res.json(await tokenStatus({ fresh: req.query.fresh === '1' }));
});

settingsRouter.put('/meta', requireAdmin, async (req, res) => {
  let token = String(req.body?.token || '').trim();
  if (!/^[A-Za-z0-9|_-]{20,1000}$/.test(token)) {
    return res.status(400).json({ error: { message: 'Token em formato inválido.' } });
  }

  let info;
  try {
    info = await inspectToken(token);
  } catch (err) {
    return res.status(400).json({ error: { message: `Não foi possível validar o token: ${err.message}` } });
  }
  if (!info.valid) {
    return res.status(400).json({ error: { message: `Token inválido ou expirado. ${info.error || ''}`.trim() } });
  }
  if (!info.scopes.includes('ads_read') && !info.scopes.includes('ads_management')) {
    return res.status(400).json({ error: { message: 'O token precisa da permissão ads_read para ler as campanhas.' } });
  }

  let exchanged = false;
  const expiresSoon = info.expiresAt && new Date(info.expiresAt).getTime() - Date.now() < 7 * 86400_000;
  if (expiresSoon && config.meta.appId && config.meta.appSecret && info.appId === config.meta.appId) {
    try {
      token = await exchangeForLongLived(token);
      exchanged = true;
    } catch (err) {
      if (!(err instanceof MetaApiError)) throw err;
    }
  }

  settings.update({ metaToken: token, metaTokenUpdatedAt: new Date().toISOString() });
  clearCache();
  statusCache = null;
  res.json({ ...(await tokenStatus({ fresh: true })), exchanged });
});
