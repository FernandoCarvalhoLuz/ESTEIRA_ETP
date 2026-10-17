import { useCallback, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

export const PRESETS = [
  ['today', 'Hoje'],
  ['yesterday', 'Ontem'],
  ['last_7d', 'Últimos 7 dias'],
  ['last_14d', 'Últimos 14 dias'],
  ['last_30d', 'Últimos 30 dias'],
  ['last_90d', 'Últimos 90 dias'],
  ['this_month', 'Este mês'],
  ['last_month', 'Mês passado'],
  ['custom', 'Personalizado'],
];

const DEFAULT_PRESET = 'last_7d';

/** Período selecionado, guardado na URL (?periodo=&de=&ate=) para links compartilháveis. */
export function useRange() {
  const [params, setParams] = useSearchParams();
  const preset = params.get('periodo') || DEFAULT_PRESET;
  const since = params.get('de') || '';
  const until = params.get('ate') || '';

  const query = useMemo(() => {
    const q = new URLSearchParams({ preset });
    if (preset === 'custom') {
      q.set('since', since);
      q.set('until', until);
    }
    return q.toString();
  }, [preset, since, until]);

  const setRange = useCallback((next) => {
    setParams((current) => {
      const p = new URLSearchParams(current);
      p.set('periodo', next.preset);
      if (next.preset === 'custom') {
        p.set('de', next.since);
        p.set('ate', next.until);
      } else {
        p.delete('de');
        p.delete('ate');
      }
      return p;
    });
  }, [setParams]);

  return { preset, since, until, query, setRange };
}

/** Monta um link preservando o período atual. */
export function useLinkWithRange() {
  const location = useLocation();
  return useCallback((pathname) => {
    const current = new URLSearchParams(location.search);
    const keep = new URLSearchParams();
    for (const key of ['periodo', 'de', 'ate']) if (current.get(key)) keep.set(key, current.get(key));
    const qs = keep.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [location.search]);
}
