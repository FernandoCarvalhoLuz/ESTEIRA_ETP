// Elementos de marca e movimento reaproveitados pelas páginas: órbita de redes sociais, ticker de contas,
// faixa "publica em", esteira com itens andando e o feixe de conexão ETP ⟷ Meta.
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { fmtMoney, fmtPct, percentChange } from '../lib/format.js';
import { BrandBadge, BrandLogo } from './Brands.jsx';
import { Logo } from './Icons.jsx';

const ORBIT = ['meta', 'facebook', 'instagram', 'whatsapp', 'messenger'];

/** Logos das redes girando em volta de um centro (o símbolo ETP, um ícone…). */
export function SocialOrbit({ size = 220, children, items = ORBIT, badge = 40 }) {
  const r = size / 2 - badge / 2 - 4;
  return (
    <div className="orbit" style={{ width: size, height: size }}>
      <div className="orbit-ring" />
      <div className="orbit-ring inner" />
      <div className="orbit-spin" style={{ '--orbit-dur': '38s' }}>
        {items.map((name, i) => {
          const a = (i / items.length) * Math.PI * 2;
          return (
            <motion.span
              key={name}
              className="orbit-item"
              style={{ left: size / 2 + Math.cos(a) * r - badge / 2, top: size / 2 + Math.sin(a) * r - badge / 2 }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.3 + i * 0.08 }}
            >
              <span className="orbit-counter"><BrandBadge name={name} size={badge} /></span>
            </motion.span>
          );
        })}
      </div>
      <div className="orbit-center">{children}</div>
    </div>
  );
}

/** Ticker estilo bolsa: custo por conversa de cada conta e a variação contra o período anterior. */
export function MetricTicker({ accounts, currency, linkTo }) {
  const items = (accounts || [])
    .filter((a) => a.currency === currency && a.current?.conversations > 0)
    .map((a) => ({ id: a.id, name: a.name.replace(/^\[[^\]]+\]\s*/, ''), cost: a.current.costPerConversation, change: percentChange(a.current.costPerConversation, a.previous?.costPerConversation) }));
  if (items.length < 2) return null;
  const row = items.map((it) => {
    const tone = it.change == null || Math.abs(it.change) < 0.5 ? '' : it.change < 0 ? 'good' : 'bad';
    return (
      <Link key={it.id} to={linkTo(it.id)} className="tick">
        <span className="tick-name">{it.name}</span>
        <span className="tick-val">{fmtMoney(it.cost, currency)}</span>
        {it.change != null && <span className={`tick-chg ${tone}`}>{it.change < 0 ? '▼' : '▲'} {fmtPct(Math.abs(it.change), 1)}</span>}
      </Link>
    );
  });
  return (
    <div className="ticker" aria-label="Custo por conversa por conta">
      <span className="ticker-label"><BrandLogo name="meta" size={14} /> custo/conversa</span>
      <div className="ticker-track" style={{ '--ticker-dur': `${Math.max(30, items.length * 6)}s` }}>
        <div className="ticker-row">{row}</div>
        <div className="ticker-row" aria-hidden="true">{row}</div>
      </div>
    </div>
  );
}

/** "Publica em": as plataformas onde a esteira coloca os anúncios e o destino WhatsApp. */
export function PlatformStrip({ label = 'Publica em' }) {
  return (
    <span className="plat-strip">
      <span className="plat-strip-label">{label}</span>
      {['facebook', 'instagram', 'messenger'].map((n, i) => (
        <motion.span key={n} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }}><BrandLogo name={n} size={16} title={n} /></motion.span>
      ))}
      <span className="plat-strip-arrow">→</span>
      <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, type: 'spring' }}><BrandLogo name="whatsapp" size={16} title="WhatsApp" /></motion.span>
      <span className="plat-strip-label">conversas</span>
    </span>
  );
}

/** Esteira com logos "passando" por cima (anúncios saindo da linha de montagem). */
export function BeltRiders({ moving }) {
  const riders = ['facebook', 'instagram', 'whatsapp', 'meta', 'instagram', 'facebook'];
  return (
    <div className={`belt-wrap ${moving ? 'fast' : ''}`} aria-hidden="true">
      <div className={`belt ${moving ? 'moving' : 'moving slow'}`} />
      <div className="belt-riders">
        {riders.map((n, i) => (
          <span key={i} className="rider-item" style={{ '--i': i, '--n': riders.length }}><BrandBadge name={n} size={26} /></span>
        ))}
      </div>
    </div>
  );
}

/** Feixe animado entre o símbolo ETP e a Meta (estado da conexão). */
export function ConnectionBeam({ ok }) {
  return (
    <div className={`conn-beam ${ok ? 'ok' : 'off'}`}>
      <span className="conn-node"><Logo live={ok} /></span>
      <span className="conn-line"><i /><i /><i /></span>
      <span className="conn-node meta"><BrandLogo name="meta" size={28} /></span>
      <span className="conn-line"><i /><i /><i /></span>
      <span className="conn-node fbig">
        <BrandLogo name="facebook" size={18} />
        <BrandLogo name="instagram" size={18} />
        <BrandLogo name="whatsapp" size={18} />
      </span>
    </div>
  );
}
