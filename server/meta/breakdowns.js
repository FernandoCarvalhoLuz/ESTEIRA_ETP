// Recortes dos resultados (onde, para quem e quando os anúncios entregam): plataforma, posicionamento,
// idade × gênero, dispositivo e dia da semana × hora. Servem a visão geral (todas as contas), a conta e a campanha.
import { graph, mapLimit, MetaApiError } from './client.js';
import { extract, sumMetrics } from './metrics.js';

const FIELDS = 'spend,impressions,reach,clicks,inline_link_clicks,actions';

const pick = (m) => ({
  spend: m.spend,
  impressions: m.impressions,
  linkClicks: m.linkClicks,
  conversations: m.conversations,
  firstReplies: m.firstReplies,
  leads: m.leads,
  costPerConversation: m.costPerConversation,
  linkCtr: m.linkCtr,
  cpm: m.cpm,
});

async function rowsFor(objectId, breakdowns, range, { fresh, daily } = {}) {
  const params = { fields: FIELDS, breakdowns, time_range: { since: range.since, until: range.until }, limit: 500 };
  if (daily) params.time_increment = 1;
  const body = await graph(`${objectId}/insights`, params, { all: true, fresh });
  return body.data || [];
}

/** Agrupa linhas por chave e soma as métricas do grupo. */
function group(rows, keyOf, extra = () => ({})) {
  const map = new Map();
  for (const r of rows) {
    const key = keyOf(r);
    if (key == null) continue;
    const g = map.get(key) || { key, ...extra(r), list: [] };
    g.list.push(extract(r));
    map.set(key, g);
  }
  return [...map.values()].map(({ list, ...g }) => ({ ...g, ...pick(sumMetrics(list)) })).sort((a, b) => b.spend - a.spend);
}

const hourOf = (r) => Number(String(r.hourly_stats_aggregated_by_advertiser_time_zone || '').slice(0, 2));
const dowOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();

async function collect(objectIds, range, { fresh }) {
  const parts = await mapLimit(objectIds, 3, async (id) => {
    try {
      const [platforms, positions, demographics, devices, heat] = await Promise.all([
        rowsFor(id, 'publisher_platform', range, { fresh }),
        rowsFor(id, 'publisher_platform,platform_position', range, { fresh }),
        rowsFor(id, 'age,gender', range, { fresh }),
        rowsFor(id, 'impression_device', range, { fresh }),
        rowsFor(id, 'hourly_stats_aggregated_by_advertiser_time_zone', range, { fresh, daily: true }),
      ]);
      return { platforms, positions, demographics, devices, heat };
    } catch (err) {
      if (err instanceof MetaApiError && err.kind === 'token') throw err;
      return null;
    }
  });
  const ok = parts.filter(Boolean);
  const all = (k) => ok.flatMap((p) => p[k]);
  return {
    platforms: group(all('platforms'), (r) => r.publisher_platform),
    positions: group(all('positions'), (r) => `${r.publisher_platform}:${r.platform_position}`, (r) => ({ platform: r.publisher_platform, position: r.platform_position })),
    demographics: group(all('demographics'), (r) => `${r.age}:${r.gender}`, (r) => ({ age: r.age, gender: r.gender })),
    devices: group(all('devices'), (r) => r.impression_device),
    heat: group(all('heat'), (r) => `${dowOf(r.date_start)}:${hourOf(r)}`, (r) => ({ dow: dowOf(r.date_start), hour: hourOf(r) })),
    partial: ok.length < parts.length,
  };
}

/**
 * scope: "all" (contas ativas na moeda principal), "act_…" (conta) ou id numérico (campanha).
 */
export async function breakdowns(scope, range, { fresh } = {}) {
  let ids;
  let currency;
  if (scope === 'all') {
    const { data } = await graph('me/adaccounts', { fields: 'id,account_status,currency', limit: 200 }, { all: true, fresh });
    const active = data.filter((a) => a.account_status === 1);
    const counts = new Map();
    for (const a of active) counts.set(a.currency, (counts.get(a.currency) || 0) + 1);
    currency = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || 'BRL';
    ids = active.filter((a) => a.currency === currency).map((a) => a.id);
  } else if (scope.startsWith('act_')) {
    const acc = await graph(scope, { fields: 'currency' }, { fresh });
    currency = acc.currency;
    ids = [scope];
  } else {
    const camp = await graph(scope, { fields: 'account_id' }, { fresh });
    const acc = await graph(`act_${camp.account_id}`, { fields: 'currency' }, { fresh });
    currency = acc.currency;
    ids = [scope];
  }
  return { scope, range, currency, ...(await collect(ids, range, { fresh })), generatedAt: new Date().toISOString() };
}
