// Esteira Automática: fontes por cliente, integrações (LLM, Google Drive, Canva), estoque, montagem e avisos.
import express, { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { accountList } from '../meta/service.js';
import { allNews, checkAllSites, clientSummary, dismissNews, ensurePattern, getClient, getStock, saveArt, saveSources } from '../auto/clients.js';
import { ART_LAYOUTS, photoStyle, pickCover, readLogo, removeLogo, saveLogo } from '../auto/artMaker.js';
import { artValues, LAYOUTS, renderArts } from '../auto/artRender.js';
import { rankPhotos } from '../auto/photoPick.js';
import { getJob, startBuild, swapMedia } from '../auto/build.js';
import { llmPublic, saveLlm, testLlm } from '../auto/llm.js';
import { clearServiceAccount, fileThumb, findVehicleMedia, folderInfo, googlePublic, saveServiceAccount } from '../auto/drive.js';
import {
  authorizeUrl, canvaPublic, designInfo, designPages, disconnectCanva, handleCallback, pageThumb, saveCanvaApp, searchDesigns, templateInfo,
} from '../auto/canvaConnect.js';
import { templateCheck } from '../auto/canvaArt.js';
import { drafts } from '../builder/drafts.js';
import { normalizeConfig, validateConfig } from '../../shared/esteira.js';

export const autoRouter = Router();

const ACCOUNT_ID = /^act_\d{5,25}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });
const account = (id) => {
  if (!ACCOUNT_ID.test(id || '')) throw fail(400, 'Conta inválida.');
  return id;
};
const originOf = (req) => `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;

// ---------- Integrações ----------

autoRouter.get('/settings', (req, res) => {
  res.json({ llm: llmPublic(), google: googlePublic(), canva: canvaPublic(originOf(req)) });
});

autoRouter.put('/settings/llm', requireAdmin, (req, res) => {
  res.json(saveLlm(req.body || {}));
});

autoRouter.post('/settings/llm/test', async (req, res) => {
  try {
    res.json(await testLlm());
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

autoRouter.put('/settings/google', requireAdmin, (req, res) => {
  if (req.body?.clear) {
    clearServiceAccount();
    return res.json(googlePublic());
  }
  res.json(saveServiceAccount(req.body?.serviceAccount));
});

autoRouter.put('/settings/canva', requireAdmin, (req, res) => {
  const { clientId, clientSecret, disconnect } = req.body || {};
  if (disconnect) disconnectCanva();
  else saveCanvaApp({ clientId, clientSecret, origin: originOf(req) });
  res.json(canvaPublic(originOf(req)));
});

autoRouter.get('/canva/connect', requireAdmin, (req, res) => {
  res.redirect(authorizeUrl(originOf(req)));
});

autoRouter.get('/canva/callback', async (req, res) => {
  try {
    if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
    await handleCallback({ code: String(req.query.code || ''), state: String(req.query.state || '') });
    res.redirect('/automatica/fontes?canva=ok');
  } catch (err) {
    res.redirect(`/automatica/fontes?canva=erro&msg=${encodeURIComponent(err.message)}`);
  }
});

autoRouter.get('/canva/designs', async (req, res) => {
  res.json(await searchDesigns(String(req.query.q || '')));
});

// ---------- Clientes ----------

autoRouter.get('/clients', async (req, res) => {
  const accounts = (await accountList()).filter((a) => a.status === 1);
  res.json(accounts.map((a) => ({ ...a, client: clientSummary(getClient(a.id)) })));
});

autoRouter.get('/clients/:accountId', (req, res) => {
  res.json(clientSummary(getClient(account(req.params.accountId))));
});

autoRouter.put('/clients/:accountId', async (req, res) => {
  const { siteUrl, driveFolder, canvaDesign, canvaTemplate } = req.body || {};
  const summary = await saveSources(account(req.params.accountId), { siteUrl, driveFolder, canvaDesign, canvaTemplate });
  // Confere as fontes na hora para o usuário saber se o acesso funciona.
  const checks = {};
  if (summary.drive?.folderId) {
    checks.drive = await folderInfo(summary.drive.folderId, summary.drive.resourceKey).then((x) => ({ ok: true, name: x.name, folders: x.folders }), (err) => ({ ok: false, error: err.message }));
  }
  if (summary.canva?.designId && canvaPublic().connected) {
    checks.canva = await designInfo(summary.canva.designId).then((d) => ({ ok: true, name: d.title, pages: d.pages }), (err) => ({ ok: false, error: err.message }));
  }
  if (summary.canva?.templateId && canvaPublic().connected) {
    const ref = { id: summary.canva.templateId, kind: summary.canva.templateKind || 'design' };
    checks.template = await Promise.all([templateInfo(ref), templateCheck(ref)])
      .then(([d, t]) => ({ ok: t.fields > 0, name: d.title, pages: d.pages, ...t, error: t.fields ? null : 'O modelo ainda não tem campos de dados (crie no Canva › Apps › Preenchimento automático de dados e publique como modelo de marca).' }), (err) => ({ ok: false, error: err.message }));
  }
  res.json({ ...summary, checks });
});

autoRouter.post('/clients/:accountId/analyze', async (req, res) => {
  await ensurePattern(account(req.params.accountId), { force: true });
  res.json(clientSummary(getClient(req.params.accountId)));
});

autoRouter.get('/clients/:accountId/stock', async (req, res) => {
  const stock = await getStock(account(req.params.accountId), { fresh: req.query.fresh === '1' });
  res.json({
    checkedAt: stock.checkedAt,
    items: stock.items.map((v) => ({
      id: v.id, title: v.title, brand: v.brand, model: v.model, version: v.version, year: v.year, km: v.km, price: v.price, color: v.color, thumb: v.thumb || v.photos?.[0] || null, url: v.url, addedAt: v.addedAt || null,
      // Estoque pelas pastas do Drive: arte já pronta na pasta, nº de fotos e se tem a descrição (.docx).
      source: v.source || 'site', hasArts: v.hasArts ?? null, photoCount: v.photoCount ?? null, hasDescription: v.hasDescription ?? null, transmission: v.transmission || '',
    })),
  });
});

// ---------- Arte nova (gerador da esteira) ----------

autoRouter.get('/art/layouts', (req, res) => {
  res.json(ART_LAYOUTS);
});

autoRouter.put('/clients/:accountId/art', (req, res) => {
  res.json(saveArt(account(req.params.accountId), req.body || {}));
});

autoRouter.get('/clients/:accountId/art/logo', (req, res) => {
  const logo = readLogo(account(req.params.accountId));
  if (!logo) throw fail(404, 'Sem logo.');
  res.type('png').set('Cache-Control', 'no-store').send(logo);
});

/** Logo enviado pela tela como data URL (PNG com fundo transparente é o ideal). */
autoRouter.put('/clients/:accountId/art/logo', express.json({ limit: '10mb' }), async (req, res) => {
  const id = account(req.params.accountId);
  const m = String(req.body?.dataUrl || '').match(/^data:image\/(png|jpe?g|webp|svg\+xml);base64,(.+)$/);
  if (!m) throw fail(400, 'Envie uma imagem (PNG, JPG, WEBP ou SVG).');
  await saveLogo(id, Buffer.from(m[2], 'base64'));
  res.json(clientSummary(getClient(id)));
});

autoRouter.delete('/clients/:accountId/art/logo', (req, res) => {
  const id = account(req.params.accountId);
  removeLogo(id);
  res.json(clientSummary(getClient(id)));
});

/**
 * Prévia da arte (feed + stories) com um carro do estoque que tenha fotos no Drive — o mesmo caminho da montagem:
 * capa (Claude ou regras + recorte), enquadramento/cenário ampliado e textos. body = { vehicleId?, photoId?, overrides? }.
 */
autoRouter.post('/clients/:accountId/art/preview', async (req, res) => {
  const id = account(req.params.accountId);
  const c = getClient(id);
  if (!c?.drive?.folderId) throw fail(400, 'Configure a pasta do Drive deste cliente: a arte usa as fotos do Drive.');
  const stock = await getStock(id);
  const wanted = req.body?.vehicleId ? stock.items.filter((v) => String(v.id) === String(req.body.vehicleId)) : stock.items;
  for (const v of wanted.slice(0, 8)) {
    const found = await findVehicleMedia(c.drive.folderId, v, c.drive.resourceKey).catch(() => null);
    if (!found?.photos?.length) continue;
    found.photos = await rankPhotos(found.photos, { style: photoStyle(c) });
    const cover = await pickCover(found.photos, { preferId: req.body?.photoId || null });
    const spec = { layout: c.art?.layout || 'vitrine', colors: c.art?.colors || {}, logo: readLogo(id) };
    const overrides = req.body?.overrides || {};
    const arts = await renderArts({ spec, vehicle: v, photo: cover.buffer, mask: cover.mask, overrides });
    const out = Object.fromEntries(arts.map((a) => [a.format, `data:${a.mime};base64,${a.buffer.toString('base64')}`]));
    return res.json({
      vehicle: { id: v.id, title: v.title },
      photo: cover.photo.name,
      photoId: cover.photo.id,
      photos: found.photos.slice(0, 16).map((p) => ({ id: p.id, name: p.name, thumb: p.thumb })),
      pickedBy: cover.by,
      cutout: Boolean(cover.mask),
      ai: arts[0]?.ai ?? null,
      values: artValues(v, overrides),
      ...out,
    });
  }
  throw fail(400, 'Não achei carro do estoque com fotos na pasta do Drive para a prévia.');
});

autoRouter.get('/clients/:accountId/drive-test', async (req, res) => {
  const c = getClient(account(req.params.accountId));
  if (!c?.drive?.folderId) throw fail(400, 'Configure a pasta do Drive deste cliente.');
  const v = { brand: '', model: String(req.query.model || ''), version: String(req.query.version || ''), year: String(req.query.year || '') };
  res.json(await findVehicleMedia(c.drive.folderId, v, c.drive.resourceKey));
});

autoRouter.get('/clients/:accountId/canva-pages', async (req, res) => {
  const c = getClient(account(req.params.accountId));
  if (!c?.canva?.designId) throw fail(400, 'Configure o design do Canva deste cliente.');
  res.json(await designPages(c.canva.designId));
});

// Miniatura de uma página do design (o link do Canva gravado no rascunho expira).
autoRouter.get('/canva/designs/:designId/pages/:page/thumb', async (req, res) => {
  const designId = String(req.params.designId);
  const page = Number(req.params.page);
  if (!/^[A-Za-z0-9_-]{5,40}$/.test(designId) || !Number.isInteger(page) || page < 1) throw fail(400, 'Página inválida.');
  const t = await pageThumb(designId, page);
  if (!t) throw fail(404, 'Página não encontrada no design.');
  res.set('Cache-Control', 'private, max-age=3600').type(t.type).send(t.buf);
});

// Miniatura de uma foto/arte do Drive (o link da API gravado no rascunho expira).
autoRouter.get('/drive/files/:fileId/thumb', async (req, res) => {
  const fileId = String(req.params.fileId);
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(fileId)) throw fail(400, 'Arquivo inválido.');
  const t = await fileThumb(fileId);
  if (!t) throw fail(404, 'Miniatura indisponível.');
  res.set('Cache-Control', 'private, max-age=3600').type(t.type).send(t.buf);
});

// ---------- Avisos de carro novo ----------

autoRouter.get('/news', (req, res) => {
  res.json(allNews());
});

autoRouter.post('/news/check', async (req, res) => {
  res.json(await checkAllSites());
});

autoRouter.post('/news/:accountId/:vehicleId/dismiss', (req, res) => {
  dismissNews(account(req.params.accountId), req.params.vehicleId);
  res.json({ ok: true });
});

// ---------- Montagem ----------

autoRouter.post('/build', (req, res) => {
  const { accountId, accountName, mode, structure, groupName, vehicleIds, manualTitle } = req.body || {};
  account(accountId);
  if (!['single', 'multi'].includes(mode)) throw fail(400, 'Escolha "um carro" ou "vários carros".');
  if (mode === 'multi' && (!Array.isArray(vehicleIds) || vehicleIds.length < 2)) throw fail(400, 'Escolha pelo menos dois carros.');
  if (!vehicleIds?.length && !manualTitle?.trim()) throw fail(400, 'Escolha o carro.');
  const job = startBuild({
    accountId,
    accountName,
    mode,
    structure: structure === 'adsetPerCar' ? 'adsetPerCar' : 'audiences',
    groupName: String(groupName || '').trim().slice(0, 60),
    vehicleIds: (vehicleIds || []).map(String).slice(0, 12),
    manualTitle: manualTitle ? String(manualTitle).trim().slice(0, 120) : null,
    user: req.user,
  });
  res.status(202).json(job);
});

autoRouter.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) throw fail(404, 'Montagem não encontrada (o servidor pode ter reiniciado).');
  res.json(job);
});

autoRouter.get('/drafts', (req, res) => {
  res.json(drafts.list()
    .filter((d) => d.origin?.type === 'auto')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30)
    .map((d) => ({ id: d.id, title: d.title, accountId: d.accountId, accountName: d.accountName, stage: d.stage, createdAt: d.createdAt, origin: { mode: d.origin.mode, vehicles: d.origin.vehicles, warnings: d.origin.warnings }, issues: Object.values(validateConfig(d.config)).flat().length, campaignId: d.publish?.created?.campaignId || null })));
});

/** Textos da arte de cada carro (para ajustar e refazer na revisão), conforme o layout do cliente. */
function artInfo(d) {
  const c = getClient(d.accountId);
  const layout = c?.art?.layout || 'vitrine';
  const values = {};
  for (const v of d.origin?.vehicles || []) values[v.id] = artValues(v, d.origin?.choices?.[v.id]?.created?.overrides || {});
  return { layout, fields: LAYOUTS[layout]?.fields || [], values };
}
/** Miniaturas do Drive e do Canva servidas pela esteira, em vez dos links gravados no rascunho (que expiram). */
function withThumbs(origin) {
  if (!origin?.choices) return origin;
  const drive = (list) => (list || []).map((f) => (f?.id && f.thumb ? { ...f, thumb: `/api/auto/drive/files/${f.id}/thumb` } : f));
  const choices = {};
  for (const [id, ch] of Object.entries(origin.choices)) {
    if (!ch) { choices[id] = ch; continue; }
    choices[id] = {
      ...ch,
      drivePhotos: drive(ch.drivePhotos),
      driveArts: drive(ch.driveArts),
      canvaPages: ch.designId ? (ch.canvaPages || []).map((p) => ({ ...p, thumb: `/api/auto/canva/designs/${ch.designId}/pages/${p.page}/thumb` })) : ch.canvaPages,
    };
  }
  return { ...origin, choices };
}
const draftView = (d) => ({ ...d, origin: withThumbs(d.origin), config: normalizeConfig(d.config), issues: validateConfig(d.config), art: d.origin?.type === 'auto' ? artInfo(d) : null });

autoRouter.get('/drafts/:id', (req, res) => {
  const d = drafts.get(req.params.id);
  if (!d) throw fail(404, 'Rascunho não encontrado.');
  res.json(draftView(d));
});

autoRouter.post('/drafts/:id/media', async (req, res) => {
  const { adKey, slot, from, ref } = req.body || {};
  const d = await swapMedia(req.params.id, { adKey, slot, from, ref, user: req.user });
  res.json(draftView(d));
});
