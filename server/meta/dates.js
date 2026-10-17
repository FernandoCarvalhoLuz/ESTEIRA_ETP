// Períodos de análise calculados no fuso das contas, sempre enviados à Meta como time_range explícito.
import { config } from '../config.js';

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const PRESETS = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last_7d: 'Últimos 7 dias',
  last_14d: 'Últimos 14 dias',
  last_30d: 'Últimos 30 dias',
  last_90d: 'Últimos 90 dias',
  this_month: 'Este mês',
  last_month: 'Mês passado',
  custom: 'Personalizado',
};

export class RangeError400 extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

export function today(tz = config.timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const toTime = (d) => Date.parse(`${d}T00:00:00Z`);
const fromTime = (t) => new Date(t).toISOString().slice(0, 10);

export function addDays(d, n) {
  return fromTime(toTime(d) + n * DAY_MS);
}

export function daysBetween(since, until) {
  return Math.round((toTime(until) - toTime(since)) / DAY_MS) + 1;
}

function firstOfMonth(d) {
  return `${d.slice(0, 7)}-01`;
}

export function resolveRange({ preset = 'last_7d', since, until } = {}) {
  const t = today();
  switch (preset) {
    case 'today': return { preset, since: t, until: t };
    case 'yesterday': return { preset, since: addDays(t, -1), until: addDays(t, -1) };
    case 'last_7d': return { preset, since: addDays(t, -7), until: addDays(t, -1) };
    case 'last_14d': return { preset, since: addDays(t, -14), until: addDays(t, -1) };
    case 'last_30d': return { preset, since: addDays(t, -30), until: addDays(t, -1) };
    case 'last_90d': return { preset, since: addDays(t, -90), until: addDays(t, -1) };
    case 'this_month': return { preset, since: firstOfMonth(t), until: t };
    case 'last_month': {
      const end = addDays(firstOfMonth(t), -1);
      return { preset, since: firstOfMonth(end), until: end };
    }
    case 'custom': {
      if (!ISO_DATE.test(since || '') || !ISO_DATE.test(until || '')) throw new RangeError400('Informe datas válidas (AAAA-MM-DD).');
      if (since > until) throw new RangeError400('A data inicial deve ser anterior à final.');
      if (until > t) throw new RangeError400('A data final não pode estar no futuro.');
      if (daysBetween(since, t) > 1100) throw new RangeError400('A Meta só disponibiliza dados dos últimos 37 meses.');
      return { preset, since, until };
    }
    default:
      throw new RangeError400('Período inválido.');
  }
}

/** Período imediatamente anterior, com a mesma quantidade de dias. */
export function previousRange(range) {
  const length = daysBetween(range.since, range.until);
  const until = addDays(range.since, -1);
  return { since: addDays(until, -(length - 1)), until };
}

export function rangeFromQuery(query) {
  return resolveRange({ preset: query.preset || 'last_7d', since: query.since, until: query.until });
}
