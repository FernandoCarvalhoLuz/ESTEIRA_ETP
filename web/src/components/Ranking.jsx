import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGroup, motion } from 'motion/react';
import { fmtMetric, fmtMoney, fmtPct, percentChange } from '../lib/format.js';
import { EASE_OUT, rise, spring, stagger } from '../lib/motion.js';
import { Segmented } from './Common.jsx';
import { AlertIcon, TrendDownIcon, TrendUpIcon, TrophyIcon } from './Icons.jsx';

const METRIC_OPTIONS = [
  ['costPerConversation', 'Custo/conversa'],
  ['conversations', 'Conversas'],
  ['spend', 'Investimento'],
  ['linkCtr', 'CTR'],
];
const ASCENDING = new Set(['costPerConversation']);

/** Ranking de contas: ao trocar a métrica, as linhas deslizam até a nova posição. */
export function AccountRanking({ accounts, currency, linkTo }) {
  const [metric, setMetric] = useState('costPerConversation');
  const rows = useMemo(() => {
    const list = accounts
      .filter((a) => a.current?.conversations > 0 && a.current[metric] != null)
      .map((a) => ({ id: a.id, name: a.name, value: a.current[metric] }));
    list.sort((x, y) => (ASCENDING.has(metric) ? x.value - y.value : y.value - x.value));
    return list;
  }, [accounts, metric]);
  const max = Math.max(...rows.map((r) => r.value), 0);

  return (
    <motion.div variants={rise} className="card ranking">
      <div className="ranking-head">
        <div>
          <div className="chart-title">Ranking de contas</div>
          <div className="chart-sub">{ASCENDING.has(metric) ? 'Do menor para o maior custo' : 'Do maior para o menor'} · contas com conversas no período</div>
        </div>
        <Segmented options={METRIC_OPTIONS} value={metric} onChange={setMetric} label="Métrica do ranking" size="sm" />
      </div>
      <LayoutGroup>
        <div className="rank-rows">
          {rows.map((r, i) => (
            <motion.div key={r.id} layout transition={spring}>
              <Link to={linkTo(r.id)} className="rank-row" title={r.name}>
                <span className={`rank-pos ${i < 3 ? `medal m${i + 1}` : ''}`}>{i + 1}</span>
                <span className="rank-name">{r.name}</span>
                <span className="rank-track">
                  <motion.span
                    className="rank-fill"
                    style={{ display: 'block' }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: max ? r.value / max : 0 }}
                    transition={{ duration: 0.7, ease: EASE_OUT, delay: Math.min(i, 8) * 0.03 }}
                  />
                </span>
                <span className="rank-value">{fmtMetric(metric, r.value, currency)}</span>
              </Link>
            </motion.div>
          ))}
          {rows.length === 0 && <div className="empty">Nenhuma conta com conversas no período.</div>}
        </div>
      </LayoutGroup>
    </motion.div>
  );
}

/** Destaques calculados automaticamente a partir das contas. */
export function Insights({ accounts, totals, currency, linkTo }) {
  const items = useMemo(() => {
    const active = accounts.filter((a) => a.currency === currency && a.current?.conversations >= 5);
    if (!active.length) return [];
    const byCost = [...active].sort((a, b) => a.current.costPerConversation - b.current.costPerConversation);
    const withChange = active
      .map((a) => ({ a, change: percentChange(a.current.costPerConversation, a.previous?.costPerConversation) }))
      .filter((x) => x.change != null);
    const improved = [...withChange].sort((x, y) => x.change - y.change)[0];
    const worsened = [...withChange].sort((x, y) => y.change - x.change)[0];
    const avg = totals.current.costPerConversation;
    const list = [
      {
        tone: 'good', icon: TrophyIcon, label: 'Mais eficiente', account: byCost[0],
        text: `${fmtMoney(byCost[0].current.costPerConversation, currency)} por conversa · ${fmtPct((1 - byCost[0].current.costPerConversation / avg) * 100, 0)} abaixo da média`,
      },
    ];
    if (improved && improved.change < -3) {
      list.push({ tone: 'good', icon: TrendDownIcon, label: 'Maior melhora', account: improved.a, text: `Custo por conversa caiu ${fmtPct(Math.abs(improved.change), 1)} vs. período anterior` });
    }
    if (worsened && worsened.change > 3) {
      list.push({ tone: 'bad', icon: TrendUpIcon, label: 'Atenção: custo subindo', account: worsened.a, text: `Custo por conversa subiu ${fmtPct(worsened.change, 1)} vs. período anterior` });
    }
    const worst = byCost[byCost.length - 1];
    if (worst && worst !== byCost[0] && worst.current.costPerConversation > avg * 1.25) {
      list.push({ tone: 'bad', icon: AlertIcon, label: 'Mais cara', account: worst, text: `${fmtMoney(worst.current.costPerConversation, currency)} por conversa · ${fmtPct((worst.current.costPerConversation / avg - 1) * 100, 0)} acima da média` });
    }
    return list;
  }, [accounts, totals, currency]);

  return (
    <motion.div variants={rise} className="card insights">
      <div>
        <div className="chart-title">Destaques do período</div>
        <div className="chart-sub">Gerados automaticamente a partir das contas</div>
      </div>
      <motion.div variants={stagger(0.08, 0.2)} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it) => (
          <motion.div key={it.label} variants={rise}>
            <Link to={linkTo(it.account.id)} className="insight">
              <span className={`insight-icon ${it.tone}`}><it.icon /></span>
              <span>
                <div className="insight-label">{it.label}</div>
                <div className="insight-title">{it.account.name}</div>
                <div className="insight-text">{it.text}</div>
              </span>
            </Link>
          </motion.div>
        ))}
        {items.length === 0 && <div className="empty">Sem dados suficientes no período.</div>}
      </motion.div>
    </motion.div>
  );
}
