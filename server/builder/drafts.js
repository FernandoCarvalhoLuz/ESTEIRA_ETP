// Rascunhos da Esteira (cards do kanban) e o pipeline de publicação na Meta.
import { collection } from '../store.js';
import { clearCache, graph, graphWrite, MetaApiError } from '../meta/client.js';
import { metricsFrom } from '../meta/metrics.js';
import {
  adPayload, adsForAdset, adsetPayload, campaignName, campaignPayload, creativePayload, isComplete, newConfig, normalizeConfig,
  retargetConfig, totalAds, validateConfig,
} from '../../shared/esteira.js';
import { ensureOnMeta } from './media.js';
import { templates } from './templates.js';

export const drafts = collection('drafts');

const PUBLISH_STEPS = [
  { key: 'media', label: 'Enviando mídias' },
  { key: 'campaign', label: 'Criando campanha' },
  { key: 'adsets', label: 'Criando conjuntos' },
  { key: 'creatives', label: 'Criando criativos' },
  { key: 'ads', label: 'Criando anúncios' },
  { key: 'finish', label: 'Finalizando' },
];

// Uma publicação interrompida por reinício do servidor volta como falha (pode ser retomada).
for (const d of drafts.list()) {
  if (d.stage === 'publishing') {
    drafts.update(d.id, { stage: 'failed', publish: { ...d.publish, error: 'A publicação foi interrompida. Clique em "Tentar de novo" para continuar de onde parou.' } });
  }
}

/**
 * Cria um card da esteira. Com modelo + novo item (offer), os textos do modelo são reaproveitados trocando o item antigo
 * pelo novo e as mídias do carro antigo são removidas.
 */
export function createDraft({ accountId, accountName, templateId, offer, config: preset, origin, user }) {
  let config = preset ? normalizeConfig(preset) : newConfig(accountId || '');
  let template = null;
  let retarget = null;
  if (templateId) {
    template = templates.get(templateId);
    if (!template) throw Object.assign(new Error('Modelo não encontrado.'), { status: 404 });
    if (offer?.title?.trim()) {
      retarget = retargetConfig(template.config, { ...offer, title: offer.title.trim() });
      config = retarget.config;
    } else {
      config = normalizeConfig(template.config);
    }
    templates.update(template.id, (t) => ({ usageCount: (t.usageCount || 0) + 1, lastUsedAt: new Date().toISOString() }));
  }
  return drafts.insert({
    origin: origin || null,
    retarget: retarget ? { leftovers: retarget.leftovers, collapsedAds: retarget.collapsedAds, from: template.config.offer?.title || '', oldCars: retarget.oldCars } : null,
    accountId: config.accountId,
    accountName: template?.accountName || accountName || '',
    title: config.offer.title || 'Nova campanha',
    fromTemplate: template ? { id: template.id, name: template.name } : null,
    config,
    step: template ? (retarget ? 5 : 1) : (preset ? 6 : 0),
    stage: 'draft',
    publish: null,
    templateId: null,
    createdBy: user?.username || null,
  });
}

export function updateDraft(id, { config, step, accountName }) {
  return drafts.update(id, (d) => {
    if (d.stage === 'published' || d.stage === 'publishing') {
      throw Object.assign(new Error('Esta campanha já foi publicada e não pode mais ser editada aqui.'), { status: 409 });
    }
    const next = { ...d };
    if (config) {
      next.config = config;
      next.accountId = config.accountId;
      next.title = config.offer?.title?.trim() || 'Nova campanha';
    }
    if (accountName !== undefined) next.accountName = accountName;
    if (Number.isInteger(step)) next.step = step;
    return next;
  });
}

export function duplicateDraft(id, user) {
  const d = drafts.get(id);
  if (!d) return null;
  return drafts.insert({
    accountId: d.accountId,
    accountName: d.accountName,
    title: `${d.title} (cópia)`,
    fromTemplate: d.fromTemplate,
    config: JSON.parse(JSON.stringify(d.config)),
    step: 0,
    stage: 'draft',
    publish: null,
    templateId: null,
    createdBy: user?.username || null,
  });
}

function column(d, live) {
  if (d.templateId) return 'modelo';
  if (d.stage === 'published') return live?.effectiveStatus === 'ACTIVE' ? 'teste' : 'publicada';
  if (d.stage === 'publishing' || d.stage === 'failed') return 'pronta';
  return isComplete(d.config) ? 'pronta' : 'montando';
}

/** Lista para o kanban, com status e números atuais das campanhas publicadas. */
export async function boardDrafts({ fresh } = {}) {
  const list = drafts.list();
  const ids = list.filter((d) => d.stage === 'published' && d.publish?.created?.campaignId).map((d) => d.publish.created.campaignId);
  let live = {};
  if (ids.length) {
    live = await graph('', {
      ids: ids.join(','),
      fields: 'effective_status,insights.date_preset(maximum){spend,impressions,reach,clicks,inline_link_clicks,actions}',
    }, { fresh, ttl: 120 }).catch(() => ({}));
  }
  return list
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((d) => {
      const campaignId = d.publish?.created?.campaignId;
      const info = campaignId && live[campaignId];
      const liveData = info ? { effectiveStatus: info.effective_status, metrics: metricsFrom(info.insights?.data?.[0]) } : null;
      return {
        id: d.id,
        title: d.title,
        accountId: d.accountId,
        accountName: d.accountName,
        stage: d.stage,
        step: d.step,
        fromTemplate: d.fromTemplate,
        templateId: d.templateId,
        campaignName: campaignName(d.config),
        thumb: d.config.ads?.find((a) => a.media)?.media || (d.config.ads?.find((a) => a.post)?.post ? { kind: 'image', thumbUrl: d.config.ads.find((a) => a.post).post.picture } : null),
        adsets: d.config.adsets?.length || 0,
        ads: d.config.ads?.length || 0,
        origin: d.origin ? { type: d.origin.type, mode: d.origin.mode } : null,
        budget: d.config.budget,
        issues: Object.values(validateConfig(d.config)).flat().length,
        publish: d.publish ? { status: d.publish.status, error: d.publish.error, finishedAt: d.publish.finishedAt, campaignId } : null,
        live: liveData,
        column: column(d, liveData),
        updatedAt: d.updatedAt,
      };
    });
}

// ---------- Publicação ----------

const running = new Set();

function patchPublish(id, fn) {
  return drafts.update(id, (d) => ({ publish: fn(d.publish) }));
}

function setStep(id, key, state, detail) {
  patchPublish(id, (p) => ({ ...p, steps: p.steps.map((s) => (s.key === key ? { ...s, state, detail: detail ?? s.detail } : s)) }));
}

function remember(id, fn) {
  patchPublish(id, (p) => ({ ...p, created: fn(p.created) }));
}

export function startPublish(id, { status, minDailyBudget } = {}) {
  const draft = drafts.get(id);
  if (!draft) throw Object.assign(new Error('Rascunho não encontrado.'), { status: 404 });
  if (running.has(id) || draft.stage === 'publishing') throw Object.assign(new Error('A publicação já está em andamento.'), { status: 409 });
  if (draft.stage === 'published') throw Object.assign(new Error('Esta campanha já foi publicada.'), { status: 409 });
  const issues = validateConfig(draft.config, { minDailyBudget });
  if (Object.keys(issues).length) throw Object.assign(new Error('Ainda há etapas incompletas. Revise antes de publicar.'), { status: 400, issues });

  const finalStatus = status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';
  const previous = draft.publish?.created || {};
  drafts.update(id, {
    stage: 'publishing',
    publish: {
      status: finalStatus,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      steps: PUBLISH_STEPS.map((s) => ({ ...s, state: 'pending', detail: s.key === 'finish' ? (finalStatus === 'ACTIVE' ? 'A campanha será ativada' : 'A campanha ficará pausada') : null })),
      created: { campaignId: previous.campaignId || null, adsets: previous.adsets || {}, media: previous.media || {}, creatives: previous.creatives || {}, ads: previous.ads || {} },
    },
  });
  running.add(id);
  runPublish(id).finally(() => running.delete(id));
  return drafts.get(id);
}

/**
 * A Meta aceita o criativo na criação e só depois marca o anúncio com erro (issues_info), e o Gerenciador
 * mostra o anúncio "piscando" sem mídia. Confere logo após publicar para o erro aparecer na esteira.
 */
async function adIssues(adIds) {
  if (!adIds.length) return [];
  await new Promise((r) => setTimeout(r, 4000));
  try {
    // Um pedido por anúncio: a Graph API v26 não aceita mais ?ids= com vários objetos.
    const ads = await Promise.all(adIds.map((id) => graph(id, { fields: 'name,issues_info' }, { fresh: true })));
    return ads.flatMap((ad) => (ad.issues_info || []).map((i) => ({
      adId: ad.id,
      name: ad.name,
      code: i.error_code,
      message: i.error_message || i.error_summary,
    })));
  } catch (err) {
    console.warn(`[esteira] não deu para conferir os anúncios: ${err.message}`);
    return [];
  }
}

async function runPublish(id) {
  let current = null;
  try {
    const draft = drafts.get(id);
    const config = normalizeConfig(draft.config);
    const accountId = config.accountId;
    const created = () => drafts.get(id).publish.created;

    current = 'media';
    const mediaJobs = config.ads.filter((ad) => ad.source !== 'existing').flatMap((ad) => [
      { key: ad.key, media: ad.media },
      ...(ad.storyMedia ? [{ key: `${ad.key}:story`, media: ad.storyMedia }] : []),
    ]);
    setStep(id, 'media', 'running', `0 de ${mediaJobs.length}`);
    for (const [i, job] of mediaJobs.entries()) {
      if (!created().media[job.key]) {
        const ref = await ensureOnMeta(accountId, job.media, { onProgress: (msg) => setStep(id, 'media', 'running', msg) });
        remember(id, (c) => ({ ...c, media: { ...c.media, [job.key]: ref } }));
      }
      setStep(id, 'media', 'running', `${i + 1} de ${mediaJobs.length}`);
    }
    setStep(id, 'media', 'done', `${mediaJobs.length} mídia(s) prontas`);

    current = 'campaign';
    setStep(id, 'campaign', 'running');
    if (!created().campaignId) {
      const res = await graphWrite(`${accountId}/campaigns`, campaignPayload(config));
      remember(id, (c) => ({ ...c, campaignId: res.id }));
    }
    const campaignId = created().campaignId;
    setStep(id, 'campaign', 'done', campaignName(config));

    current = 'adsets';
    for (const [i, adset] of config.adsets.entries()) {
      setStep(id, 'adsets', 'running', `${i} de ${config.adsets.length}`);
      if (!created().adsets[adset.key]) {
        const res = await graphWrite(`${accountId}/adsets`, adsetPayload(config, adset, campaignId));
        remember(id, (c) => ({ ...c, adsets: { ...c.adsets, [adset.key]: res.id } }));
      }
    }
    setStep(id, 'adsets', 'done', `${config.adsets.length} conjunto(s)`);

    current = 'creatives';
    for (const [i, ad] of config.ads.entries()) {
      setStep(id, 'creatives', 'running', `${i} de ${config.ads.length}`);
      if (!created().creatives[ad.key]) {
        const res = await graphWrite(`${accountId}/adcreatives`, creativePayload(config, ad, i, created().media[ad.key], created().media[`${ad.key}:story`]));
        remember(id, (c) => ({ ...c, creatives: { ...c.creatives, [ad.key]: res.id } }));
      }
    }
    setStep(id, 'creatives', 'done', `${config.ads.length} criativo(s)`);

    current = 'ads';
    const total = totalAds(config);
    let done = 0;
    for (const adset of config.adsets) {
      for (const ad of adsForAdset(config, adset)) {
        const i = config.ads.indexOf(ad);
        const key = `${adset.key}:${ad.key}`;
        setStep(id, 'ads', 'running', `${done} de ${total}`);
        if (!created().ads[key]) {
          const res = await graphWrite(`${accountId}/ads`, adPayload(config, ad, i, created().adsets[adset.key], created().creatives[ad.key]));
          remember(id, (c) => ({ ...c, ads: { ...c.ads, [key]: res.id } }));
        }
        done += 1;
      }
    }
    setStep(id, 'ads', 'done', `${total} anúncio(s)`);

    current = 'finish';
    setStep(id, 'finish', 'running');
    const finalStatus = drafts.get(id).publish.status;
    if (finalStatus === 'ACTIVE') await graphWrite(campaignId, { status: 'ACTIVE' });
    setStep(id, 'finish', 'running', 'Conferindo os anúncios na Meta');
    const warnings = await adIssues(Object.values(created().ads));
    setStep(id, 'finish', 'done', warnings.length
      ? `A Meta apontou problema em ${warnings.length} anúncio(s)`
      : finalStatus === 'ACTIVE' ? 'Campanha ativa' : 'Campanha pausada para revisão');

    drafts.update(id, (d) => ({ stage: 'published', publish: { ...d.publish, warnings, finishedAt: new Date().toISOString() } }));
    clearCache();
  } catch (err) {
    const message = err instanceof MetaApiError ? `${err.message}${err.metaCode ? ` (código ${err.metaCode}${err.metaSubcode ? `/${err.metaSubcode}` : ''})` : ''}` : err.message;
    console.warn(`[esteira] falha ao publicar ${id} na etapa ${current}: ${message}`);
    if (current) setStep(id, current, 'error', message);
    drafts.update(id, (d) => ({ stage: 'failed', publish: { ...d.publish, error: message, finishedAt: new Date().toISOString() } }));
  }
}

/** Remove da Meta o que foi criado numa publicação que falhou e volta o card para rascunho. */
export async function cleanupFailed(id) {
  const draft = drafts.get(id);
  if (!draft || draft.stage !== 'failed') throw Object.assign(new Error('Só é possível desfazer publicações que falharam.'), { status: 409 });
  const campaignId = draft.publish?.created?.campaignId;
  if (campaignId) await graphWrite(campaignId, {}, { method: 'DELETE' });
  clearCache();
  return drafts.update(id, { stage: 'draft', publish: null });
}

/** Validação seca na Meta (nada é criado). */
export async function validateOnMeta(draft) {
  try {
    await graphWrite(`${draft.config.accountId}/campaigns`, { ...campaignPayload(normalizeConfig(draft.config)), execution_options: ['validate_only'] });
    return { ok: true };
  } catch (err) {
    if (!(err instanceof MetaApiError)) throw err;
    return { ok: false, message: err.message };
  }
}
