import { useId, useMemo } from 'react';
import NumberFlow, { NumberFlowGroup } from '@number-flow/react';
import { motion } from 'motion/react';
import { DASH, fmtMetric, fmtPct, METRICS, percentChange } from '../lib/format.js';
import { EASE_OUT, rise, stagger, trackSpotlight } from '../lib/motion.js';
import { ArrowIcon, ChatIcon, TargetIcon, UserPlusIcon, WalletIcon } from './Icons.jsx';

const ICONS = { spend: WalletIcon, conversations: ChatIcon, costPerConversation: TargetIcon, firstReplies: UserPlusIcon };

/** Formato do NumberFlow para cada tipo de métrica. */
function flowFormat(metric, currency) {
  switch (METRICS[metric]?.format) {
    case 'money': return { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    case 'pct': return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    case 'dec': return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    default: return { maximumFractionDigits: 0 };
  }
}

export function AnimatedValue({ metric, value, currency = 'BRL' }) {
  if (value == null || !Number.isFinite(value)) return <span>{DASH}</span>;
  const isPct = METRICS[metric]?.format === 'pct';
  return <NumberFlow value={value} locales="pt-BR" format={flowFormat(metric, currency)} suffix={isPct ? '%' : undefined} />;
}

function Delta({ metric, current, previous, currency }) {
  const change = percentChange(current, previous);
  const def = METRICS[metric];
  if (change == null || !Number.isFinite(change)) return <span className="delta"><span className="vs">sem base anterior</span></span>;
  const dir = change >= 0 ? 'up' : 'down';
  const tone = def.good == null || Math.abs(change) < 0.5 ? '' : def.good === dir ? 'good' : 'bad';
  return (
    <span className={`delta ${tone}`} title={`Período anterior: ${fmtMetric(metric, previous, currency)}`}>
      <span className="pill"><ArrowIcon dir={dir} />{fmtPct(Math.abs(change), 1)}</span>
      <span className="vs">vs. anterior</span>
    </span>
  );
}

/** Mini gráfico de linha que se desenha ao entrar (área em degradê + ponto final). */
export function Sparkline({ values, className = 'spark' }) {
  const id = useId().replace(/:/g, '');
  const points = useMemo(() => {
    const clean = values.map((v) => (v == null || !Number.isFinite(v) ? null : v));
    const valid = clean.filter((v) => v != null);
    if (valid.length < 2) return null;
    const max = Math.max(...valid);
    const min = Math.min(...valid);
    const span = max - min || 1;
    const w = 100;
    const h = 32;
    const step = w / (clean.length - 1);
    let last = valid[0];
    return clean.map((v, i) => {
      const value = v ?? last;
      last = value;
      return [i * step, h - 3 - ((value - min) / span) * (h - 6)];
    });
  }, [values]);
  if (!points) return <span className={className} />;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  const area = `${line} L100,32 L0,32 Z`;
  const end = points[points.length - 1];
  return (
    <svg className={className} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`sg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--series-1)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--series-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={area} fill={`url(#sg-${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.3 }} />
      <motion.path
        d={line}
        fill="none"
        stroke="var(--series-1)"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: EASE_OUT, delay: 0.1 }}
      />
      <path className="spark-trace" d={line} pathLength="1" vectorEffect="non-scaling-stroke" />
      <motion.circle cx={end[0]} cy={end[1]} r="2.2" fill="var(--series-1)" vectorEffect="non-scaling-stroke" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1 }} />
    </svg>
  );
}

export function Kpi({ metric, current, previous, currency, small, hero, spark }) {
  const def = METRICS[metric];
  const Icon = ICONS[metric];
  return (
    <motion.div
      variants={rise}
      className={`card kpi spotlight tilt ${small ? 'small' : ''} ${hero ? 'hero' : ''}`}
      title={def.hint}
      onMouseMove={trackSpotlight}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      {hero && <span className="gold-ring" aria-hidden="true" />}
      <div className="kpi-top">
        <span className="kpi-label">{def.label}</span>
        {!small && Icon && <span className="kpi-icon"><Icon /></span>}
      </div>
      <div className="kpi-value"><AnimatedValue metric={metric} value={current?.[metric]} currency={currency} /></div>
      <div className="kpi-bottom">
        {previous !== undefined ? <Delta metric={metric} current={current?.[metric]} previous={previous?.[metric]} currency={currency} /> : <span />}
        {!small && spark && <Sparkline values={spark} />}
      </div>
    </motion.div>
  );
}

const PRIMARY = ['spend', 'conversations', 'costPerConversation', 'firstReplies'];

/** `daily` alimenta as sparklines (cada item com spend, conversations, costPerConversation, firstReplies). */
export function KpiGrid({ current, previous, currency, includeReach = true, daily }) {
  const secondary = [
    'impressions',
    ...(includeReach ? ['reach', 'frequency'] : []),
    'cpm',
    'linkClicks',
    'linkCtr',
    'cpcLink',
    'clickToConversation',
    ...((current?.leads || previous?.leads) ? ['leads'] : []),
  ];
  const sparkFor = (m) => (daily?.length > 1 && daily[0][m] !== undefined ? daily.map((d) => d[m]) : null);
  return (
    <NumberFlowGroup>
      <motion.div className="kpis" variants={stagger(0.06)} initial="hidden" animate="show">
        {PRIMARY.map((m) => (
          <Kpi key={m} metric={m} current={current} previous={previous} currency={currency} hero={m === 'costPerConversation'} spark={sparkFor(m)} />
        ))}
      </motion.div>
      <motion.div className="kpis kpis-secondary" style={{ '--n': secondary.length }} variants={stagger(0.03, 0.2)} initial="hidden" animate="show">
        {secondary.map((m) => (
          <Kpi key={m} metric={m} current={current} previous={previous} currency={currency} small />
        ))}
      </motion.div>
    </NumberFlowGroup>
  );
}
