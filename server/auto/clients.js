// Fontes de cada cliente (site, Google Drive, Canva), padrão aprendido, cache do estoque e aviso de carros novos.
// Estoque: do site do cliente ou, sem site, das pastas de carro no Drive (descrição em .docx — driveStock.js).
import { collection } from '../store.js';
import { detectPlatform, listStock, PLATFORMS } from './sites.js';
import { parseFolderId, parseResourceKey } from './drive.js';
import { parseDesignId, parseTemplateRef, resolveCanvaLink } from './canvaConnect.js';
import { analyzeClient } from './pattern.js';
import { artEngine, cleanArt, hasLogo } from './artMaker.js';
import { listDriveStock } from './driveStock.js';

export const clients = collection('auto-clients');

const STOCK_TTL = 30 * 60_000;
const PATTERN_TTL = 7 * 24 * 3600_000;
const WATCH_EVERY = 6 * 3600_000;

export function getClient(accountId) {
  return clients.list().find((c) => c.accountId === accountId) || null;
}

function upsert(accountId, patch) {
  const current = getClient(accountId);
  if (current) return clients.update(current.id, typeof patch === 'function' ? patch(current) : patch);
  return clients.insert({ accountId, site: null, drive: null, canva: null, pattern: null, stock: null, knownIds: null, news: [], ...(typeof patch === 'function' ? patch({}) : patch) });
}

/** Resumo para a interface (sem o estoque inteiro nem o padrão completo). */
export function clientSummary(c) {
  if (!c) return null;
  const p = c.pattern;
  return {
    accountId: c.accountId,
    site: c.site,
    drive: c.drive,
    canva: c.canva,
    stockSource: c.site?.url ? 'site' : c.drive?.folderId ? 'drive' : null,
    art: { engine: 'etp', layout: 'vitrine', colors: {}, ...c.art, hasLogo: hasLogo(c.accountId), activeEngine: artEngine(c) },
    stockCount: c.stock?.items?.length ?? null,
    stockCheckedAt: c.stock?.checkedAt || null,
    news: (c.news || []).filter((n) => !n.dismissed),
    pattern: p ? {
      analyzedAt: p.analyzedAt,
      objective: p.objective,
      campaignsAnalyzed: p.campaignsAnalyzed,
      structures: p.structures,
      preferredStructure: p.preferredStructure,
      medianBudget: p.medianBudget,
      adNamePattern: p.adNamePattern,
      style: p.style,
      examples: p.examples,
      single: p.single ? { campaignId: p.single.campaignId, campaignName: p.single.campaignName, metrics: p.single.metrics, naming: p.single.config.naming.campaign, budget: p.single.config.budget, adsets: p.single.config.adsets } : null,
      multi: p.multi ? { campaignId: p.multi.campaignId, campaignName: p.multi.campaignName, metrics: p.multi.metrics, cars: p.multi.cars, naming: p.multi.config.naming.campaign, budget: p.multi.config.budget, adsets: p.multi.config.adsets } : null,
    } : null,
  };
}

export async function saveSources(accountId, { siteUrl, driveFolder, canvaDesign, canvaTemplate }) {
  const patch = {};
  if (siteUrl !== undefined) {
    if (!siteUrl) patch.site = null;
    else {
      const { base, platform } = await detectPlatform(siteUrl);
      patch.site = { url: base, platform, platformLabel: PLATFORMS[platform] };
      patch.stock = null;
      patch.knownIds = null;
    }
  }
  if (driveFolder !== undefined) {
    const id = parseFolderId(driveFolder);
    if (driveFolder && !id) throw Object.assign(new Error('Link da pasta do Drive inválido. Cole o link da pasta do cliente (drive.google.com/drive/folders/...).'), { status: 400 });
    const resourceKey = parseResourceKey(driveFolder);
    patch.drive = id ? { folderId: id, resourceKey, folderUrl: `https://drive.google.com/drive/folders/${id}${resourceKey ? `?resourcekey=${resourceKey}` : ''}`, folderName: null } : null;
  }
  if (canvaDesign !== undefined) {
    const id = parseDesignId(await resolveCanvaLink(canvaDesign));
    if (canvaDesign && !id) throw Object.assign(new Error('Link do design do Canva inválido. Cole o link do design (canva.com/design/... ou canva.link/...).'), { status: 400 });
    const prev = getClient(accountId)?.canva || {};
    patch.canva = id || prev.templateId
      ? { ...prev, designId: id || null, designUrl: id ? `https://www.canva.com/design/${id}/edit` : null }
      : null;
  }
  // Design-modelo com campos de dados (Autofill) para criar artes de carros sem página pronta.
  if (canvaTemplate !== undefined) {
    const ref = parseTemplateRef(await resolveCanvaLink(canvaTemplate));
    if (canvaTemplate && !ref) throw Object.assign(new Error('Link do modelo do Canva inválido. Cole o link do modelo (canva.com/brand/brand-templates/..., canva.com/design/... ou canva.link/...).'), { status: 400 });
    const prev = patch.canva !== undefined ? patch.canva || {} : getClient(accountId)?.canva || {};
    const next = {
      ...prev,
      templateId: ref?.id || null,
      templateKind: ref?.kind || null,
      templateUrl: ref ? (ref.kind === 'brand' ? `https://www.canva.com/brand/brand-templates/${ref.id}` : `https://www.canva.com/design/${ref.id}/edit`) : null,
    };
    delete next.templateDesignId;
    patch.canva = next.designId || next.templateId ? next : null;
  }
  return clientSummary(upsert(accountId, patch));
}

/** Configuração da arte nova do cliente: motor (gerador da esteira ou Canva), layout e cores. */
export function saveArt(accountId, input) {
  return clientSummary(upsert(accountId, (cur) => ({ art: cleanArt(input || {}, cur.art || {}) })));
}

export function patchClient(accountId, patch) {
  return upsert(accountId, patch);
}

export async function ensurePattern(accountId, { force } = {}) {
  const c = getClient(accountId);
  if (!force && c?.pattern && Date.now() - new Date(c.pattern.analyzedAt).getTime() < PATTERN_TTL) return c.pattern;
  const pattern = await analyzeClient(accountId);
  upsert(accountId, { pattern });
  return pattern;
}

/**
 * Estoque (cache de 30 min): do site ou, sem site, das pastas do Drive. Na primeira leitura, marca tudo como
 * conhecido (sem avisos falsos de "novo").
 */
export async function getStock(accountId, { fresh } = {}) {
  const c = getClient(accountId);
  if (!c?.site?.url && !c?.drive?.folderId) throw Object.assign(new Error('Este cliente ainda não tem o site nem a pasta do Drive configurados nas fontes da Esteira Automática.'), { status: 400 });
  if (!fresh && c.stock?.items && Date.now() - new Date(c.stock.checkedAt).getTime() < STOCK_TTL) return c.stock;
  const items = c.site?.url ? await listStock(c.site) : await listDriveStock(c.drive);
  const checkedAt = new Date().toISOString();
  upsert(accountId, (cur) => {
    const known = new Set(cur.knownIds || []);
    const first = !cur.knownIds;
    const news = [...(cur.news || [])];
    if (!first) {
      for (const v of items) {
        if (!known.has(v.id) && !news.some((n) => n.id === v.id)) {
          news.unshift({ id: v.id, title: v.title, price: v.price, km: v.km, year: v.year, thumb: v.thumb, url: v.url, detectedAt: checkedAt, dismissed: false });
        }
      }
    }
    const inStock = new Set(items.map((v) => v.id));
    return {
      stock: { items, checkedAt },
      knownIds: [...new Set([...known, ...items.map((v) => v.id)])],
      // Some com o aviso quando o carro sai do estoque; guarda no máximo 40.
      news: news.filter((n) => inStock.has(n.id)).slice(0, 40),
    };
  });
  return getClient(accountId).stock;
}

export function dismissNews(accountId, vehicleId) {
  return upsert(accountId, (cur) => ({ news: (cur.news || []).map((n) => (n.id === vehicleId ? { ...n, dismissed: true } : n)) }));
}

export function markNewsUsed(accountId, vehicleIds, draftId) {
  return upsert(accountId, (cur) => ({ news: (cur.news || []).map((n) => (vehicleIds.includes(n.id) ? { ...n, dismissed: true, draftId } : n)) }));
}

export function allNews() {
  return clients.list().flatMap((c) => (c.news || []).filter((n) => !n.dismissed).map((n) => ({ ...n, accountId: c.accountId })));
}

/** Confere o estoque de todos os clientes configurados — site ou pastas do Drive (a cada 6 horas). */
export async function checkAllSites() {
  const results = [];
  for (const c of clients.list().filter((x) => x.site?.url || x.drive?.folderId)) {
    try {
      await getStock(c.accountId, { fresh: true });
      results.push({ accountId: c.accountId, ok: true });
    } catch (err) {
      results.push({ accountId: c.accountId, ok: false, error: err.message });
    }
  }
  return results;
}

export function startWatcher() {
  const run = () => checkAllSites().catch((err) => console.warn('[esteira-auto] falha ao conferir sites:', err.message));
  setTimeout(run, 60_000).unref();
  setInterval(run, WATCH_EVERY).unref();
}
