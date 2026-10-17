const cache = new Map();
function nf(key, options) {
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat('pt-BR', options));
  return cache.get(key);
}

export const DASH = '—';

export function fmtMoney(value, currency = 'BRL') {
  if (value == null || Number.isNaN(value)) return DASH;
  return nf(`money-${currency}`, { style: 'currency', currency }).format(value);
}

export function fmtInt(value) {
  if (value == null) return DASH;
  return nf('int', { maximumFractionDigits: 0 }).format(value);
}

export function fmtDec(value, digits = 2) {
  if (value == null) return DASH;
  return nf(`dec-${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function fmtPct(value, digits = 2) {
  if (value == null) return DASH;
  return `${fmtDec(value, digits)}%`;
}

export function fmtCompact(value) {
  if (value == null) return DASH;
  return nf('compact', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function fmtDateShort(iso) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : DASH;
}

export function fmtDate(iso) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : DASH;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export function fmtDateWeekday(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${fmtDate(iso)}`;
}

export function fmtDateTime(iso) {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : DASH;
}

export function fmtRange(range) {
  if (!range) return '';
  if (range.since === range.until) return fmtDate(range.since);
  return `${fmtDate(range.since)} – ${fmtDate(range.until)}`;
}

export function percentChange(current, previous) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function fmtBudget(budget, currency) {
  if (!budget) return DASH;
  const parts = [];
  if (budget.daily) parts.push(`${fmtMoney(budget.daily, currency)}/dia`);
  if (budget.lifetime) parts.push(`${fmtMoney(budget.lifetime, currency)} total`);
  return parts.join(' · ') || DASH;
}

/**
 * Catálogo de métricas: rótulo, formato e qual direção é "boa" (up/down/null = neutra).
 */
export const METRICS = {
  spend: { label: 'Investimento', format: 'money', good: null },
  conversations: { label: 'Conversas iniciadas', short: 'Conversas', format: 'int', good: 'up', hint: 'Conversas por mensagem iniciadas (janela de 7 dias)' },
  costPerConversation: { label: 'Custo por conversa', short: 'Custo/conversa', format: 'money', good: 'down', hint: 'Investimento ÷ conversas iniciadas' },
  firstReplies: { label: 'Novos contatos', format: 'int', good: 'up', hint: 'Pessoas que enviaram mensagem pela primeira vez' },
  costPerFirstReply: { label: 'Custo por novo contato', short: 'Custo/novo contato', format: 'money', good: 'down' },
  impressions: { label: 'Impressões', format: 'int', good: 'up' },
  reach: { label: 'Alcance', format: 'int', good: 'up' },
  frequency: { label: 'Frequência', format: 'dec', good: null },
  cpm: { label: 'CPM', format: 'money', good: 'down', hint: 'Custo por mil impressões' },
  clicks: { label: 'Cliques (todos)', format: 'int', good: 'up' },
  linkClicks: { label: 'Cliques no link', format: 'int', good: 'up' },
  linkCtr: { label: 'CTR (link)', format: 'pct', good: 'up', hint: 'Cliques no link ÷ impressões' },
  cpcLink: { label: 'CPC (link)', format: 'money', good: 'down', hint: 'Investimento ÷ cliques no link' },
  clickToConversation: { label: 'Clique → conversa', format: 'pct', good: 'up', hint: 'Conversas iniciadas ÷ cliques no link' },
  leads: { label: 'Leads', format: 'int', good: 'up' },
  costPerLead: { label: 'Custo por lead', short: 'Custo/lead', format: 'money', good: 'down' },
  results: { label: 'Resultados', format: 'int', good: 'up' },
  costPerResult: { label: 'Custo por resultado', short: 'Custo/resultado', format: 'money', good: 'down' },
};

export function fmtMetric(key, value, currency) {
  switch (METRICS[key]?.format) {
    case 'money': return fmtMoney(value, currency);
    case 'int': return fmtInt(value);
    case 'pct': return fmtPct(value);
    case 'dec': return fmtDec(value);
    default: return value == null ? DASH : String(value);
  }
}

export const OBJECTIVES = {
  OUTCOME_ENGAGEMENT: 'Engajamento',
  OUTCOME_LEADS: 'Cadastros',
  OUTCOME_SALES: 'Vendas',
  OUTCOME_TRAFFIC: 'Tráfego',
  OUTCOME_AWARENESS: 'Reconhecimento',
  OUTCOME_APP_PROMOTION: 'Promoção do app',
  LINK_CLICKS: 'Cliques no link',
  MESSAGES: 'Mensagens',
  CONVERSIONS: 'Conversões',
  VIDEO_VIEWS: 'Visualizações de vídeo',
  POST_ENGAGEMENT: 'Engajamento com publicação',
  PAGE_LIKES: 'Curtidas na página',
  REACH: 'Alcance',
  BRAND_AWARENESS: 'Reconhecimento da marca',
  LEAD_GENERATION: 'Geração de cadastros',
  EVENT_RESPONSES: 'Respostas a evento',
  PRODUCT_CATALOG_SALES: 'Vendas do catálogo',
  STORE_VISITS: 'Visitas ao estabelecimento',
  APP_INSTALLS: 'Instalações do app',
};

export const OPTIMIZATION_GOALS = {
  CONVERSATIONS: 'Conversas',
  REPLIES: 'Respostas',
  LINK_CLICKS: 'Cliques no link',
  LANDING_PAGE_VIEWS: 'Visualizações da página',
  LEAD_GENERATION: 'Leads',
  QUALITY_LEAD: 'Leads qualificados',
  OFFSITE_CONVERSIONS: 'Conversões',
  REACH: 'Alcance',
  IMPRESSIONS: 'Impressões',
  THRUPLAY: 'ThruPlay',
  POST_ENGAGEMENT: 'Engajamento',
  PROFILE_VISIT: 'Visitas ao perfil',
  VALUE: 'Valor',
};

export const DESTINATIONS = {
  WHATSAPP: 'WhatsApp',
  MESSENGER: 'Messenger',
  INSTAGRAM_DIRECT: 'Instagram Direct',
  MESSAGING_MESSENGER_WHATSAPP: 'Messenger + WhatsApp',
  MESSAGING_INSTAGRAM_DIRECT_WHATSAPP: 'Instagram + WhatsApp',
  MESSAGING_INSTAGRAM_DIRECT_MESSENGER: 'Instagram + Messenger',
  MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP: 'Instagram + Messenger + WhatsApp',
  WEBSITE: 'Site',
  ON_AD: 'No anúncio',
  INSTAGRAM_PROFILE: 'Perfil do Instagram',
  FACEBOOK: 'Facebook',
  APP: 'App',
  UNDEFINED: null,
};

export const STATUS = {
  ACTIVE: { label: 'Ativa', tone: 'good' },
  PAUSED: { label: 'Pausada', tone: 'idle' },
  CAMPAIGN_PAUSED: { label: 'Campanha pausada', tone: 'idle' },
  ADSET_PAUSED: { label: 'Conjunto pausado', tone: 'idle' },
  ARCHIVED: { label: 'Arquivada', tone: 'idle' },
  DELETED: { label: 'Excluída', tone: 'idle' },
  IN_PROCESS: { label: 'Em processamento', tone: 'warning' },
  PENDING_REVIEW: { label: 'Em análise', tone: 'warning' },
  PREAPPROVED: { label: 'Pré-aprovada', tone: 'warning' },
  PENDING_BILLING_INFO: { label: 'Pagamento pendente', tone: 'warning' },
  WITH_ISSUES: { label: 'Com problemas', tone: 'critical' },
  DISAPPROVED: { label: 'Reprovada', tone: 'critical' },
};
