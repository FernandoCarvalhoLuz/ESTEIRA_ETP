import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../../lib/api.js';

export function mediaThumb(media) {
  if (!media) return null;
  if (media.source === 'upload' && media.mediaId) return `/api/builder/media/${media.mediaId}/file`;
  return media.thumbUrl || null;
}

export function fmtPhone(n) {
  if (!n) return '';
  const m = String(n).match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+${m[1]} (${m[2]}) ${m[3]}-${m[4]}` : `+${n}`;
}

export function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Botões que inserem variáveis ({OFERTA}, {preco}…) no fim do texto. */
export function TokenChips({ tokens, onInsert }) {
  return (
    <div className="token-chips">
      {tokens.map(([token, hint]) => (
        <button key={token} type="button" className="token-chip" title={hint} onClick={() => onInsert(token)}>{token}</button>
      ))}
    </div>
  );
}

export const TEXT_TOKENS = [
  ['{oferta}', 'Oferta/veículo como você digitou'],
  ['{OFERTA}', 'Oferta/veículo em maiúsculas'],
  ['{preco}', 'Preço informado na etapa Oferta'],
  ['{km}', 'Quilometragem informada na etapa Oferta'],
  ['{ano}', 'Ano informado na etapa Oferta'],
  ['{cidade}', 'Primeira cidade do público'],
];

/**
 * Campo de valor em reais com máscara (R$ 1.234,56). `cents={false}` para valores inteiros como preço de veículo.
 * value/onChange trabalham com número (ou null quando vazio).
 */
export function MoneyInput({ value, onChange, cents = true, placeholder, className = 'field', ...rest }) {
  const digitsOpts = { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 };
  const display = value == null || value === '' || Number.isNaN(Number(value)) ? '' : `R$ ${Number(value).toLocaleString('pt-BR', digitsOpts)}`;
  function handle(e) {
    const digits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 11);
    if (!digits || /^0+$/.test(digits)) return onChange(null);
    onChange(cents ? Number(digits) / 100 : Number(digits));
  }
  return <input inputMode="numeric" className={`${className} mono-field`} placeholder={placeholder ?? (cents ? 'R$ 0,00' : 'R$ 0')} value={display} onChange={handle} onFocus={(e) => e.target.select()} {...rest} />;
}

/** Número inteiro com separador de milhar (ex.: quilometragem 45.000). Guarda o texto já formatado. */
export function IntInput({ value, onChange, className = 'field', ...rest }) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return (
    <input
      inputMode="numeric"
      className={`${className} mono-field`}
      value={digits ? Number(digits).toLocaleString('pt-BR') : ''}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, '').slice(0, 9);
        onChange(d ? Number(d).toLocaleString('pt-BR') : '');
      }}
      {...rest}
    />
  );
}

const STOP = new Set(['VOLKSWAGEN', 'VW', 'CHEVROLET', 'GM', 'FIAT', 'TOYOTA', 'HONDA', 'HYUNDAI', 'JEEP', 'BMW', 'KIA', 'RENAULT', 'NISSAN', 'FORD', 'PEUGEOT', 'CITROEN', 'CITROËN', 'MERCEDES', 'MERCEDES-BENZ', 'AUDI', 'MITSUBISHI', 'PORSCHE',
  'FLEX', 'AUT', 'AUT.', 'MEC', 'TURBO', 'TB', 'DIESEL', 'GASOLINA', 'HIBRIDO', 'HÍBRIDO', 'COM', 'KM', 'PLUS', 'CD', 'CS', '4X2', '4X4', 'FEED', 'ST', 'STORIES']);
const words = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/[^A-Z0-9-]+/).filter((w) => w.length >= 2 && !STOP.has(w) && !/^(19|20)\d\d$/.test(w) && !/^\d+(\.\d)?$/.test(w));

/** Pontua o quanto um nome de arte combina com o item (ignora marca, ano e termos genéricos). */
export function matchScore(title, candidate) {
  const want = words(title);
  if (!want.length) return 0;
  const have = new Set(words(candidate));
  return want.filter((w) => have.has(w)).length / want.length;
}

/** Campo de busca com lista de resultados vindos da API (cidades, interesses…). */
export function SearchCombo({ placeholder, endpoint, render, onPick, minChars = 2 }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(term, 350);
  const box = useRef(null);

  useEffect(() => {
    if (debounced.trim().length < minChars) {
      setResults([]);
      return;
    }
    let cancelled = false;
    api(`${endpoint}?q=${encodeURIComponent(debounced.trim())}`).then((r) => { if (!cancelled) { setResults(r); setOpen(true); } }, () => {});
    return () => { cancelled = true; };
  }, [debounced, endpoint, minChars]);

  useEffect(() => {
    const onDoc = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="combo" ref={box}>
      <input className="field" style={{ width: '100%' }} placeholder={placeholder} value={term} onChange={(e) => setTerm(e.target.value)} onFocus={() => results.length && setOpen(true)} />
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div className="combo-list" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
            {results.map((r, i) => (
              <button key={r.key || r.id || i} type="button" className="combo-item" onClick={() => { onPick(r); setTerm(''); setOpen(false); }}>
                {render(r)}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function fmtAudience(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** Nomes de veículos com arte do Canva na conta (só nomes confiáveis). */
export function useCanvaVehicles(accountId) {
  const [vehicles, setVehicles] = useState([]);
  useEffect(() => {
    if (!accountId) return setVehicles([]);
    let cancelled = false;
    api(`/api/builder/media?accountId=${accountId}`).then((lib) => {
      if (cancelled) return;
      // Só nomes confiáveis: renomeados à mão ou únicos (o Canva às vezes repete o nome do arquivo em várias páginas).
      const count = new Map();
      for (const m of lib.canva) if (m.canva.format === 'feed') count.set(m.canva.vehicle, (count.get(m.canva.vehicle) || 0) + 1);
      const trusted = lib.canva.filter((m) => !m.canva.isBase && (m.canva.renamed || count.get(m.canva.vehicle) === 1));
      const names = new Set(trusted.map((m) => (m.canva.renamed ? m.canva.vehicle : titleCase(`${m.canva.vehicle} ${m.canva.year}`.trim()))));
      setVehicles([...names].slice(0, 16));
    }, () => {});
    return () => { cancelled = true; };
  }, [accountId]);
  return vehicles;
}

function titleCase(s) {
  return s.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase()).replace(/\b(Ltz|Lt|Tsi|Tdi|Cd|Cs|Hr-V|Aut\.?|Gnv)\b/gi, (w) => w.toUpperCase());
}

