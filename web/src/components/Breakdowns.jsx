// "Anatomia dos resultados": funil do anúncio até a conversa e os recortes da Meta
// (plataforma, posicionamento, idade × gênero, dia × hora e dispositivo), todos animados.
import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useInView } from 'motion/react';
import { siAndroid, siApple } from 'simple-icons';
import { useApi } from '../lib/api.js';
import { fmtCompact, fmtInt, fmtMoney, fmtPct } from '../lib/format.js';
import { useRange } from '../lib/range.js';
import { EASE_OUT, rise, stagger, trackSpotlight } from '../lib/motion.js';
import { Segmented } from './Common.jsx';
import { BrandBadge, BrandLogo, PLATFORMS, platformLabel, positionLabel, publisherLabel } from './Brands.jsx';

/** Número que conta de 0 até o valor quando entra na tela. */
export function CountUp({ value, format = fmtInt, duration = 1.2 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView || value == null) return undefined;
    const controls = animate(0, value, { duration, ease: EASE_OUT, onUpdate: setShown });
    return () => controls.stop();
  }, [inView, value, duration]);
  return <span ref={ref}>{value == null ? '—' : format(shown)}</span>;
}

const share = (part, total) => (total > 0 ? part / total : 0);

// ---------------------------------------------------------------- Funil

const FUNNEL = [
  { key: 'impressions', label: 'Impressões', verb: 'viram o anúncio' },
  { key: 'linkClicks', label: 'Cliques no link', verb: 'clicaram' },
  { key: 'conversations', label: 'Conversas iniciadas', verb: 'chamaram no WhatsApp' },
  { key: 'firstReplies', label: 'Novos contatos', verb: 'responderam' },
  { key: 'depth3', label: '3+ mensagens', verb: 'engajaram na conversa' },
];

/** Funil do anúncio até a conversa engajada. Larguras em escala log (impressões ≫ conversas). */
export function MessagingFunnel({ metrics, currency }) {
  const stages = FUNNEL.map((s) => ({ ...s, value: metrics?.[s.key] || 0 })).filter((s, i) => i < 3 || s.value > 0);
  const max = Math.log10(Math.max(10, stages[0].value));
  const width = (v) => Math.max(14, (Math.log10(Math.max(1, v)) / max) * 100);
  return (
    <motion.div variants={rise} className="card chart-card funnel-card spotlight" onMouseMove={trackSpotlight}>
      <div className="chart-title">Do anúncio à conversa</div>
      <div className="chart-sub">Cada etapa mostra quantas pessoas avançaram · escala logarítmica</div>
      <div className="funnel">
        {stages.map((s, i) => {
          const next = stages[i + 1];
          const rate = next ? share(next.value, s.value) * 100 : null;
          const cost = s.value > 0 && i > 0 ? metrics.spend / s.value : null;
          return (
            <div key={s.key} className="funnel-stage">
              <motion.div
                className={`funnel-bar f${i}`}
                initial={{ width: '8%', opacity: 0 }}
                whileInView={{ width: `${width(s.value)}%`, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.12 * i }}
              >
                <span className="funnel-shine" />
                <strong><CountUp value={s.value} format={s.value >= 100000 ? fmtCompact : fmtInt} /></strong>
              </motion.div>
              <div className="funnel-label">
                <span>{s.label}</span>
                {cost != null && <small>{fmtMoney(cost, currency)} cada</small>}
              </div>
              {next && (
                <motion.div className="funnel-rate" initial={{ opacity: 0, y: -4 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.12 * i + 0.5 }}>
                  <i className="funnel-drop" />
                  {fmtPct(rate, rate < 1 ? 2 : 1)} {next.verb}
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- Plataformas (rosca)

const minConv = (list) => Math.max(5, list.reduce((s, p) => s + p.conversations, 0) * 0.03);


const PLATFORM_COLOR = { facebook: '#0866FF', instagram: '#E1306C', whatsapp: '#25D366', messenger: '#A033FF', audience_network: '#8A8F98', threads: '#9AA0A6' };

function Donut({ items, metric, total, currency }) {
  const R = 64;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const center = metric === 'spend' ? fmtMoney(total, currency) : fmtInt(total);
  return (
    <svg viewBox="0 0 160 160" className="donut">
      <circle cx="80" cy="80" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="16" />
      {items.map((p, i) => {
        const frac = share(p[metric], total);
        const len = Math.max(0, frac * C - 3);
        const el = (
          <motion.circle
            key={p.key}
            cx="80" cy="80" r={R} fill="none" stroke={PLATFORM_COLOR[p.key] || '#8A8F98'} strokeWidth="16" strokeLinecap="butt"
            transform="rotate(-90 80 80)"
            initial={{ strokeDasharray: `0 ${C}`, strokeDashoffset: -offset }}
            whileInView={{ strokeDasharray: `${len} ${C}`, strokeDashoffset: -offset }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: EASE_OUT, delay: 0.15 + i * 0.12 }}
          >
            <title>{`${publisherLabel(p.key)}: ${fmtPct(frac * 100, 1)}`}</title>
          </motion.circle>
        );
        offset += frac * C;
        return el;
      })}
      <text x="80" y="76" textAnchor="middle" className="donut-value">{center}</text>
      <text x="80" y="96" textAnchor="middle" className="donut-label">{metric === 'spend' ? 'investidos' : 'conversas'}</text>
    </svg>
  );
}

export function PlatformSplit({ data }) {
  const [metric, setMetric] = useState('conversations');
  const items = (data?.platforms || []).filter((p) => p.spend > 0.5 || p.conversations > 0);
  const total = items.reduce((s, p) => s + p[metric], 0);
  const sorted = [...items].sort((a, b) => b[metric] - a[metric]);
  const best = items.filter((p, _, list) => p.conversations >= minConv(list)).sort((a, b) => a.costPerConversation - b.costPerConversation)[0];
  return (
    <motion.div variants={rise} className="card chart-card spotlight" onMouseMove={trackSpotlight}>
      <div className="chart-head">
        <div>
          <div className="chart-title">Onde as conversas nascem</div>
          <div className="chart-sub">Distribuição por plataforma da Meta</div>
        </div>
        <Segmented size="sm" options={[['conversations', 'Conversas'], ['spend', 'Investimento']]} value={metric} onChange={setMetric} label="Métrica" />
      </div>
      {items.length === 0 ? <div className="empty">Sem veiculação no período.</div> : (
        <div className="platform-split">
          <Donut key={metric} items={sorted} metric={metric} total={total} currency={data.currency} />
          <div className="platform-list">
            {sorted.map((p, i) => (
              <motion.div key={p.key} className="platform-row tilt" data-tilt="3" initial={{ opacity: 0, x: 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 * i, ease: EASE_OUT }}>
                <BrandBadge name={p.key} size={32} />
                <div className="platform-info">
                  <div className="platform-name">
                    <strong>{publisherLabel(p.key)}</strong>
                    {best?.key === p.key && <span className="tag good">menor custo</span>}
                  </div>
                  <div className="platform-bar"><motion.i style={{ background: PLATFORM_COLOR[p.key] }} initial={{ scaleX: 0 }} whileInView={{ scaleX: share(p[metric], total) }} viewport={{ once: true }} transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 + 0.1 * i }} /></div>
                  <small>{fmtInt(p.conversations)} conversas · {p.costPerConversation ? `${fmtMoney(p.costPerConversation, data.currency)}/conv.` : 'sem conversas'}</small>
                </div>
                <span className="platform-pct">{fmtPct(share(p[metric], total) * 100, 0)}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------- Posicionamentos

export function PlacementBars({ data }) {
  const [metric, setMetric] = useState('conversations');
  const rows = (data?.positions || []).filter((p) => p.conversations > 0 || p.spend > 1).sort((a, b) => b[metric] - a[metric]).slice(0, 8);
  const max = Math.max(...rows.map((r) => r[metric]), 1);
  const best = rows.filter((p, _, list) => p.conversations >= minConv(list)).sort((a, b) => a.costPerConversation - b.costPerConversation)[0];
  return (
    <motion.div variants={rise} className="card chart-card spotlight" onMouseMove={trackSpotlight}>
      <div className="chart-head">
        <div>
          <div className="chart-title">Posicionamentos que mais trazem conversa</div>
          <div className="chart-sub">Feed, Stories, Reels e Status — os 8 maiores</div>
        </div>
        <Segmented size="sm" options={[['conversations', 'Conversas'], ['spend', 'Investimento']]} value={metric} onChange={setMetric} label="Métrica" />
      </div>
      {rows.length === 0 ? <div className="empty">Sem veiculação no período.</div> : (
        <div className="placements">
          {rows.map((p, i) => (
            <div key={p.key} className="placement-row" title={`${platformLabel(p.platform)} · ${positionLabel(p.position)}\n${fmtMoney(p.spend, data.currency)} · CTR ${fmtPct(p.linkCtr, 2)} · CPM ${fmtMoney(p.cpm, data.currency)}`}>
              <span className="placement-name"><BrandLogo name={p.platform} size={16} /> {positionLabel(p.position)}</span>
              <div className="placement-track">
                <motion.i
                  key={metric}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${(p[metric] / max) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.05 * i }}
                />
              </div>
              <span className="placement-value">{metric === 'spend' ? fmtMoney(p.spend, data.currency) : fmtInt(p.conversations)}</span>
              <span className={`placement-cost ${best?.key === p.key ? 'best' : ''}`}>{p.costPerConversation ? fmtMoney(p.costPerConversation, data.currency) : '—'}</span>
            </div>
          ))}
          <div className="placement-foot"><span /> <span /> <span>{metric === 'spend' ? 'investido' : 'conversas'}</span><span>custo/conv.</span></div>
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------- Idade × gênero

const AGES = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

export function AgeGender({ data }) {
  const rows = useMemo(() => {
    const by = new Map();
    for (const d of data?.demographics || []) {
      const r = by.get(d.age) || { age: d.age, male: 0, female: 0, spend: 0, conv: 0 };
      if (d.gender === 'male') r.male += d.conversations;
      if (d.gender === 'female') r.female += d.conversations;
      r.spend += d.spend;
      r.conv += d.conversations;
      by.set(d.age, r);
    }
    return AGES.map((a) => by.get(a)).filter((r) => r && (r.spend > 0.5 || r.conv > 0));
  }, [data]);
  const max = Math.max(...rows.flatMap((r) => [r.male, r.female]), 1);
  const totalM = rows.reduce((s, r) => s + r.male, 0);
  const totalF = rows.reduce((s, r) => s + r.female, 0);
  const top = [...rows].sort((a, b) => b.conv - a.conv)[0];
  return (
    <motion.div variants={rise} className="card chart-card spotlight" onMouseMove={trackSpotlight}>
      <div className="chart-title">Quem conversa: idade × gênero</div>
      <div className="chart-sub">
        <span className="legend-key"><i className="cat-male" /> Homens · {fmtInt(totalM)}</span>
        <span className="legend-key"><i className="cat-female" /> Mulheres · {fmtInt(totalF)}</span>
        {top && <span className="tag accent">pico: {top.age} anos</span>}
      </div>
      {rows.length === 0 ? <div className="empty">Sem dados demográficos no período.</div> : (
        <div className="pyramid">
          {rows.map((r, i) => (
            <div key={r.age} className="pyr-row" title={`${r.age} anos · ${fmtInt(r.conv)} conversas · ${r.conv ? fmtMoney(r.spend / r.conv, data.currency) : '—'}/conv.`}>
              <span className="pyr-val left">{fmtInt(r.male)}</span>
              <div className="pyr-side left"><motion.i className="cat-male" initial={{ width: 0 }} whileInView={{ width: `${(r.male / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.06 * i }} /></div>
              <span className="pyr-age">{r.age}</span>
              <div className="pyr-side"><motion.i className="cat-female" initial={{ width: 0 }} whileInView={{ width: `${(r.female / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.06 * i }} /></div>
              <span className="pyr-val">{fmtInt(r.female)}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------- Dia × hora

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HourHeatmap({ data }) {
  const [metric, setMetric] = useState('conversations');
  const [hover, setHover] = useState(null);
  const cells = useMemo(() => {
    const m = new Map((data?.heat || []).map((h) => [`${h.dow}:${h.hour}`, h]));
    return DOW_ORDER.map((dow) => Array.from({ length: 24 }, (_, hour) => m.get(`${dow}:${hour}`) || { dow, hour, conversations: 0, spend: 0 }));
  }, [data]);
  const flat = cells.flat();
  const max = Math.max(...flat.map((c) => c[metric]), 1);
  const byHour = Array.from({ length: 24 }, (_, h) => flat.filter((c) => c.hour === h).reduce((s, c) => s + c[metric], 0));
  const maxHour = Math.max(...byHour, 1);
  // Janela de 3 horas com mais conversas (sugestão de programação).
  let bestStart = 0;
  let bestSum = -1;
  for (let h = 0; h < 24; h++) {
    const sum = byHour[h] + byHour[(h + 1) % 24] + byHour[(h + 2) % 24];
    if (sum > bestSum) { bestSum = sum; bestStart = h; }
  }
  const peak = flat.reduce((a, b) => (b[metric] > a[metric] ? b : a), flat[0] || {});
  const fmt = (v) => (metric === 'spend' ? fmtMoney(v, data?.currency) : fmtInt(v));
  return (
    <motion.div variants={rise} className="card chart-card heat-card">
      <div className="chart-head">
        <div>
          <div className="chart-title">Quando as conversas acontecem</div>
          <div className="chart-sub">
            Dia da semana × hora (fuso da conta)
            {bestSum > 0 && <span className="tag accent">melhor janela: {bestStart}h–{(bestStart + 3) % 24}h</span>}
            {peak?.[metric] > 0 && <span className="tag">pico: {DOW[peak.dow]} {peak.hour}h</span>}
          </div>
        </div>
        <Segmented size="sm" options={[['conversations', 'Conversas'], ['spend', 'Investimento']]} value={metric} onChange={setMetric} label="Métrica" />
      </div>
      <div className="heat" onMouseLeave={() => setHover(null)}>
        <div className="heat-hours">
          <span />
          {byHour.map((v, h) => (
            <div key={h} className={`heat-hbar ${h >= bestStart && h < bestStart + 3 ? 'best' : ''}`} title={`${h}h · ${fmt(v)}`}>
              <motion.i initial={{ scaleY: 0 }} whileInView={{ scaleY: v / maxHour }} viewport={{ once: true }} transition={{ duration: 0.7, ease: EASE_OUT, delay: h * 0.02 }} />
            </div>
          ))}
        </div>
        {cells.map((row, r) => (
          <div key={DOW_ORDER[r]} className="heat-row">
            <span className="heat-dow">{DOW[DOW_ORDER[r]]}</span>
            {row.map((c) => {
              const t = c[metric] / max;
              return (
                <motion.button
                  type="button"
                  key={c.hour}
                  className="heat-cell"
                  style={{ '--t': t }}
                  initial={{ opacity: 0, scale: 0.4 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: c.hour * 0.015 + r * 0.03 }}
                  onMouseEnter={(e) => setHover({ c, x: e.currentTarget.offsetLeft, y: e.currentTarget.offsetTop })}
                  aria-label={`${DOW[c.dow]} ${c.hour}h: ${fmt(c[metric])}`}
                />
              );
            })}
          </div>
        ))}
        <div className="heat-axis">
          <span />
          {Array.from({ length: 24 }, (_, h) => <span key={h}>{h % 3 === 0 ? `${h}h` : ''}</span>)}
        </div>
        {hover && (
          <div className="tooltip heat-tip" style={{ left: hover.x, top: hover.y }}>
            <div className="tooltip-title">{DOW[hover.c.dow]} · {hover.c.hour}h–{hover.c.hour + 1}h</div>
            <div className="tooltip-row"><span>Conversas</span><strong>{fmtInt(hover.c.conversations)}</strong></div>
            <div className="tooltip-row"><span>Investimento</span><strong>{fmtMoney(hover.c.spend, data.currency)}</strong></div>
            {hover.c.costPerConversation && <div className="tooltip-row"><span>Custo/conv.</span><strong>{fmtMoney(hover.c.costPerConversation, data.currency)}</strong></div>}
          </div>
        )}
        <div className="heat-legend"><span>menos</span><i /><span>mais</span></div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- Dispositivos

const DEVICE = {
  iphone: { label: 'iPhone', icon: siApple },
  ipad: { label: 'iPad', icon: siApple },
  android_smartphone: { label: 'Android', icon: siAndroid },
  android_tablet: { label: 'Tablet Android', icon: siAndroid },
  desktop: { label: 'Computador', icon: null },
  other: { label: 'Outros', icon: null },
};

export function DeviceSplit({ data }) {
  const items = (data?.devices || []).filter((d) => d.conversations > 0 || d.spend > 1).sort((a, b) => b.conversations - a.conversations);
  const total = items.reduce((s, d) => s + d.conversations, 0);
  return (
    <motion.div variants={rise} className="card chart-card spotlight" onMouseMove={trackSpotlight}>
      <div className="chart-title">No celular de quem?</div>
      <div className="chart-sub">Conversas por dispositivo</div>
      {items.length === 0 ? <div className="empty">Sem dados no período.</div> : (
        <div className="devices">
          {items.slice(0, 4).map((d, i) => {
            const meta = DEVICE[d.key] || { label: d.key, icon: null };
            return (
              <motion.div key={d.key} className="device tilt" data-tilt="4" initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <span className="device-ic">{meta.icon ? <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={meta.icon.path} fill="currentColor" /></svg> : <span className="mono">PC</span>}</span>
                <div>
                  <strong><CountUp value={share(d.conversations, total) * 100} format={(v) => (v > 0 && v < 1 ? '<1%' : fmtPct(v, 0))} /></strong>
                  <small>{meta.label} · {fmtInt(d.conversations)} conv.{d.costPerConversation ? ` · ${fmtMoney(d.costPerConversation, data.currency)}` : ''}</small>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------- Seção completa

export function useBreakdowns(scope) {
  const { query } = useRange();
  return useApi(`/api/meta/breakdowns?scope=${encodeURIComponent(scope)}&${query}`);
}

/** Bloco pronto para as páginas: funil + plataformas, posicionamentos + público, horários + dispositivos. */
export function ResultsAnatomy({ breakdown, metrics, currency }) {
  const { data, error } = breakdown;
  const skeleton = (h) => <div className="skeleton" style={{ height: h }} />;
  return (
    <>
      <section className="section">
        <div className="section-head">
          <div>
            <h2><BrandLogo name="meta" size={18} /> Anatomia dos resultados</h2>
            <p>Do primeiro olhar no anúncio até a conversa no WhatsApp — e onde, para quem e quando isso acontece.</p>
          </div>
          {data?.partial && <span className="tag warning">algumas contas não responderam</span>}
        </div>
        {error && <div className="notice critical">Não foi possível carregar os recortes: {error.message}</div>}
        <motion.div className="grid-2" variants={stagger(0.08)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }}>
          {metrics ? <MessagingFunnel metrics={metrics} currency={currency} /> : skeleton(360)}
          {data ? <PlatformSplit data={data} /> : skeleton(360)}
        </motion.div>
      </section>
      <section className="section">
        <motion.div className="grid-2" variants={stagger(0.08)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }}>
          {data ? <PlacementBars data={data} /> : skeleton(360)}
          {data ? <AgeGender data={data} /> : skeleton(360)}
        </motion.div>
      </section>
      <section className="section">
        <motion.div className="grid-heat" variants={stagger(0.08)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }}>
          {data ? <HourHeatmap data={data} /> : skeleton(320)}
          {data ? <DeviceSplit data={data} /> : skeleton(320)}
        </motion.div>
      </section>
    </>
  );
}

export { PLATFORMS };
