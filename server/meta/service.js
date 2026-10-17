// Monta as visões da plataforma (visão geral, conta, campanha) combinando chamadas à Graph API.
import { clearCache, graph, graphWrite, mapLimit, MetaApiError } from './client.js';
import { addDays, daysBetween, previousRange } from './dates.js';
import { budgetValue, dailySeries, isDelivered, metricsFrom, sumMetrics } from './metrics.js';

const BASE_FIELDS = ['spend', 'impressions', 'reach', 'clicks', 'inline_link_clicks', 'actions'];
const RESULT_FIELDS = ['results'];
// Tudo que não está arquivado/excluído.
const LIVE_STATUSES = ['ACTIVE', 'PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO'];

export const ACCOUNT_STATUS = {
  1: 'Ativa',
  2: 'Desativada',
  3: 'Pagamento pendente',
  7: 'Em análise de risco',
  8: 'Liquidação pendente',
  9: 'Período de carência',
  100: 'Encerramento pendente',
  101: 'Encerrada',
};

async function insights(objectId, { range, level, timeIncrement, fields = [], fresh }) {
  const params = {
    fields: [...BASE_FIELDS, ...fields].join(','),
    time_range: { since: range.since, until: range.until },
    limit: 500,
  };
  if (level) params.level = level;
  if (timeIncrement) params.time_increment = timeIncrement;
  const body = await graph(`${objectId}/insights`, params, { all: true, fresh });
  return body.data || [];
}

function accountInfo(acc) {
  return {
    id: acc.id,
    name: acc.name,
    currency: acc.currency,
    timezone: acc.timezone_name,
    status: acc.account_status,
    statusLabel: ACCOUNT_STATUS[acc.account_status] || `Status ${acc.account_status}`,
  };
}

/** Moeda predominante entre as contas com veiculação (para não somar BRL com USD). */
function mainCurrency(accounts) {
  const spendBy = new Map();
  for (const a of accounts) spendBy.set(a.currency, (spendBy.get(a.currency) || 0) + (a.current?.spend || 0));
  return [...spendBy.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || 'BRL';
}

export async function accountsOverview(range, { fresh } = {}) {
  const prev = previousRange(range);
  const { data } = await graph('me/adaccounts', { fields: 'id,name,account_status,currency,timezone_name', limit: 200 }, { all: true, fresh });

  const accounts = await mapLimit(data, 4, async (acc) => {
    try {
      const [cur, before, daily] = await Promise.all([
        insights(acc.id, { range, fresh }),
        insights(acc.id, { range: prev, fresh }),
        insights(acc.id, { range, timeIncrement: 1, fresh }),
      ]);
      return {
        ...accountInfo(acc),
        current: metricsFrom(cur[0]),
        previous: metricsFrom(before[0]),
        daily: dailySeries(daily, range, addDays).map((d) => ({ date: d.date, spend: d.spend, conversations: d.conversations })),
      };
    } catch (err) {
      if (err instanceof MetaApiError && err.kind === 'token') throw err;
      return { ...accountInfo(acc), error: err.message };
    }
  });

  const currency = mainCurrency(accounts);
  const inCurrency = accounts.filter((a) => a.currency === currency && a.current);
  const total = (key) => sumMetrics(inCurrency.map((a) => a[key]));
  // Série diária somando as contas da moeda principal (para as sparklines dos indicadores).
  const byDate = new Map();
  for (const a of inCurrency) {
    for (const d of a.daily || []) {
      const t = byDate.get(d.date) || { date: d.date, spend: 0, conversations: 0 };
      t.spend += d.spend;
      t.conversations += d.conversations;
      byDate.set(d.date, t);
    }
  }
  const daily = [...byDate.values()]
    .sort((x, y) => x.date.localeCompare(y.date))
    .map((d) => ({ ...d, costPerConversation: d.conversations > 0 ? d.spend / d.conversations : null }));

  return {
    range,
    previousRange: prev,
    accounts,
    totals: {
      currency,
      accountsCount: inCurrency.length,
      deliveringCount: inCurrency.filter((a) => isDelivered(a.current)).length,
      otherCurrencies: [...new Set(accounts.filter((a) => a.currency !== currency && a.current?.spend > 0).map((a) => a.currency))],
      current: total('current'),
      previous: total('previous'),
      daily,
    },
    generatedAt: new Date().toISOString(),
  };
}

function campaignBudget(campaign, adsetsByCampaign, currency) {
  const daily = budgetValue(campaign.daily_budget, currency);
  const lifetime = budgetValue(campaign.lifetime_budget, currency);
  if (daily || lifetime) return { daily, lifetime, source: 'campaign' };
  const adsets = adsetsByCampaign.get(campaign.id) || [];
  const sumDaily = adsets.reduce((s, a) => s + (budgetValue(a.daily_budget, currency) || 0), 0);
  const sumLifetime = adsets.reduce((s, a) => s + (budgetValue(a.lifetime_budget, currency) || 0), 0);
  if (sumDaily || sumLifetime) return { daily: sumDaily || null, lifetime: sumLifetime || null, source: 'adsets' };
  return null;
}

export async function accountDetail(accountId, range, { fresh } = {}) {
  const prev = previousRange(range);
  const [info, cur, before, daily, previousDaily, campaignRows, campaignsList, adsetsList] = await Promise.all([
    graph(accountId, { fields: 'id,name,account_status,currency,timezone_name,amount_spent,balance,spend_cap' }, { fresh }),
    insights(accountId, { range, fresh }),
    insights(accountId, { range: prev, fresh }),
    insights(accountId, { range, timeIncrement: 1, fresh }),
    insights(accountId, { range: prev, timeIncrement: 1, fresh }),
    insights(accountId, { range, level: 'campaign', fields: ['campaign_id', 'campaign_name', ...RESULT_FIELDS], fresh }),
    graph(`${accountId}/campaigns`, {
      fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time',
      effective_status: LIVE_STATUSES,
      limit: 500,
    }, { all: true, fresh }),
    graph(`${accountId}/adsets`, {
      fields: 'campaign_id,effective_status,daily_budget,lifetime_budget',
      effective_status: ['ACTIVE'],
      limit: 500,
    }, { all: true, fresh }),
  ]);

  const account = accountInfo(info);
  const adsetsByCampaign = new Map();
  for (const a of adsetsList.data) {
    if (!adsetsByCampaign.has(a.campaign_id)) adsetsByCampaign.set(a.campaign_id, []);
    adsetsByCampaign.get(a.campaign_id).push(a);
  }

  const metricsById = new Map(campaignRows.map((r) => [r.campaign_id, { name: r.campaign_name, metrics: metricsFrom(r) }]));
  const campaigns = campaignsList.data.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    effectiveStatus: c.effective_status,
    objective: c.objective,
    startTime: c.start_time,
    stopTime: c.stop_time,
    budget: campaignBudget(c, adsetsByCampaign, account.currency),
    metrics: metricsById.get(c.id)?.metrics || metricsFrom(null),
  }));
  // Campanhas arquivadas/excluídas que veicularam no período também entram.
  const listed = new Set(campaigns.map((c) => c.id));
  for (const [id, row] of metricsById) {
    if (!listed.has(id) && isDelivered(row.metrics)) {
      campaigns.push({ id, name: row.name, effectiveStatus: 'ARCHIVED', status: 'ARCHIVED', budget: null, metrics: row.metrics });
    }
  }
  for (const c of campaigns) c.delivered = isDelivered(c.metrics);

  return {
    range,
    previousRange: prev,
    account: { ...account, amountSpent: budgetValue(info.amount_spent, account.currency) },
    current: metricsFrom(cur[0]),
    previous: metricsFrom(before[0]),
    daily: dailySeries(daily, range, addDays),
    previousDaily: dailySeries(previousDaily, prev, addDays),
    campaigns,
    generatedAt: new Date().toISOString(),
  };
}

export async function campaignDetail(campaignId, range, { fresh } = {}) {
  const prev = previousRange(range);
  const campaign = await graph(campaignId, {
    fields: 'id,name,account_id,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time',
  }, { fresh });
  const accountId = `act_${campaign.account_id}`;

  const [account, accountRows, cur, before, daily, previousDaily, adsetRows, adsetsList, adRows, adsList] = await Promise.all([
    graph(accountId, { fields: 'id,name,account_status,currency,timezone_name' }, { fresh }),
    insights(accountId, { range, fresh }),
    insights(campaignId, { range, fields: RESULT_FIELDS, fresh }),
    insights(campaignId, { range: prev, fields: RESULT_FIELDS, fresh }),
    insights(campaignId, { range, timeIncrement: 1, fresh }),
    insights(campaignId, { range: prev, timeIncrement: 1, fresh }),
    insights(campaignId, { range, level: 'adset', fields: ['adset_id', 'adset_name', ...RESULT_FIELDS], fresh }),
    graph(`${campaignId}/adsets`, {
      fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,destination_type,targeting',
      limit: 500,
    }, { all: true, fresh }),
    insights(campaignId, { range, level: 'ad', fields: ['ad_id', 'ad_name', 'adset_id', ...RESULT_FIELDS], fresh }),
    graph(`${campaignId}/ads`, {
      fields: 'id,name,status,effective_status,adset_id,creative{thumbnail_url,image_url}',
      thumbnail_width: 160,
      thumbnail_height: 160,
      limit: 500,
    }, { all: true, fresh }),
  ]);

  const info = accountInfo(account);
  const currency = info.currency;

  const adsetMetrics = new Map(adsetRows.map((r) => [r.adset_id, { name: r.adset_name, metrics: metricsFrom(r) }]));
  const adsets = adsetsList.data.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    effectiveStatus: a.effective_status,
    optimizationGoal: a.optimization_goal,
    destinationType: a.destination_type,
    targeting: a.targeting || null,
    budget: (() => {
      const d = budgetValue(a.daily_budget, currency);
      const l = budgetValue(a.lifetime_budget, currency);
      return d || l ? { daily: d, lifetime: l, source: 'adset' } : null;
    })(),
    metrics: adsetMetrics.get(a.id)?.metrics || metricsFrom(null),
  }));

  const adMetrics = new Map(adRows.map((r) => [r.ad_id, { name: r.ad_name, metrics: metricsFrom(r) }]));
  const adsetNames = new Map(adsets.map((a) => [a.id, a.name]));
  const ads = adsList.data.map((ad) => ({
    id: ad.id,
    name: ad.name,
    status: ad.status,
    effectiveStatus: ad.effective_status,
    adsetId: ad.adset_id,
    adsetName: adsetNames.get(ad.adset_id) || null,
    thumbnail: ad.creative?.thumbnail_url || ad.creative?.image_url || null,
    metrics: adMetrics.get(ad.id)?.metrics || metricsFrom(null),
  }));
  for (const row of [...adsets, ...ads]) row.delivered = isDelivered(row.metrics);

  return {
    range,
    previousRange: prev,
    account: info,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      effectiveStatus: campaign.effective_status,
      startTime: campaign.start_time,
      stopTime: campaign.stop_time,
      budget: campaignBudget(campaign, new Map([[campaign.id, adsetsList.data.filter((a) => a.effective_status === 'ACTIVE')]]), currency),
    },
    current: metricsFrom(cur[0]),
    previous: metricsFrom(before[0]),
    accountCurrent: metricsFrom(accountRows[0]),
    daily: dailySeries(daily, range, addDays),
    previousDaily: dailySeries(previousDaily, prev, addDays),
    adsets,
    ads,
    generatedAt: new Date().toISOString(),
  };
}


export async function accountList({ fresh } = {}) {
  const { data } = await graph('me/adaccounts', { fields: 'id,name,account_status,currency,timezone_name', limit: 200 }, { all: true, fresh });
  return data.map(accountInfo);
}

/** Melhores conjuntos (menor custo por conversa) de todas as contas no período. */
export async function topAdsets(range, { fresh, limit = 10 } = {}) {
  // Evita que conjuntos com poucas conversas (sorte estatística) dominem o ranking em períodos longos.
  const minConversations = daysBetween(range.since, range.until) >= 14 ? 10 : 5;
  const { data } = await graph('me/adaccounts', { fields: 'id,name,account_status,currency,timezone_name', limit: 200 }, { all: true, fresh });
  const perAccount = await mapLimit(data.filter((a) => a.account_status === 1), 4, async (acc) => {
    try {
      const rows = await insights(acc.id, { range, level: 'adset', fields: ['adset_id', 'adset_name', 'campaign_id', 'campaign_name'], fresh });
      return rows.map((r) => ({
        id: r.adset_id,
        name: r.adset_name,
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
        accountId: acc.id,
        accountName: acc.name,
        currency: acc.currency,
        metrics: metricsFrom(r),
      }));
    } catch (err) {
      if (err instanceof MetaApiError && err.kind === 'token') throw err;
      return [];
    }
  });
  const all = perAccount.flat();
  const spend = all.reduce((s, r) => s + r.metrics.spend, 0);
  const conversations = all.reduce((s, r) => s + r.metrics.conversations, 0);
  const ranked = all
    .filter((r) => r.metrics.conversations >= minConversations && r.metrics.costPerConversation != null)
    .sort((a, b) => a.metrics.costPerConversation - b.metrics.costPerConversation);
  return {
    range,
    benchmark: conversations > 0 ? spend / conversations : null,
    eligible: ranked.length,
    minConversations,
    items: ranked.slice(0, limit).map((r) => ({
      ...r,
      metrics: {
        spend: r.metrics.spend,
        conversations: r.metrics.conversations,
        costPerConversation: r.metrics.costPerConversation,
        firstReplies: r.metrics.firstReplies,
        linkCtr: r.metrics.linkCtr,
      },
    })),
    generatedAt: new Date().toISOString(),
  };
}

/** Liga/desliga campanha, conjunto ou anúncio e devolve o novo status (o cache é limpo para as telas refletirem). */
export async function setStatus(id, status) {
  await graphWrite(id, { status });
  clearCache();
  const fresh = await graph(id, { fields: 'id,status,effective_status' }, { fresh: true });
  return { id: fresh.id, status: fresh.status, effectiveStatus: fresh.effective_status };
}
