// Padrão de cada cliente, aprendido do histórico da conta na Meta (sem LLM): estrutura das campanhas (um carro ou vários),
// públicos, dispositivos, orçamento, objetivo, nomes e exemplos de texto dos anúncios.
import { graph } from '../meta/client.js';
import { extract, metricsFrom, sumMetrics, budgetValue } from '../meta/metrics.js';
import { resolveRange } from '../meta/dates.js';
import { normalizeConfig, OBJECTIVES, tokenizeText, tokenizeTitleLines } from '../../shared/esteira.js';
import { captureCampaign } from '../builder/templates.js';

const WHATSAPP_OBJECTIVES = new Set(OBJECTIVES.map((o) => o.key));

/** Nome "limpo" do carro de um anúncio: sem [tags], (variações), "AD01 -", emojis e "— Cópia". */
export function carKey(name) {
  return String(name || '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/—\s*c[óo]pia.*$/i, ' ')
    .replace(/^\s*AD\s*\d+\s*-\s*/i, ' ')
    .replace(/[^\p{L}\p{N}.\s/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function median(values) {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function creativeText(c = {}) {
  const s = c.object_story_spec || {};
  return c.body || s.link_data?.message || s.video_data?.message || c.asset_feed_spec?.bodies?.[0]?.text || '';
}

/** Símbolo mais usado no começo das linhas dos textos (✔️, •, ✅, 🔹…), para os textos-modelo sem LLM. */
function bulletOf(texts) {
  const counts = new Map();
  for (const t of texts) {
    for (const line of t.split('\n')) {
      const m = line.trim().match(/^([^\p{L}\p{N}\s]{1,3})\s*\p{L}/u);
      if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '✔️';
}

function closingOf(texts) {
  for (const t of texts) {
    const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
    const last = lines.at(-1);
    if (last && /whats|chame|fale|mensagem|direct|clique|agende/i.test(last) && last.length < 140) return last;
  }
  return '📲 Chame no WhatsApp e agende sua visita!';
}

export async function analyzeClient(accountId) {
  const range = resolveRange({ preset: 'last_90d' });
  const [account, campaignsBody, insightsBody, adsBody] = await Promise.all([
    graph(accountId, { fields: 'id,name,currency' }),
    graph(`${accountId}/campaigns`, {
      fields: 'id,name,objective,created_time,effective_status,daily_budget,lifetime_budget,adsets.limit(15){daily_budget,lifetime_budget,destination_type},ads.limit(40){name}',
      limit: 60,
    }, { fresh: true }),
    graph(`${accountId}/insights`, { level: 'campaign', fields: 'campaign_id,spend,impressions,reach,clicks,inline_link_clicks,actions', time_range: { since: range.since, until: range.until }, limit: 500 }, { all: true, fresh: true }),
    graph(`${accountId}/ads`, { fields: 'name,created_time,creative{body,object_story_spec,asset_feed_spec}', limit: 60 }, { fresh: true }).catch(() => ({ data: [] })),
  ]);
  const currency = account.currency;
  const metricsBy = new Map(insightsBody.data.map((r) => [r.campaign_id, metricsFrom(r)]));
  const accountMetrics = sumMetrics(insightsBody.data.map((r) => extract(r)));

  const campaigns = campaignsBody.data
    .filter((c) => WHATSAPP_OBJECTIVES.has(c.objective) && (c.adsets?.data || []).some((a) => a.destination_type === 'WHATSAPP'))
    .map((c) => {
      const cars = new Set((c.ads?.data || []).map((a) => carKey(a.name)).filter(Boolean));
      const budget = budgetValue(c.daily_budget, currency) || (c.adsets?.data || []).reduce((s, a) => s + (budgetValue(a.daily_budget, currency) || 0), 0) || null;
      return { id: c.id, name: c.name, objective: c.objective, createdAt: c.created_time, cars: cars.size, type: cars.size > 1 ? 'multi' : 'single', budget, metrics: metricsBy.get(c.id) || null };
    });

  // Melhor de cada estrutura: menor custo por conversa com volume; senão, a mais recente que gastou.
  const pick = (type) => {
    const list = campaigns.filter((c) => c.type === type);
    const proven = list.filter((c) => c.metrics?.conversations >= 10 && c.metrics.costPerConversation != null).sort((a, b) => a.metrics.costPerConversation - b.metrics.costPerConversation);
    return proven[0] || list.filter((c) => c.metrics?.spend > 0).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || list[0] || null;
  };

  const spendByObjective = new Map();
  for (const c of campaigns) spendByObjective.set(c.objective, (spendByObjective.get(c.objective) || 0) + (c.metrics?.spend || 0) + 0.01);
  const objective = [...spendByObjective.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'OUTCOME_ENGAGEMENT';

  const captureBase = async (c) => {
    if (!c) return null;
    const captured = await captureCampaign(c.id, { range });
    const config = normalizeConfig(captured.config);
    const cleanName = (n) => String(n || '').replace(/\s*—\s*c[óo]pia/gi, '').trim();
    // Em campanhas de vários carros o "item" é o grupo (ex.: UTILITARIOS) e não deve virar variável nos conjuntos.
    const group = config.offer.title;
    const untoken = (n) => (c.type === 'multi' && group ? n.replace(/\{OFERTA\}/g, group.toUpperCase()).replace(/\{oferta\}/g, group) : n);
    config.adsets = config.adsets.map((a) => ({ ...a, name: cleanName(untoken(a.name)) }));
    for (const ad of config.ads) ad.name = cleanName(ad.name);
    // Textos e nomes ficam com variáveis no lugar do carro da campanha de referência.
    const oldCars = [config.offer.title, ...config.ads.map((a) => carKey(a.name))].filter((t) => t && !/OFERTA/i.test(t));
    const swap = (text) => oldCars.reduce((t, car) => tokenizeTitleLines(tokenizeText(t, car), car), text);
    for (const ad of config.ads) {
      for (const field of ['primaryText', 'headline', 'description']) ad[field] = swap(ad[field]);
    }
    config.destination.greeting = swap(config.destination.greeting);
    config.destination.autofill = oldCars.reduce((t, car) => tokenizeText(t, car), config.destination.autofill);
    // Mensagem que ainda cita um carro específico (ex.: "interesse na FIAT STRADA...") vira genérica com {oferta}.
    if (!/\{oferta\}/i.test(config.destination.autofill) && /interesse|informa/i.test(config.destination.autofill)) {
      config.destination.autofill = 'Olá! Tenho interesse no {oferta}. Pode me passar mais informações?';
    }
    return {
      campaignId: c.id,
      campaignName: c.name,
      cars: c.cars,
      metrics: c.metrics ? { spend: c.metrics.spend, conversations: c.metrics.conversations, costPerConversation: c.metrics.costPerConversation } : null,
      config,
    };
  };

  const [single, multi] = await Promise.all([captureBase(pick('single')), captureBase(pick('multi'))]);

  // Padrão do nome dos anúncios (ex.: "🟢 {oferta}", "{OFERTA} [ESTÁTICO]").
  const adNamePattern = (() => {
    const ref = single?.config;
    const raw = ref?.ads?.[0]?.name || '';
    if (/\{oferta\}/i.test(raw)) return raw;
    return '{OFERTA}';
  })();

  const examples = (adsBody.data || [])
    .map((a) => creativeText(a.creative))
    .filter((t) => t && t.length > 40)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 6);

  return {
    analyzedAt: new Date().toISOString(),
    accountName: account.name,
    range: { since: range.since, until: range.until },
    objective,
    campaignsAnalyzed: campaigns.length,
    structures: { single: campaigns.filter((c) => c.type === 'single').length, multi: campaigns.filter((c) => c.type === 'multi').length },
    preferredStructure: campaigns.filter((c) => c.type === 'multi').length > campaigns.filter((c) => c.type === 'single').length ? 'multi' : 'single',
    medianBudget: median(campaigns.map((c) => c.budget)),
    accountCostPerConversation: accountMetrics.costPerConversation,
    single,
    multi,
    adNamePattern,
    examples,
    style: {
      bullet: bulletOf(examples),
      closing: closingOf(examples),
      showPrice: examples.length ? examples.filter((t) => /R\$\s?\d/.test(t)).length / examples.length >= 0.4 : true,
      emojis: examples.some((t) => /\p{Extended_Pictographic}/u.test(t)),
    },
  };
}
