import { useMemo } from 'react';
import { motion } from 'motion/react';
import { fmtInt, fmtMoney } from '../lib/format.js';
import { EASE_OUT } from '../lib/motion.js';

/**
 * Matriz criativo × conjunto: para cada anúncio (agrupado pelo nome, já que o mesmo criativo roda em vários conjuntos),
 * mostra o custo por conversa em cada conjunto e destaca o melhor.
 */
export function CreativeMatrix({ ads, adsets, currency }) {
  const { rows, columns } = useMemo(() => {
    const delivering = adsets.filter((s) => s.delivered);
    const groups = new Map();
    for (const ad of ads) {
      if (!ad.delivered) continue;
      const g = groups.get(ad.name) || { name: ad.name, thumbnail: ad.thumbnail, cells: {}, spend: 0, conversations: 0 };
      g.thumbnail ||= ad.thumbnail;
      const cell = g.cells[ad.adsetId] || { spend: 0, conversations: 0 };
      cell.spend += ad.metrics.spend;
      cell.conversations += ad.metrics.conversations;
      g.cells[ad.adsetId] = cell;
      g.spend += ad.metrics.spend;
      g.conversations += ad.metrics.conversations;
      groups.set(ad.name, g);
    }
    const list = [...groups.values()].map((g) => {
      let best = null;
      for (const [adsetId, c] of Object.entries(g.cells)) {
        c.cost = c.conversations > 0 ? c.spend / c.conversations : null;
        if (c.cost != null && (best == null || c.cost < g.cells[best].cost)) best = adsetId;
      }
      return { ...g, best, cost: g.conversations > 0 ? g.spend / g.conversations : null };
    });
    list.sort((a, b) => b.spend - a.spend);
    return { rows: list, columns: delivering };
  }, [ads, adsets]);

  if (rows.length === 0 || columns.length < 2) {
    return <div className="empty">A comparação aparece quando o mesmo anúncio roda em dois ou mais conjuntos com veiculação no período.</div>;
  }

  return (
    <div className="card matrix-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th>Anúncio</th>
            {columns.map((c) => <th key={c.id} title={c.name}>{c.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.name}>
              <td>
                <div className="ad-cell">
                  {r.thumbnail ? <img className="thumb" src={r.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="thumb" />}
                  <div>
                    <div className="row-name">{r.name}</div>
                    <div className="row-meta">{fmtMoney(r.cost, currency)}/conversa no total · {fmtInt(r.conversations)} conv.</div>
                  </div>
                </div>
              </td>
              {columns.map((c, ci) => {
                const cell = r.cells[c.id];
                if (!cell) return <td key={c.id}><div className="mcell none">—</div></td>;
                const isBest = r.best === c.id && Object.keys(r.cells).length > 1;
                return (
                  <td key={c.id}>
                    <motion.div
                      className={`mcell ${isBest ? 'best' : ''}`}
                      initial={{ opacity: 0, scale: 0.94 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.35, ease: EASE_OUT, delay: Math.min(ri * 0.04 + ci * 0.03, 0.5) }}
                      title={`${fmtMoney(cell.spend, currency)} investidos`}
                    >
                      {isBest && <span className="best-tag">Melhor</span>}
                      <strong>{cell.cost != null ? fmtMoney(cell.cost, currency) : 'sem conv.'}</strong>
                      <span>{fmtInt(cell.conversations)} conv. · {fmtMoney(cell.spend, currency)}</span>
                    </motion.div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
