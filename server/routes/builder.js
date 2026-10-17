import fs from 'node:fs';
import { Router } from 'express';
import { accountAssets, estimateAudience, listDevices, pagePosts, searchGeo, searchInterests } from '../builder/assets.js';
import {
  createTemplateFromCampaign, dismissSuggestion, suggestions, templateFromDraft, templates,
} from '../builder/templates.js';
import {
  boardDrafts, cleanupFailed, createDraft, drafts, duplicateDraft, startPublish, updateDraft, validateOnMeta,
} from '../builder/drafts.js';
import { filePathOf, listMedia, mediaStore, registerUpload, removeUpload, uploadMiddleware } from '../builder/media.js';
import { resolveRange } from '../meta/dates.js';
import { normalizeConfig, validateConfig } from '../../shared/esteira.js';

export const builderRouter = Router();

const ACCOUNT_ID = /^act_\d{5,25}$/;
const OBJECT_ID = /^\d{5,25}$/;

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function requireAccount(id) {
  if (!ACCOUNT_ID.test(id || '')) throw fail(400, 'Conta inválida.');
  return id;
}

function getDraft(id) {
  const d = drafts.get(id);
  if (!d) throw fail(404, 'Rascunho não encontrado.');
  return d;
}

// ---------- Apoio ----------

builderRouter.get('/assets/:accountId', async (req, res) => {
  res.json(await accountAssets(requireAccount(req.params.accountId), { fresh: req.query.fresh === '1' }));
});

builderRouter.get('/search/geo', async (req, res) => {
  const q = String(req.query.q || '').trim();
  res.json(q.length < 2 ? [] : await searchGeo(q));
});

builderRouter.get('/search/interests', async (req, res) => {
  const q = String(req.query.q || '').trim();
  res.json(q.length < 2 ? [] : await searchInterests(q));
});

builderRouter.get('/devices', async (req, res) => {
  res.json(await listDevices());
});

builderRouter.get('/posts', async (req, res) => {
  const pageId = String(req.query.pageId || '');
  if (!OBJECT_ID.test(pageId)) throw fail(400, 'Página inválida.');
  const instagramId = OBJECT_ID.test(String(req.query.instagramId || '')) ? String(req.query.instagramId) : null;
  res.json(await pagePosts(pageId, instagramId));
});

builderRouter.post('/estimate', async (req, res) => {
  const { accountId, pageId, adset } = req.body || {};
  if (!pageId || !adset) throw fail(400, 'Informe a página e o conjunto.');
  res.json(await estimateAudience(requireAccount(accountId), pageId, adset));
});

// ---------- Modelos ----------

builderRouter.get('/templates', (req, res) => {
  const list = templates.list()
    .filter((t) => !req.query.accountId || t.accountId === req.query.accountId)
    .sort((a, b) => (a.performance?.costPerConversation ?? Infinity) - (b.performance?.costPerConversation ?? Infinity))
    .map((t) => ({ ...t, config: normalizeConfig(t.config) }));
  res.json(list);
});

builderRouter.post('/templates/from-campaign', async (req, res) => {
  const { campaignId, name, description, since, until } = req.body || {};
  if (!OBJECT_ID.test(campaignId || '')) throw fail(400, 'Campanha inválida.');
  const range = since && until ? resolveRange({ preset: 'custom', since, until }) : undefined;
  const result = await createTemplateFromCampaign(campaignId, { name, description, user: req.user, range });
  res.status(result.existed ? 200 : 201).json(result);
});

builderRouter.patch('/templates/:id', (req, res) => {
  const { name, description } = req.body || {};
  const updated = templates.update(req.params.id, {
    ...(name !== undefined ? { name: String(name).trim() } : {}),
    ...(description !== undefined ? { description: String(description).trim() } : {}),
  });
  if (!updated) throw fail(404, 'Modelo não encontrado.');
  res.json(updated);
});

builderRouter.delete('/templates/:id', (req, res) => {
  if (!templates.remove(req.params.id)) throw fail(404, 'Modelo não encontrado.');
  res.json({ ok: true });
});

builderRouter.get('/suggestions', async (req, res) => {
  res.json(await suggestions({ fresh: req.query.fresh === '1' }));
});

builderRouter.post('/suggestions/:campaignId/dismiss', (req, res) => {
  if (!OBJECT_ID.test(req.params.campaignId)) throw fail(400, 'Campanha inválida.');
  dismissSuggestion(req.params.campaignId);
  res.json({ ok: true });
});

// ---------- Rascunhos (kanban) ----------

builderRouter.get('/drafts', async (req, res) => {
  res.json(await boardDrafts({ fresh: req.query.fresh === '1' }));
});

builderRouter.post('/drafts', (req, res) => {
  const { accountId, accountName, templateId, offer } = req.body || {};
  if (accountId) requireAccount(accountId);
  res.status(201).json(createDraft({ accountId, accountName, templateId, offer, user: req.user }));
});

builderRouter.get('/drafts/:id', (req, res) => {
  const d = getDraft(req.params.id);
  res.json({ ...d, config: normalizeConfig(d.config), issues: validateConfig(d.config) });
});

builderRouter.patch('/drafts/:id', (req, res) => {
  getDraft(req.params.id);
  const { config, step, accountName } = req.body || {};
  if (config?.accountId) requireAccount(config.accountId);
  const d = updateDraft(req.params.id, { config, step, accountName });
  res.json({ ...d, issues: validateConfig(d.config) });
});

builderRouter.delete('/drafts/:id', (req, res) => {
  const d = getDraft(req.params.id);
  if (d.stage === 'publishing') throw fail(409, 'Aguarde a publicação terminar.');
  drafts.remove(d.id);
  res.json({ ok: true });
});

builderRouter.post('/drafts/:id/duplicate', (req, res) => {
  getDraft(req.params.id);
  res.status(201).json(duplicateDraft(req.params.id, req.user));
});

builderRouter.post('/drafts/:id/validate', async (req, res) => {
  const d = getDraft(req.params.id);
  const issues = validateConfig(d.config, { minDailyBudget: req.body?.minDailyBudget });
  const meta = Object.keys(issues).length ? null : await validateOnMeta(d);
  res.json({ issues, meta });
});

builderRouter.post('/drafts/:id/publish', (req, res) => {
  getDraft(req.params.id);
  try {
    res.status(202).json(startPublish(req.params.id, { status: req.body?.status, minDailyBudget: req.body?.minDailyBudget }));
  } catch (err) {
    if (err.issues) return res.status(400).json({ error: { message: err.message }, issues: err.issues });
    throw err;
  }
});

builderRouter.post('/drafts/:id/cleanup', async (req, res) => {
  getDraft(req.params.id);
  res.json(await cleanupFailed(req.params.id));
});

builderRouter.post('/drafts/:id/to-template', async (req, res) => {
  const d = getDraft(req.params.id);
  const campaignId = d.publish?.created?.campaignId;
  const template = campaignId && d.stage === 'published'
    ? (await createTemplateFromCampaign(campaignId, { name: req.body?.name, user: req.user })).template
    : templateFromDraft(d, { name: req.body?.name, user: req.user });
  drafts.update(d.id, { templateId: template.id });
  res.status(201).json(template);
});

// ---------- Biblioteca de mídia ----------

builderRouter.get('/media', async (req, res) => {
  res.json(await listMedia(requireAccount(req.query.accountId), { fresh: req.query.fresh === '1' }));
});

builderRouter.post('/media', (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máximo 1 GB).' : err.message;
      return res.status(400).json({ error: { message } });
    }
    if (!req.file) return res.status(400).json({ error: { message: 'Nenhum arquivo enviado.' } });
    try {
      const item = registerUpload(req.file, { accountId: requireAccount(req.body.accountId), user: req.user, scope: req.body.scope });
      res.status(201).json({ ...item, url: `/api/builder/media/${item.id}/file` });
    } catch (e) {
      fs.rm(req.file.path, { force: true }, () => {});
      next(e);
    }
  });
});

builderRouter.get('/media/:id/file', (req, res) => {
  const item = mediaStore.get(req.params.id);
  if (!item) throw fail(404, 'Arquivo não encontrado.');
  res.set('Cache-Control', 'private, max-age=86400');
  res.type(item.mime).sendFile(filePathOf(item));
});

builderRouter.patch('/media/:id', (req, res) => {
  const label = String(req.body?.label || '').trim();
  if (!label) throw fail(400, 'Informe o nome.');
  const updated = mediaStore.update(req.params.id, (m) => (m.canva
    ? { canva: { ...m.canva, vehicle: label, renamed: true, pairKey: `${label}|${m.canva.year}|${m.canva.variant}` } }
    : { originalName: label }));
  if (!updated) throw fail(404, 'Arquivo não encontrado.');
  res.json(updated);
});

builderRouter.delete('/media/:id', (req, res) => {
  if (!removeUpload(req.params.id)) throw fail(404, 'Arquivo não encontrado.');
  res.json({ ok: true });
});
