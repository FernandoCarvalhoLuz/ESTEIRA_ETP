import { motion } from 'motion/react';
import { DEVICE_PRESETS, LOCATION_TYPES, PLACEMENTS, parseDevices, parseGeo } from '../../../shared/esteira.js';
import { fmtInt, fmtMoney } from '../lib/format.js';
import { rise, stagger } from '../lib/motion.js';
import { Status, StatusToggle } from './Common.jsx';
import { PinIcon, TargetIcon, UsersIcon } from './Icons.jsx';

const GENDER = { 1: 'Homens', 2: 'Mulheres' };

function deviceInfo(dev) {
  if (dev.include.length) {
    const preset = DEVICE_PRESETS.find((p) => p.devices.length === dev.include.length && p.devices.every((d) => dev.include.includes(d)));
    const iphone = dev.include.every((d) => /^(iphone|ipad)/i.test(d));
    return { label: preset?.label || `${dev.include.length} aparelho(s)${iphone ? ' iPhone' : ''}`, kind: iphone ? 'iphone' : 'devices', detail: dev.include.join(', ') };
  }
  if (dev.os === 'iOS') return { label: `Somente iOS${dev.osMin ? ` ${dev.osMin}+` : ''}`, kind: 'iphone' };
  if (dev.os === 'Android') return { label: `Somente Android${dev.osMin ? ` ${dev.osMin}+` : ''}`, kind: 'android' };
  if (dev.platforms[0] === 'mobile') return { label: 'Somente celular', kind: 'mobile' };
  if (dev.platforms[0] === 'desktop') return { label: 'Somente computador', kind: 'desktop' };
  return { label: 'Todos os dispositivos', kind: 'all' };
}

/** Resumo legível do público de um conjunto a partir do targeting da Meta. */
export function audienceOf(targeting) {
  const t = targeting || {};
  const flex = t.flexible_spec || [];
  const detailed = flex.flatMap((g) => Object.entries(g).flatMap(([kind, items]) => (Array.isArray(items) ? items.map((i) => ({ kind, name: i.name || i.id })) : [])));
  const placements = t.publisher_platforms?.length
    ? [...(t.facebook_positions || []).map((p) => `facebook:${p}`), ...(t.instagram_positions || []).map((p) => `instagram:${p}`)].map((k) => PLACEMENTS.find((p) => p.key === k)?.label || k.split(':')[1])
    : null;
  return {
    locations: parseGeo(t).locations,
    ageMin: t.age_min || 18,
    ageMax: t.age_max || 65,
    genders: (t.genders || []).map((g) => GENDER[g]).filter(Boolean),
    interests: detailed.filter((d) => d.kind === 'interests').map((d) => d.name),
    otherDetailed: detailed.filter((d) => d.kind !== 'interests').map((d) => d.name),
    customIn: (t.custom_audiences || []).map((a) => a.name || a.id),
    customOut: (t.excluded_custom_audiences || []).map((a) => a.name || a.id),
    device: deviceInfo(parseDevices(t)),
    advantage: t.targeting_automation?.advantage_audience === 1,
    placements,
  };
}

const ageLabel = (a) => `${a.ageMin}–${a.ageMax}${a.ageMax >= 65 ? '+' : ''}`;
const locLabel = (l) => `${l.name}${l.radius ? ` +${l.radius} km` : ''}`;

export const EMPTY_FILTERS = { location: '', age: '', interest: '', device: '', custom: '' };

/** Opções dos filtros a partir dos conjuntos da campanha. */
export function filterOptions(adsets) {
  const loc = new Map();
  const ages = new Set();
  const interests = new Set();
  const devices = new Map();
  const customs = new Set();
  for (const a of adsets) {
    const au = audienceOf(a.targeting);
    for (const l of au.locations.filter((x) => !x.excluded)) loc.set(`${l.type}:${l.key}`, `${l.name} (${LOCATION_TYPES[l.type]?.label || l.type})`);
    ages.add(ageLabel(au));
    au.interests.forEach((i) => interests.add(i));
    devices.set(au.device.kind, au.device.kind === 'iphone' ? 'iPhone / iOS' : au.device.label);
    au.customIn.forEach((c) => customs.add(c));
  }
  return {
    location: [...loc.entries()].sort((x, y) => x[1].localeCompare(y[1])),
    age: [...ages].sort().map((v) => [v, `${v} anos`]),
    interest: [['__with', 'Com interesses'], ['__without', 'Sem interesses'], ...[...interests].sort().map((v) => [v, v])],
    device: [...devices.entries()],
    custom: [['__with', 'Com público personalizado'], ['__without', 'Sem público personalizado'], ...[...customs].sort().map((v) => [v, v])],
  };
}

export function matchesFilters(adset, f) {
  const au = audienceOf(adset.targeting);
  if (f.location && !au.locations.some((l) => !l.excluded && `${l.type}:${l.key}` === f.location)) return false;
  if (f.age && ageLabel(au) !== f.age) return false;
  if (f.interest === '__with' && !au.interests.length) return false;
  if (f.interest === '__without' && au.interests.length) return false;
  if (f.interest && !f.interest.startsWith('__') && !au.interests.includes(f.interest)) return false;
  if (f.device && au.device.kind !== f.device) return false;
  if (f.custom === '__with' && !au.customIn.length) return false;
  if (f.custom === '__without' && au.customIn.length) return false;
  if (f.custom && !f.custom.startsWith('__') && !au.customIn.includes(f.custom)) return false;
  return true;
}

const FILTER_LABELS = [['location', 'Localização'], ['age', 'Idade'], ['interest', 'Interesse'], ['device', 'Dispositivo'], ['custom', 'Público personalizado']];

export function AudienceFilters({ adsets, filters, onChange }) {
  const opts = filterOptions(adsets);
  const active = Object.values(filters).filter(Boolean).length;
  return (
    <div className="aud-filters">
      {FILTER_LABELS.map(([key, label]) => (
        <label key={key} className={`aud-filter ${filters[key] ? 'on' : ''}`}>
          <span>{label}</span>
          <select value={filters[key]} onChange={(e) => onChange({ ...filters, [key]: e.target.value })} aria-label={`Filtrar por ${label.toLowerCase()}`}>
            <option value="">Todos</option>
            {opts[key].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      ))}
      {active > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(EMPTY_FILTERS)}>Limpar filtros ({active})</button>}
    </div>
  );
}

function Row({ label, children }) {
  return <div className="aud-row"><span className="aud-k">{label}</span><span className="aud-v">{children}</span></div>;
}

function Chips({ items, tone, max = 6 }) {
  if (!items.length) return <span className="muted">—</span>;
  return (
    <>
      {items.slice(0, max).map((i) => <span key={i} className={`tag ${tone || ''}`}>{i}</span>)}
      {items.length > max && <span className="tag" title={items.slice(max).join(', ')}>+{items.length - max}</span>}
    </>
  );
}

/** Cartões com o público de cada conjunto (localização, idade, interesses, dispositivos, públicos personalizados). */
export function AudienceCards({ adsets, currency, onStatusChanged, highlight }) {
  if (!adsets.length) return <div className="empty">Nenhum conjunto com esses filtros.</div>;
  return (
    <motion.div className="aud-grid" variants={stagger(0.04)} initial="hidden" animate="show">
      {adsets.map((a) => {
        const au = audienceOf(a.targeting);
        const m = a.metrics;
        return (
          <motion.div key={a.id} variants={rise} className={`card aud-card ${highlight === a.id ? 'hl' : ''}`}>
            <div className="aud-head">
              <StatusToggle id={a.id} status={a.status} kind="adset" onChanged={onStatusChanged} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="aud-name" title={a.name}>{a.name}</div>
                <Status value={a.effectiveStatus} />
              </div>
              <div className="aud-metric">
                <strong>{m.costPerConversation != null ? fmtMoney(m.costPerConversation, currency) : '—'}</strong>
                <span>{fmtInt(m.conversations)} conversas</span>
              </div>
            </div>
            {!a.targeting ? <div className="hint">Público indisponível.</div> : (
              <div className="aud-body">
                <Row label={<><PinIcon /> Localização</>}>
                  <Chips items={au.locations.filter((l) => !l.excluded).map(locLabel)} max={4} />
                  {au.locations.some((l) => l.excluded) && <Chips items={au.locations.filter((l) => l.excluded).map((l) => `exceto ${l.name}`)} tone="critical" max={2} />}
                </Row>
                <Row label="Idade e gênero"><span className="tag">{ageLabel(au)} anos</span>{au.genders.map((g) => <span key={g} className="tag">{g}</span>)}{au.advantage && <span className="tag accent">Advantage+</span>}</Row>
                <Row label={<><TargetIcon /> Interesses</>}><Chips items={[...au.interests, ...au.otherDetailed]} /></Row>
                <Row label={<><UsersIcon /> Públicos</>}>
                  <Chips items={au.customIn} tone="good" max={3} />
                  {au.customOut.length > 0 && <Chips items={au.customOut.map((c) => `exceto ${c}`)} tone="critical" max={2} />}
                </Row>
                <Row label="Dispositivos"><span className={`tag ${au.device.kind === 'all' ? '' : 'accent'}`} title={au.device.detail}>{au.device.label}</span></Row>
                <Row label="Posicionamentos">{au.placements ? <Chips items={au.placements} max={3} /> : <span className="tag">Advantage+</span>}</Row>
              </div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
