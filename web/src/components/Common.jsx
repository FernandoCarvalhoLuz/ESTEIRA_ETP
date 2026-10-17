import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { api } from '../lib/api.js';
import { fmtRange, fmtTime, STATUS } from '../lib/format.js';
import { PRESETS, useRange } from '../lib/range.js';
import { EASE_OUT, spring } from '../lib/motion.js';
import { RefreshIcon, XIcon } from './Icons.jsx';

const TRANSITIONAL = new Set(['IN_PROCESS', 'PENDING_REVIEW', 'PREAPPROVED', 'PENDING_BILLING_INFO']);

export function Status({ value, label }) {
  const def = STATUS[value] || { label: label || value || '—', tone: 'idle' };
  return (
    <span className="status">
      <span className={`dot ${def.tone} ${TRANSITIONAL.has(value) ? 'pulse' : ''}`} aria-hidden="true" />
      {label || def.label}
    </span>
  );
}

/** Grupo de opções com a "pílula" deslizando até a opção ativa. */
export function Segmented({ options, value, onChange, label, size }) {
  const id = useId();
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          className={`chip ${value === v ? 'on' : ''}`}
          style={size === 'sm' ? { fontSize: 12, padding: '4px 9px' } : undefined}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
        >
          {value === v && <motion.span layoutId={`seg-${id}`} className="chip-pill" transition={spring} />}
          {text}
        </button>
      ))}
    </div>
  );
}

export function RangePicker({ resolved }) {
  const { preset, since, until, setRange } = useRange();
  const [draft, setDraft] = useState({ since, until });

  useEffect(() => {
    setDraft({ since: since || resolved?.since || '', until: until || resolved?.until || '' });
  }, [since, until, resolved?.since, resolved?.until]);

  function onPreset(e) {
    const next = e.target.value;
    if (next === 'custom') setRange({ preset: 'custom', since: draft.since || resolved?.since, until: draft.until || resolved?.until });
    else setRange({ preset: next });
  }

  const draftValid = draft.since && draft.until && draft.since <= draft.until;

  return (
    <div className="range">
      <select className="field" value={preset} onChange={onPreset} aria-label="Período">
        {PRESETS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
      {preset === 'custom' ? (
        <form className="range" onSubmit={(e) => { e.preventDefault(); if (draftValid) setRange({ preset: 'custom', ...draft }); }}>
          <input type="date" className="field" value={draft.since} onChange={(e) => setDraft({ ...draft, since: e.target.value })} aria-label="Data inicial" />
          <input type="date" className="field" value={draft.until} onChange={(e) => setDraft({ ...draft, until: e.target.value })} aria-label="Data final" />
          <button type="submit" className="btn" disabled={!draftValid}>Aplicar</button>
        </form>
      ) : (
        resolved && <span className="range-dates">{fmtRange(resolved)}</span>
      )}
    </div>
  );
}

export function PageControls({ data, loading, onRefresh, children }) {
  return (
    <div className="controls">
      {children}
      <RangePicker resolved={data?.range} />
      <button type="button" className="btn" onClick={onRefresh} disabled={loading} title="Buscar dados novos na Meta">
        <RefreshIcon spinning={loading} /> Atualizar
      </button>
      {data?.generatedAt && <span className="updated">às {fmtTime(data.generatedAt)}</span>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const tokenProblem = error?.code === 'META_TOKEN';
  return (
    <motion.div className="card state" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <h3>{tokenProblem ? 'Token da Meta inválido ou expirado' : 'Não foi possível carregar os dados'}</h3>
      <div>{error?.message}</div>
      {tokenProblem
        ? <Link className="btn btn-primary" to="/configuracoes">Atualizar token</Link>
        : onRetry && <button type="button" className="btn" onClick={onRetry}>Tentar de novo</button>}
    </motion.div>
  );
}

export function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 138 }} />)}</div>
      <div className="skeleton" style={{ height: 76, marginTop: 14 }} />
      <div className="charts" style={{ marginTop: 32 }}>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 250 }} />)}</div>
      <div className="skeleton" style={{ height: 360, marginTop: 32 }} />
    </div>
  );
}

/** Modal com foco inicial, Esc para fechar e retorno do foco ao elemento de origem. */
export function Modal({ open, onClose, title, subtitle, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => ref.current?.querySelector('input, textarea, select, button:not(.modal-close)')?.focus(), 60);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`modal ${wide ? 'wide' : ''}`}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.32, ease: EASE_OUT } }}
            exit={{ opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.15 } }}
          >
            <div className="modal-head">
              <div>
                <h2>{title}</h2>
                {subtitle && <p>{subtitle}</p>}
              </div>
              <button type="button" className="btn btn-ghost btn-icon btn-sm modal-close" onClick={onClose} aria-label="Fechar"><XIcon /></button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

const KIND_LABEL = { campaign: ['esta campanha', 'Campanha'], adset: ['este conjunto', 'Conjunto'], ad: ['este anúncio', 'Anúncio'] };

/** Liga/desliga campanha, conjunto ou anúncio direto na Meta (pede confirmação para ativar). */
export function StatusToggle({ id, status, kind = 'campaign', onChanged }) {
  const [current, setCurrent] = useState(status);
  const [busy, setBusy] = useState(false);
  useEffect(() => setCurrent(status), [status]);
  if (!id || !status || status === 'ARCHIVED' || status === 'DELETED') return null;
  const on = current === 'ACTIVE';
  const [what, title] = KIND_LABEL[kind] || KIND_LABEL.campaign;

  async function toggle() {
    const next = on ? 'PAUSED' : 'ACTIVE';
    if (next === 'ACTIVE' && !window.confirm(`Ativar ${what}? Ela entra em veiculação (e começa a gastar) assim que a Meta aprovar.`)) return;
    setBusy(true);
    setCurrent(next);
    try {
      const r = await api('/api/meta/status', { method: 'POST', body: { id, status: next } });
      setCurrent(r.status);
      toast.success(r.status === 'ACTIVE' ? `${title} ativado(a)` : `${title} pausado(a)`);
      onChanged?.(r);
    } catch (err) {
      setCurrent(on ? 'ACTIVE' : 'PAUSED');
      toast.error('Não foi possível alterar o status', { description: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`status-toggle ${busy ? 'busy' : ''}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} title={on ? `Pausar ${what}` : `Ativar ${what}`}>
      <Switch on={on} onChange={toggle} label={on ? `Pausar ${what}` : `Ativar ${what}`} />
    </span>
  );
}
