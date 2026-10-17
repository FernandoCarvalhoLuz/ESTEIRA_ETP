// Diagrama vivo do tráfego pago: Meta Ads → plataformas → anúncio → conversa no WhatsApp.
// Partículas douradas percorrem os caminhos; a quantidade em cada ramo acompanha o volume da plataforma.
import { motion } from 'motion/react';
import { fmtCompact, fmtInt, fmtMoney } from '../lib/format.js';
import { EASE_OUT } from '../lib/motion.js';
import { BrandBadge, BrandLogo, publisherLabel } from './Brands.jsx';
import { Logo } from './Icons.jsx';
import { CountUp } from './Breakdowns.jsx';

const W = 1000;
const H = 240;
const X = { meta: 110, plat: 330, ad: 680, wa: 900 };
const MID = H / 2;

const curve = (x1, y1, x2, y2) => {
  const dx = (x2 - x1) * 0.55;
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
};

function Particles({ path, count, dur, color = '#FFD65C' }) {
  return Array.from({ length: count }, (_, i) => (
    <circle key={i} r="3.2" fill={color} className="flow-dot">
      <animateMotion dur={`${dur}s`} begin={`${(i * dur) / count}s`} repeatCount="indefinite" path={path} />
    </circle>
  ));
}

export function TrafficFlow({ metrics, breakdown, currency }) {
  const plats = (breakdown?.platforms || [])
    .filter((p) => p.spend > 0.5 && p.key !== 'audience_network')
    .sort((a, b) => b.conversations - a.conversations)
    .slice(0, 3);
  const list = plats.length ? plats : [{ key: 'facebook' }, { key: 'instagram' }];
  const totalConv = list.reduce((s, p) => s + (p.conversations || 0), 0);
  const ys = list.length === 1 ? [MID] : list.length === 2 ? [MID - 52, MID + 52] : [MID - 78, MID, MID + 78];

  return (
    <motion.div className="card flow-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_OUT }}>
      <span className="gold-ring" aria-hidden="true" />
      <div className="flow-head">
        <div>
          <div className="eyebrow">Fluxo do tráfego</div>
          <strong>Do investimento na Meta até a conversa no WhatsApp</strong>
        </div>
        <span className="flow-live"><span className="dot good pulse" /> período selecionado</span>
      </div>
      <div className="flow-stage">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="flow-svg" aria-hidden="true">
          <defs>
            <linearGradient id="flow-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#0467DF" stopOpacity="0.7" />
              <stop offset="0.5" stopColor="#F7C21B" stopOpacity="0.8" />
              <stop offset="1" stopColor="#25D366" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          {list.map((p, i) => {
            const a = curve(X.meta + 40, MID, X.plat - 26, ys[i]);
            const b = curve(X.plat + 170, ys[i], X.ad - 40, MID);
            const n = totalConv > 0 ? 1 + Math.round((p.conversations / totalConv) * 4) : 2;
            return (
              <g key={p.key}>
                <path d={a} className="flow-path" />
                <path d={b} className="flow-path" />
                <Particles path={a} count={n} dur={2.6} color="#7fb2ff" />
                <Particles path={b} count={n} dur={2.2} />
              </g>
            );
          })}
          <path d={curve(X.ad + 40, MID, X.wa - 40, MID)} className="flow-path strong" />
          <Particles path={curve(X.ad + 40, MID, X.wa - 40, MID)} count={4} dur={1.6} color="#5cf59a" />
        </svg>

        <div className="flow-node" style={{ left: `${(X.meta / W) * 100}%`, top: MID }}>
          <motion.span className="flow-orb meta tilt" data-tilt="14" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}>
            <BrandLogo name="meta" size={34} />
          </motion.span>
          <div className="flow-label"><strong><CountUp value={metrics?.spend} format={(v) => fmtMoney(v, currency)} /></strong><small>investidos na Meta Ads</small></div>
        </div>

        {list.map((p, i) => (
          <div key={p.key} className="flow-node small" style={{ left: `${(X.plat / W) * 100}%`, top: ys[i] }}>
            <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.25 + i * 0.1 }}>
              <BrandBadge name={p.key} size={44} className="float" />
            </motion.span>
            <div className="flow-label side"><strong>{publisherLabel(p.key)}</strong><small>{p.impressions != null ? `${fmtCompact(p.impressions)} impr. · ${fmtInt(p.conversations)} conv.` : '—'}</small></div>
          </div>
        ))}

        <div className="flow-node" style={{ left: `${(X.ad / W) * 100}%`, top: MID }}>
          <motion.span className="flow-orb ad tilt" data-tilt="14" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.5 }}>
            <Logo className="flow-etp" tile={false} live />
          </motion.span>
          <div className="flow-label"><strong><CountUp value={metrics?.linkClicks} /></strong><small>cliques no anúncio</small></div>
        </div>

        <div className="flow-node" style={{ left: `${(X.wa / W) * 100}%`, top: MID }}>
          <motion.span className="flow-orb wa tilt" data-tilt="14" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.65 }}>
            <BrandLogo name="whatsapp" size={34} />
            <span className="flow-ping" />
          </motion.span>
          <div className="flow-label"><strong><CountUp value={metrics?.conversations} /></strong><small>conversas no WhatsApp</small></div>
        </div>
      </div>
    </motion.div>
  );
}
