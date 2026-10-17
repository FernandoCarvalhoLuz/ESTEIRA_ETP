import { useId } from 'react';
import { motion } from 'motion/react';
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fmtCompact, fmtDateShort, fmtDateWeekday, fmtInt, fmtMoney } from '../lib/format.js';
import { rise, stagger, trackSpotlight } from '../lib/motion.js';

const AXIS = { stroke: 'var(--baseline)', tick: { fill: 'var(--muted)', fontSize: 11 }, tickLine: false };
const ANIM = { animationDuration: 700, animationEasing: 'ease-out' };

function DailyTooltip({ active, payload, label, valueFormat, name }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const value = row[payload[0].dataKey];
  return (
    <div className="tooltip">
      <div className="tooltip-title">{fmtDateWeekday(label)}</div>
      <div className="tooltip-row">
        <span><span className="swatch" />{name}</span>
        <strong>{value == null ? 'sem conversas' : valueFormat(value)}</strong>
      </div>
      {row.prevDate && (
        <div className="tooltip-row">
          <span><span className="swatch prev" />{fmtDateShort(row.prevDate)} (anterior)</span>
          <strong>{row.prevCost == null ? '—' : valueFormat(row.prevCost)}</strong>
        </div>
      )}
    </div>
  );
}

function BarPanel({ title, subtitle, data, dataKey, valueFormat }) {
  const gid = useId().replace(/:/g, '');
  return (
    <motion.div variants={rise} className="card chart-card spotlight" onMouseMove={trackSpotlight}>
      <div className="chart-title">{title}</div>
      <div className="chart-sub">{subtitle}</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} syncId="daily" margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <defs>
            <linearGradient id={`bar-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent-2)" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="date" tickFormatter={fmtDateShort} minTickGap={18} {...AXIS} />
          <YAxis tickFormatter={fmtCompact} width={48} tickCount={4} axisLine={false} {...AXIS} />
          <Tooltip cursor={{ fill: 'var(--accent-wash)' }} content={<DailyTooltip valueFormat={valueFormat} name={title} />} />
          <Bar dataKey={dataKey} fill={`url(#bar-${gid})`} radius={[4, 4, 0, 0]} maxBarSize={24} {...ANIM} />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

function CostPanel({ data, currency, total }) {
  const gid = useId().replace(/:/g, '');
  const money = (v) => fmtMoney(v, currency);
  const hasPrev = data.some((d) => d.prevCost != null);
  return (
    <motion.div variants={rise} className="card chart-card spotlight" onMouseMove={trackSpotlight}>
      <div className="chart-title">Custo por conversa por dia</div>
      <div className="chart-sub">
        <span>No período: {money(total)}</span>
        <span className="legend-key"><i /> Atual</span>
        {hasPrev && <span className="legend-key"><i className="prev" /> Período anterior</span>}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} syncId="daily" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--series-1)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--series-1)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="date" scale="band" tickFormatter={fmtDateShort} minTickGap={18} {...AXIS} />
          <YAxis tickFormatter={fmtCompact} width={48} tickCount={4} axisLine={false} {...AXIS} />
          <Tooltip cursor={{ stroke: 'var(--baseline)' }} content={<DailyTooltip valueFormat={money} name="Custo/conversa" />} />
          {hasPrev && (
            <Line dataKey="prevCost" stroke="var(--series-prev)" strokeWidth={1.5} dot={false} activeDot={false} connectNulls={false} {...ANIM} />
          )}
          <Area
            dataKey="costPerConversation"
            stroke="var(--series-1)"
            strokeWidth={2}
            fill={`url(#area-${gid})`}
            dot={false}
            activeDot={{ r: 4.5, fill: 'var(--series-1)', stroke: 'var(--surface)', strokeWidth: 2 }}
            connectNulls={false}
            {...ANIM}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

/** Três painéis com o mesmo eixo de datas (um por medida, sem eixo duplo), hover sincronizado. */
export function DailyCharts({ daily, previousDaily, totals, currency }) {
  if (!daily || daily.length < 2) return null;
  const money = (v) => fmtMoney(v, currency);
  const days = daily.length;
  const data = daily.map((d, i) => ({
    ...d,
    prevCost: previousDaily?.[i]?.costPerConversation ?? null,
    prevDate: previousDaily?.[i]?.date ?? null,
  }));
  return (
    <motion.div className="charts" variants={stagger(0.08)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
      <BarPanel title="Investimento por dia" subtitle={`Média de ${money(totals.spend / days)} por dia`} data={data} dataKey="spend" valueFormat={money} />
      <BarPanel title="Conversas iniciadas por dia" subtitle={`Média de ${fmtInt(totals.conversations / days)} por dia`} data={data} dataKey="conversations" valueFormat={fmtInt} />
      <CostPanel data={data} currency={currency} total={totals.costPerConversation} />
    </motion.div>
  );
}
