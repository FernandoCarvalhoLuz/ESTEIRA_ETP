// Google Drive (fotos e artes dos carros). Modo padrão, sem nenhuma configuração: a pasta do cliente é compartilhada
// como "Qualquer pessoa com o link" e a esteira lê pelo link. Opcional (pastas privadas): conta de serviço do Google.
import crypto from 'node:crypto';
import { settings } from '../store.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';
const FOLDER = 'application/vnd.google-apps.folder';
let cachedToken = null;

const serviceAccount = () => {
  const sa = settings.get().google?.serviceAccount;
  return sa?.client_email && sa?.private_key ? sa : null;
};

export function googlePublic() {
  const sa = serviceAccount();
  return { mode: sa ? 'service_account' : 'link', configured: Boolean(sa), clientEmail: sa?.client_email || '' };
}

export function saveServiceAccount(json) {
  let sa;
  try {
    sa = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    throw Object.assign(new Error('O arquivo da conta de serviço não é um JSON válido.'), { status: 400 });
  }
  if (sa?.type !== 'service_account' || !sa.client_email || !sa.private_key) {
    throw Object.assign(new Error('Use o JSON de uma conta de serviço do Google (tipo "service_account").'), { status: 400 });
  }
  settings.update({ google: { serviceAccount: { client_email: sa.client_email, private_key: sa.private_key, project_id: sa.project_id || '' } } });
  cachedToken = null;
  return googlePublic();
}

export function clearServiceAccount() {
  settings.update({ google: {} });
  cachedToken = null;
}

/** Aceita o link da pasta (drive.google.com/drive/folders/<id>?resourcekey=...) ou o id direto. */
export function parseFolderId(input) {
  const s = String(input || '').trim();
  return s.match(/folders\/([\w-]{10,})/)?.[1] || s.match(/[?&]id=([\w-]{10,})/)?.[1] || (/^[\w-]{10,}$/.test(s) ? s : null);
}

export function parseResourceKey(input) {
  return String(input || '').match(/[?&]resourcekey=([\w-]+)/)?.[1] || null;
}

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime' };
const mimeOf = (name) => MIME[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream';
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// ---------------------------------------------------------------- Modo link (sem configuração)

async function linkFolder(folderId, resourceKey) {
  const url = `https://drive.google.com/embeddedfolderview?id=${folderId}${resourceKey ? `&resourcekey=${resourceKey}` : ''}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw Object.assign(new Error('Não consegui abrir a pasta. No Drive, clique em Compartilhar › Acesso geral › "Qualquer pessoa com o link" (Leitor) e cole o link de novo.'), { status: 400 });
  }
  const html = await res.text();
  const name = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] || '');
  const files = [];
  for (const m of html.matchAll(/<div class="flip-entry" id="entry-([^"]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g)) {
    const isFolder = m[2].includes('/folders/');
    const fileName = decode(m[3]).trim();
    files.push({
      id: m[1],
      name: fileName,
      mimeType: isFolder ? FOLDER : mimeOf(fileName),
      thumbnailLink: isFolder ? null : `https://lh3.googleusercontent.com/d/${m[1]}=w360`,
    });
  }
  return { id: folderId, name, files };
}

async function linkDownload(fileId) {
  for (const url of [`https://drive.google.com/uc?export=download&id=${fileId}`, `https://lh3.googleusercontent.com/d/${fileId}=w2400`]) {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(90_000) });
    if (res.ok && !String(res.headers.get('content-type')).includes('text/html')) return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('Não consegui baixar o arquivo do Drive (verifique se a pasta continua compartilhada pelo link).');
}

// ---------------------------------------------------------------- Conta de serviço (pastas privadas)

const b64url = (data) => Buffer.from(data).toString('base64url');

async function accessToken() {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google: ${body.error_description || body.error || res.status}`);
  cachedToken = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cachedToken.token;
}

async function driveGet(path, params = {}) {
  const token = await accessToken();
  const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
  for (const [k, v] of Object.entries({ supportsAllDrives: 'true', ...params })) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(res.status === 404 ? 'Pasta não encontrada ou não compartilhada com a conta de serviço.' : `Google Drive: ${body.error?.message || res.status}`);
  }
  return res;
}

async function apiFolder(folderId) {
  const info = await (await driveGet(`files/${folderId}`, { fields: 'id, name' })).json();
  const files = [];
  let pageToken;
  do {
    const res = await driveGet('files', {
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, thumbnailLink, imageMediaMetadata(width, height))',
      pageSize: '1000',
      includeItemsFromAllDrives: 'true',
      orderBy: 'name',
      ...(pageToken ? { pageToken } : {}),
    });
    const body = await res.json();
    files.push(...(body.files || []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return { id: folderId, name: info.name, files };
}

// ---------------------------------------------------------------- API do módulo

/** Lista uma pasta: pelo link (padrão) ou pela conta de serviço quando ela estiver configurada. */
export async function readFolder(folderId, resourceKey) {
  if (serviceAccount()) {
    try {
      return await apiFolder(folderId);
    } catch (err) {
      // Pasta compartilhada só pelo link continua funcionando mesmo com a conta de serviço configurada.
      return linkFolder(folderId, resourceKey).catch(() => { throw err; });
    }
  }
  return linkFolder(folderId, resourceKey);
}

export async function folderInfo(folderId, resourceKey) {
  const f = await readFolder(folderId, resourceKey);
  const folders = f.files.filter((x) => x.mimeType === FOLDER).length;
  return { id: f.id, name: f.name, folders, files: f.files.length - folders };
}

export async function downloadFile(fileId) {
  if (serviceAccount()) {
    try {
      const res = await driveGet(`files/${fileId}`, { alt: 'media' });
      return Buffer.from(await res.arrayBuffer());
    } catch { /* tenta pelo link */ }
  }
  return linkDownload(fileId);
}

// A miniatura que a API do Drive devolve é um link temporário (expira em poucas horas); a revisão pede por aqui,
// que busca um link novo e guarda a imagem por um tempo.
const thumbCache = new Map(); // fileId -> { at, type, buf }
const THUMB_TTL = 60 * 60_000;

/** Miniatura atual de um arquivo do Drive: { type, buf }. */
export async function fileThumb(fileId) {
  const hit = thumbCache.get(fileId);
  if (hit && Date.now() - hit.at < THUMB_TTL) return hit;
  const urls = [];
  if (serviceAccount()) {
    try {
      const { thumbnailLink } = await (await driveGet(`files/${fileId}`, { fields: 'thumbnailLink' })).json();
      if (thumbnailLink) urls.push(thumbnailLink.replace(/=sd+$/, '=s480'));
    } catch { /* tenta pelo link */ }
  }
  urls.push(`https://lh3.googleusercontent.com/d/${fileId}=w480`);
  for (const url of urls) {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    const type = res?.headers.get('content-type') || '';
    if (!res?.ok || !type.startsWith('image/')) continue;
    const out = { at: Date.now(), type, buf: Buffer.from(await res.arrayBuffer()) };
    if (thumbCache.size > 600) thumbCache.clear();
    thumbCache.set(fileId, out);
    return out;
  }
  return null;
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const GENERIC = new Set(['FLEX', 'AUT', 'AUTOMATICO', 'MANUAL', 'TURBO', 'TB', 'DIESEL', 'GASOLINA', 'COM', 'KM', 'CD', 'CS', '4X2', '4X4', 'DE', 'DA', 'DO', 'MEC']);
const tokens = (s) => norm(s).split(/[^A-Z0-9.]+/).map((w) => w.replace(/\.$/, '')).filter((w) => w.length >= 2 && !GENERIC.has(w));

/** Pontua o nome da pasta contra o veículo (o modelo precisa bater; versão, ano e cor somam). */
export function folderScore(folderName, vehicle) {
  const have = new Set(tokens(folderName));
  const model = tokens(vehicle.model);
  const rest = tokens(`${vehicle.version} ${vehicle.color || ''}`);
  const year = String(vehicle.year || '').match(/(19|20)\d\d/g) || [];
  if (!model.length || !model.every((w) => have.has(w))) return 0;
  const restHit = rest.filter((w) => have.has(w)).length / Math.max(1, rest.length);
  const yearHit = year.some((y) => have.has(y)) ? 0.3 : year.length ? -0.2 : 0;
  return 0.5 + restHit * 0.3 + yearHit;
}

const isImage = (f) => f.mimeType?.startsWith('image/');
const ART_FOLDER = /arte|canva|criativ|post|feed|stor/i;

/**
 * Acha a subpasta do carro na pasta do cliente e separa fotos e artes. Arte = PNG ou arquivo com "feed"/"stories"
 * no nome, ou que esteja numa subpasta "Artes"/"Canva" dentro da pasta do carro.
 */
export async function findVehicleMedia(rootFolderId, vehicle, resourceKey) {
  let best;
  let ranked = [];
  if (vehicle.folderId) {
    // Carro do estoque pelo Drive: a pasta já é conhecida.
    best = { f: { id: vehicle.folderId, name: vehicle.folderName || vehicle.title }, score: 1 };
  } else {
    const root = await readFolder(rootFolderId, resourceKey);
    const folders = root.files.filter((f) => f.mimeType === FOLDER);
    ranked = folders.map((f) => ({ f, score: folderScore(f.name, vehicle) })).filter((x) => x.score > 0.3).sort((a, b) => b.score - a.score);
    best = ranked[0];
    if (!best) return { folder: null, candidates: folders.slice(0, 60).map((f) => ({ id: f.id, name: f.name })), photos: [], arts: [] };
  }
  const inside = await readFolder(best.f.id);
  let files = inside.files.filter(isImage).map((f) => ({ ...f, fromArtFolder: false }));
  for (const sub of inside.files.filter((f) => f.mimeType === FOLDER && ART_FOLDER.test(f.name))) {
    const s = await readFolder(sub.id).catch(() => null);
    if (s) files = files.concat(s.files.filter(isImage).map((f) => ({ ...f, fromArtFolder: true })));
  }
  const toItem = (f) => ({ id: f.id, name: f.name, mime: f.mimeType, thumb: f.thumbnailLink || null, width: f.imageMediaMetadata?.width || null, height: f.imageMediaMetadata?.height || null });
  const isArt = (f) => f.fromArtFolder || f.mimeType === 'image/png' || /feed|stor|arte|canva|\bst\b/i.test(f.name);
  return {
    folder: { id: best.f.id, name: best.f.name, score: best.score },
    photos: files.filter((f) => !isArt(f)).map(toItem),
    arts: files.filter(isArt).map(toItem),
    alternatives: ranked.slice(1, 4).map((x) => ({ id: x.f.id, name: x.f.name })),
  };
}

// Compatibilidade com chamadas antigas.
export const findVehiclePhotos = findVehicleMedia;
