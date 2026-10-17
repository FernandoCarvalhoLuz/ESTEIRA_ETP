import { fmtInt, fmtMetric, fmtMoney, METRICS } from './format.js';

/** Coluna numérica a partir do catálogo de métricas. `get` extrai o objeto de métricas da linha. */
export function metricColumn(key, { currency, get = (r) => r.metrics, label, bar } = {}) {
  const def = METRICS[key];
  return {
    key,
    label: label || def.short || def.label,
    num: true,
    bar: bar ?? (key === 'spend' || key === 'conversations'),
    title: def.hint,
    value: (r) => get(r)?.[key] ?? null,
    render: (r) => fmtMetric(key, get(r)?.[key], currency),
    footer: (f) => fmtMetric(key, f.metrics?.[key], currency),
  };
}

export function resultColumns(currency) {
  return [
    {
      key: 'results',
      label: 'Resultados',
      num: true,
      title: 'Resultado conforme a meta de otimização definida na Meta',
      value: (r) => r.metrics.results ?? null,
      csv: (r) => (r.metrics.results == null ? '' : `${r.metrics.results} ${r.metrics.resultLabel || ''}`.trim()),
      render: (r) => (r.metrics.resultIndicator ? (
        <>
          {fmtInt(r.metrics.results)}
          <span className="cell-sub">{r.metrics.resultLabel}</span>
        </>
      ) : '—'),
    },
    {
      key: 'costPerResult',
      label: 'Custo/resultado',
      num: true,
      value: (r) => r.metrics.costPerResult ?? null,
      render: (r) => fmtMoney(r.metrics.costPerResult, currency),
    },
  ];
}

export const PERFORMANCE_KEYS = ['spend', 'conversations', 'costPerConversation', 'firstReplies', 'costPerFirstReply'];
export const DELIVERY_KEYS = ['impressions', 'reach', 'frequency', 'cpm', 'linkClicks', 'linkCtr', 'cpcLink', 'clickToConversation', 'leads', 'costPerLead'];
