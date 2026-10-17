// Canva Connect API: a equipe conecta a conta do Canva (OAuth com PKCE) e a esteira lê as páginas do design de cada
// cliente (um design com uma página por carro) e exporta as artes de feed e stories em PNG.
// Quando o carro não tem página pronta, cria uma arte nova a partir do design-modelo do cliente (Autofill):
// envia a foto como asset e preenche os campos de dados (nome, preço, KM, foto…) num design novo.
import crypto from 'node:crypto';
import { settings } from '../store.js';

const API = 'https://api.canva.com/rest/v1';
const SCOPES = 'design:meta:read design:content:read design:content:write asset:read asset:write brandtemplate:meta:read brandtemplate:content:read folder:read profile:read';
// Permissões necessárias para criar artes novas (Autofill + upload da foto).
const CREATE_SCOPES = ['design:content:write', 'asset:write', 'brandtemplate:meta:read', 'brandtemplate:content:read'];
const hasScopes = (granted, list) => Boolean(granted) && list.every((x) => String(granted).split(/\s+/).includes(x));
const pending = new Map(); // state → { verifier, createdAt }

function canvaSettings() {
  return settings.get().canva || {};
}

export function canvaPublic(origin) {
  const c = canvaSettings();
  return {
    configured: Boolean(c.clientId && c.clientSecret),
    connected: Boolean(c.tokens?.refresh_token),
    clientIdHint: c.clientId ? `${c.clientId.slice(0, 6)}…` : '',
    user: c.user || null,
    redirectUri: redirectUri(origin),
    // Tokens antigos não guardavam as permissões: sem esse registro, falta reconectar para criar artes.
    canCreate: Boolean(c.tokens?.refresh_token) && hasScopes(c.tokens?.scope, CREATE_SCOPES),
  };
}

export function redirectUri(origin) {
  return `${origin || canvaSettings().origin || ''}/api/auto/canva/callback`;
}

export function saveCanvaApp({ clientId, clientSecret, origin }) {
  const c = canvaSettings();
  settings.update({
    canva: {
      ...c,
      ...(clientId ? { clientId: String(clientId).trim() } : {}),
      ...(clientSecret ? { clientSecret: String(clientSecret).trim() } : {}),
      ...(origin ? { origin } : {}),
    },
  });
}

export function disconnectCanva() {
  const c = canvaSettings();
  settings.update({ canva: { ...c, tokens: null, user: null } });
}

/** URL de autorização do Canva (o usuário volta para /api/auto/canva/callback). */
export function authorizeUrl(origin) {
  const c = canvaSettings();
  if (!c.clientId) throw Object.assign(new Error('Informe o Client ID e o Client Secret da integração do Canva primeiro.'), { status: 400 });
  const verifier = crypto.randomBytes(64).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(24).toString('base64url');
  pending.set(state, { verifier, createdAt: Date.now(), origin });
  for (const [k, v] of pending) if (Date.now() - v.createdAt > 15 * 60_000) pending.delete(k);
  saveCanvaApp({ origin });
  const url = new URL('https://www.canva.com/api/oauth/authorize');
  url.search = new URLSearchParams({
    code_challenge_method: 's256',
    response_type: 'code',
    client_id: c.clientId,
    redirect_uri: redirectUri(origin),
    scope: SCOPES,
    code_challenge: challenge,
    state,
  }).toString();
  return url.toString();
}

async function tokenRequest(params) {
  const c = canvaSettings();
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Canva: ${body.error_description || body.message || body.error || res.status}`);
  const tokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token || c.tokens?.refresh_token,
    expires_at: Date.now() + (body.expires_in || 3600) * 1000,
    scope: body.scope || c.tokens?.scope || null,
  };
  settings.update({ canva: { ...canvaSettings(), tokens } });
  return tokens;
}

export async function handleCallback({ code, state }) {
  const p = pending.get(state);
  if (!p) throw Object.assign(new Error('Sessão de conexão com o Canva expirada. Tente conectar de novo.'), { status: 400 });
  pending.delete(state);
  await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: p.verifier, redirect_uri: redirectUri(p.origin) });
  const me = await canvaGet('/users/me/profile').catch(() => null);
  settings.update({ canva: { ...canvaSettings(), user: me?.profile?.display_name || null } });
}

async function accessToken() {
  const c = canvaSettings();
  if (!c.tokens?.refresh_token) throw Object.assign(new Error('Conecte a conta do Canva em Esteira Automática › Fontes.'), { status: 400 });
  if (c.tokens.access_token && c.tokens.expires_at > Date.now() + 60_000) return c.tokens.access_token;
  return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: c.tokens.refresh_token })).access_token;
}

/** Erros do Canva com orientação: falta de permissão (reconectar) ou de plano (Autofill). */
function canvaError(status, body) {
  const msg = body.message || body.error || String(status);
  if (status === 403 && /scope|permission/i.test(msg)) {
    return Object.assign(new Error('Canva: a conexão não tem permissão para criar artes. Clique em "Reconectar Canva" em Esteira Automática › Fontes.'), { status: 400 });
  }
  if (status === 403) return Object.assign(new Error(`Canva: sem acesso a esse recurso (${msg}). O preenchimento automático exige Canva Pro, Teams ou Enterprise.`), { status: 400 });
  return Object.assign(new Error(`Canva: ${msg}`), { status: status >= 500 ? 502 : 400 });
}

async function canvaGet(path, params) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(30_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw canvaError(res.status, body);
  return body;
}

async function canvaPost(path, payload, { raw, headers } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': raw ? 'application/octet-stream' : 'application/json', ...headers },
    body: raw || JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw canvaError(res.status, body);
  return body;
}

/**
 * Aceita o link (ou id) de um modelo para artes novas: brand template (canva.com/brand/brand-templates/<id>)
 * ou design com campos de dados (canva.com/design/<id>). Devolve { id, kind: 'brand' | 'design' } ou null.
 */
export function parseTemplateRef(input) {
  const s = String(input || '').trim();
  const brand = s.match(/brand-templates?\/([A-Za-z0-9_-]{6,})/)?.[1];
  if (brand) return { id: brand, kind: 'brand' };
  const design = parseDesignId(s);
  if (design) return { id: design, kind: 'design' };
  if (/^EA[A-Za-z0-9_-]{6,}$/.test(s)) return { id: s, kind: 'brand' };
  return null;
}

/** Aceita o link do design (canva.com/design/<id>/...) ou o id. */
export function parseDesignId(input) {
  const s = String(input || '').trim();
  return s.match(/design\/([A-Za-z0-9_-]{8,})/)?.[1] || (/^D[A-Za-z0-9_-]{8,}$/.test(s) ? s : null);
}

/**
 * Resolve links curtos do Canva (canva.link/xxxx) seguindo o redirecionamento — sem login nem API.
 * Devolve o link completo do design, ou o texto original se não for um link curto.
 */
export async function resolveCanvaLink(input) {
  const s = String(input || '').trim();
  let url;
  try { url = new URL(s); } catch { return s; }
  if (!/^(www\.)?canva\.(link|com)$/i.test(url.hostname)) return s;
  if (parseDesignId(s)) return s;
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; ETP)' } }).catch(() => null);
  const next = res?.headers.get('location');
  return next ? new URL(next, url).href : s;
}

export async function searchDesigns(query) {
  const body = await canvaGet('/designs', { query, ownership: 'any', sort_by: 'modified_descending' });
  return (body.items || []).map((d) => ({ id: d.id, title: d.title || 'Sem título', thumb: d.thumbnail?.url || null, pages: d.page_count || null, updatedAt: d.updated_at ? new Date(d.updated_at * 1000).toISOString() : null, url: d.urls?.edit_url || null }));
}

/** Título e miniatura do modelo, seja brand template ou design. */
export async function templateInfo({ id, kind }) {
  if (kind === 'brand') {
    const b = (await canvaGet(`/brand-templates/${id}`)).brand_template || {};
    return { id: b.id || id, title: b.title || 'Sem título', pages: null, thumb: b.thumbnail?.url || null, url: b.create_url || b.view_url || null };
  }
  return designInfo(id);
}

export async function designInfo(designId) {
  const body = await canvaGet(`/designs/${designId}`);
  const d = body.design || {};
  return { id: d.id, title: d.title || 'Sem título', pages: d.page_count || null, thumb: d.thumbnail?.url || null, url: d.urls?.edit_url || null };
}

/** Páginas do design com miniatura e formato (feed 4:5 / stories 9:16) pela proporção. */
export async function designPages(designId) {
  const items = [];
  for (let offset = 1; offset <= 500; offset += 200) {
    const body = await canvaGet(`/designs/${designId}/pages`, { offset, limit: 200 });
    items.push(...(body.items || []));
    if ((body.items || []).length < 200) break;
  }
  return items.map((p) => {
    const w = p.dimensions?.width || p.thumbnail?.width || 0;
    const h = p.dimensions?.height || p.thumbnail?.height || 0;
    const ratio = w && h ? h / w : 0;
    return { page: p.page_number || p.index, thumb: p.thumbnail?.url || null, width: w, height: h, format: ratio > 1.5 ? 'story' : ratio > 1.1 ? 'feed' : 'square' };
  });
}

// Os links de miniatura do Canva expiram em poucas horas; a revisão pede a miniatura por aqui, que busca um link
// novo quando precisa e guarda a imagem por um tempo.
const pagesCache = new Map(); // designId -> { at, pages }
const thumbCache = new Map(); // designId:page -> { at, type, buf }
const PAGES_TTL = 10 * 60_000;
const THUMB_TTL = 60 * 60_000;

/** Miniatura atual de uma página do design: { type, buf } (ou null se a página não existir). */
export async function pageThumb(designId, page) {
  const key = `${designId}:${page}`;
  const hit = thumbCache.get(key);
  if (hit && Date.now() - hit.at < THUMB_TTL) return hit;
  let cached = pagesCache.get(designId);
  if (!cached || Date.now() - cached.at > PAGES_TTL) {
    cached = { at: Date.now(), pages: await designPages(designId) };
    pagesCache.set(designId, cached);
  }
  const p = cached.pages.find((x) => x.page === page);
  if (!p?.thumb) return null;
  const res = await fetch(p.thumb, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) { pagesCache.delete(designId); throw new Error(`Canva: miniatura indisponível (HTTP ${res.status})`); }
  const out = { at: Date.now(), type: res.headers.get('content-type') || 'image/png', buf: Buffer.from(await res.arrayBuffer()) };
  if (thumbCache.size > 400) thumbCache.clear();
  thumbCache.set(key, out);
  return out;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Exporta páginas em PNG e devolve as URLs temporárias (na ordem das páginas pedidas). */
export async function exportPages(designId, pages) {
  const { job } = await canvaPost('/exports', { design_id: designId, format: { type: 'png', pages, export_quality: 'regular' } });
  for (let i = 0; i < 60; i++) {
    const body = await canvaGet(`/exports/${job.id}`);
    if (body.job?.status === 'success') return body.job.urls || [];
    if (body.job?.status === 'failed') throw new Error(`Canva: exportação falhou (${body.job.error?.message || 'sem detalhe'})`);
    await wait(2000);
  }
  throw new Error('Canva: a exportação demorou demais.');
}

/** Campos de dados (Autofill) do modelo: { NOME: { type: 'text' }, FOTO: { type: 'image' } … }. */
export async function templateDataset({ id, kind }) {
  const body = await canvaGet(kind === 'brand' ? `/brand-templates/${id}/dataset` : `/designs/${id}/dataset`);
  return body.dataset || {};
}

/** Envia uma imagem para os uploads do Canva e devolve o id do asset. */
export async function uploadAsset(buffer, name) {
  const meta = JSON.stringify({ name_base64: Buffer.from(String(name).slice(0, 50)).toString('base64') });
  const { job } = await canvaPost('/asset-uploads', null, { raw: buffer, headers: { 'Asset-Upload-Metadata': meta } });
  for (let i = 0; i < 60; i++) {
    const body = await canvaGet(`/asset-uploads/${job.id}`);
    if (body.job?.status === 'success') return body.job.asset.id;
    if (body.job?.status === 'failed') throw new Error(`Canva: envio da foto falhou (${body.job.error?.message || 'sem detalhe'})`);
    await wait(1500);
  }
  throw new Error('Canva: o envio da foto demorou demais.');
}

/** Cria um design novo a partir do modelo (brand template ou design), preenchendo os campos de dados. */
export async function autofillFromTemplate({ id, kind }, data, title) {
  const source = kind === 'brand' ? { type: 'create_from_brand_template', brand_template_id: id } : { type: 'create_from_design', design_id: id };
  const { job } = await canvaPost('/autofills', { ...source, data, ...(title ? { title: String(title).slice(0, 255) } : {}) });
  for (let i = 0; i < 90; i++) {
    const body = await canvaGet(`/autofills/${job.id}`);
    if (body.job?.status === 'success') {
      const d = body.job.result?.design || {};
      return {
        id: d.id,
        title: d.title,
        url: d.urls?.edit_url || d.url || `https://www.canva.com/design/${d.id}/edit`,
        thumb: d.thumbnail?.url || null,
        trial: body.job.result?.trial_information || null,
      };
    }
    if (body.job?.status === 'failed') throw new Error(`Canva: não foi possível criar a arte (${body.job.error?.message || body.job.error?.code || 'sem detalhe'})`);
    await wait(2000);
  }
  throw new Error('Canva: a criação da arte demorou demais.');
}
