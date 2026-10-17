// Normaliza as linhas de insights da Meta em métricas somáveis e calcula as derivadas (custos e taxas).

export const ACTIONS = {
  conversations: 'onsite_conversion.messaging_conversation_started_7d',
  firstReplies: 'onsite_conversion.messaging_first_reply',
  connections: 'onsite_conversion.total_messaging_connection',
  depth2: 'onsite_conversion.messaging_user_depth_2_message_send',
  depth3: 'onsite_conversion.messaging_user_depth_3_message_send',
  depth5: 'onsite_conversion.messaging_user_depth_5_message_send',
  landingPageViews: 'landing_page_view',
  videoViews: 'video_view',
  postEngagement: 'post_engagement',
};

const SUMMABLE = [
  'spend', 'impressions', 'reach', 'clicks', 'linkClicks', 'leads',
  ...Object.keys(ACTIONS),
];

const RESULT_LABELS = {
  'onsite_conversion.messaging_conversation_started_7d': 'Conversas iniciadas',
  'onsite_conversion.messaging_first_reply': 'Novos contatos',
  'onsite_conversion.total_messaging_connection': 'Contatos de mensagem',
  link_click: 'Cliques no link',
  landing_page_view: 'Visualizações da página',
  video_thruplay_watched_actions: 'ThruPlays',
  video_view: 'Visualizações de vídeo',
  post_engagement: 'Engajamentos',
  page_engagement: 'Engajamentos com a página',
  like: 'Curtidas na página',
  lead: 'Leads',
  'onsite_conversion.lead_grouped': 'Leads (formulário)',
  'offsite_conversion.fb_pixel_lead': 'Leads (site)',
  'offsite_conversion.fb_pixel_purchase': 'Compras',
  reach: 'Alcance',
  impressions: 'Impressões',
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function actionValue(actions, type) {
  const found = actions.find((a) => a.action_type === type);
  return found ? toNumber(found.value) : 0;
}

export function resultLabel(indicator) {
  if (!indicator) return null;
  const key = indicator.replace(/^actions:/, '');
  return RESULT_LABELS[key] || key.replace(/^onsite_conversion\.|^offsite_conversion\./, '').replace(/_/g, ' ');
}

/** Extrai os valores brutos (somáveis) de uma linha de insights. */
export function extract(row) {
  const actions = row?.actions || [];
  const base = {
    spend: toNumber(row?.spend),
    impressions: toNumber(row?.impressions),
    reach: toNumber(row?.reach),
    clicks: toNumber(row?.clicks),
    linkClicks: toNumber(row?.inline_link_clicks),
    leads: actionValue(actions, 'lead') || actionValue(actions, 'onsite_conversion.lead_grouped'),
  };
  for (const [key, type] of Object.entries(ACTIONS)) base[key] = actionValue(actions, type);

  const result = row?.results?.[0];
  if (result) {
    base.resultIndicator = result.indicator || null;
    base.results = toNumber(result.values?.[0]?.value);
  }
  return base;
}

const ratio = (a, b) => (b > 0 ? a / b : null);

/** Acrescenta custos e taxas calculados a partir dos valores brutos. */
export function derive(m) {
  return {
    ...m,
    frequency: ratio(m.impressions, m.reach),
    ctr: ratio(m.clicks * 100, m.impressions),
    linkCtr: ratio(m.linkClicks * 100, m.impressions),
    cpc: ratio(m.spend, m.clicks),
    cpcLink: ratio(m.spend, m.linkClicks),
    cpm: ratio(m.spend * 1000, m.impressions),
    costPerConversation: ratio(m.spend, m.conversations),
    costPerFirstReply: ratio(m.spend, m.firstReplies),
    costPerLead: ratio(m.spend, m.leads),
    clickToConversation: ratio(m.conversations * 100, m.linkClicks),
    ...(m.resultIndicator !== undefined
      ? { resultLabel: resultLabel(m.resultIndicator), costPerResult: ratio(m.spend, m.results) }
      : {}),
  };
}

export function metricsFrom(row) {
  return derive(extract(row));
}

/** Soma várias linhas já extraídas. O alcance somado é uma aproximação (pessoas podem se repetir). */
export function sumMetrics(list) {
  const total = Object.fromEntries(SUMMABLE.map((k) => [k, 0]));
  for (const m of list) for (const k of SUMMABLE) total[k] += m?.[k] || 0;
  return derive(total);
}

export function isDelivered(m) {
  return m.spend > 0 || m.impressions > 0;
}

/** Série diária contínua (dias sem veiculação entram zerados). */
export function dailySeries(rows, range, addDays) {
  const byDate = new Map(rows.map((r) => [r.date_start, r]));
  const series = [];
  for (let day = range.since; day <= range.until; day = addDays(day, 1)) {
    const m = metricsFrom(byDate.get(day));
    series.push({
      date: day,
      spend: m.spend,
      impressions: m.impressions,
      linkClicks: m.linkClicks,
      conversations: m.conversations,
      firstReplies: m.firstReplies,
      leads: m.leads,
      costPerConversation: m.costPerConversation,
      cpm: m.cpm,
      linkCtr: m.linkCtr,
    });
  }
  return series;
}

// Moedas sem casas decimais na Meta (orçamentos já vêm na unidade cheia).
const ZERO_DECIMAL = new Set(['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND']);

export function budgetValue(raw, currency) {
  if (raw === undefined || raw === null || raw === '' || Number(raw) === 0) return null;
  return ZERO_DECIMAL.has(currency) ? Number(raw) : Number(raw) / 100;
}
