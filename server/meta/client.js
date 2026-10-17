// Cliente da Graph API da Meta com cache em memória, deduplicação de requisições e paginação.
import { config } from '../config.js';
import { settings } from '../store.js';

const BASE_URL = 'https://graph.facebook.com';
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80003, 80004, 80005, 80006, 80008, 80014]);
const TOKEN_CODES = new Set([102, 190, 463, 467]);

export class MetaApiError extends Error {
  constructor(err = {}, httpStatus = 502) {
    const userMsg = err.error_user_msg ? [err.error_user_title, err.error_user_msg].filter(Boolean).join(': ') : null;
    super(userMsg || err.message || 'Erro ao consultar a API da Meta.');
    this.name = 'MetaApiError';
    this.metaCode = err.code;
    this.metaSubcode = err.error_subcode;
    this.httpStatus = httpStatus;
    this.fbtraceId = err.fbtrace_id;
    if (TOKEN_CODES.has(err.code)) this.kind = 'token';
    else if (RATE_LIMIT_CODES.has(err.code)) this.kind = 'rate_limit';
    else if (err.code === 10 || (err.code >= 200 && err.code < 300)) this.kind = 'permission';
    else this.kind = 'other';
  }
}

export function currentToken() {
  return settings.get().metaToken || config.meta.token || '';
}

export function tokenSource() {
  if (settings.get().metaToken) return 'interface';
  if (config.meta.token) return 'env';
  return null;
}

function buildUrl(pathOrUrl, params, token) {
  const url = /^https?:\/\//.test(pathOrUrl)
    ? new URL(pathOrUrl)
    : new URL(`${BASE_URL}/${config.meta.apiVersion}/${pathOrUrl.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  if (token) url.searchParams.set('access_token', token);
  return url;
}

export async function rawRequest(pathOrUrl, params, token = currentToken()) {
  requireToken(token);
  const res = await fetch(buildUrl(pathOrUrl, params, token), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(45_000),
  });
  return parseResponse(res);
}

async function parseResponse(res) {
  let body;
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (!res.ok || body.error) throw new MetaApiError(body.error || { message: `HTTP ${res.status}` }, res.status);
  return body;
}

function requireToken(token) {
  if (!token) {
    throw new MetaApiError({ code: 190, message: 'Nenhum token da Meta configurado. Acesse Configurações para informar um token.' }, 401);
  }
}

/** POST/DELETE na Graph API (campos objeto vão como JSON, como a Meta espera). Nunca usa cache. */
export async function graphWrite(path, params = {}, { method = 'POST', token = currentToken(), timeout = 60_000 } = {}) {
  requireToken(token);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  body.set('access_token', token);
  const res = await fetch(`${BASE_URL}/${config.meta.apiVersion}/${path.replace(/^\//, '')}`, {
    method,
    body,
    signal: AbortSignal.timeout(timeout),
  });
  return parseResponse(res);
}

/** Upload multipart (imagens e vídeos). `files` = [{ field, blob, filename }]. */
export async function graphUpload(path, fields, files, { token = currentToken(), timeout = 15 * 60_000 } = {}) {
  requireToken(token);
  const form = new FormData();
  for (const [key, value] of Object.entries(fields || {})) {
    if (value !== undefined && value !== null) form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  for (const f of files) form.append(f.field, f.blob, f.filename);
  form.set('access_token', token);
  const res = await fetch(`${BASE_URL}/${config.meta.apiVersion}/${path.replace(/^\//, '')}`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(timeout),
  });
  return parseResponse(res);
}

const cache = new Map();
const inflight = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expires <= now) cache.delete(key);
}, 60_000).unref();

export function clearCache() {
  cache.clear();
}

/**
 * GET na Graph API. Com `all: true`, segue `paging.next` e devolve `{ data: [...] }` com todas as páginas.
 */
export async function graph(path, params = {}, { all = false, fresh = false, ttl = config.cacheTtlSeconds, maxPages = 25 } = {}) {
  const key = JSON.stringify([path, params, all]);
  if (!fresh) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
  }
  if (inflight.has(key)) return inflight.get(key);

  const token = currentToken();
  const promise = (async () => {
    let body = await rawRequest(path, params, token);
    if (all) {
      const data = [...(body.data || [])];
      let next = body.paging?.next;
      for (let page = 1; next && page < maxPages; page++) {
        const nextBody = await rawRequest(next, null, token);
        data.push(...(nextBody.data || []));
        next = nextBody.paging?.next;
      }
      body = { data };
    }
    cache.set(key, { value: body, expires: Date.now() + ttl * 1000 });
    return body;
  })().finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

/** Executa `fn` sobre os itens com no máximo `limit` chamadas simultâneas. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
