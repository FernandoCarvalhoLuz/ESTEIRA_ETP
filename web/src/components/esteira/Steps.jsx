import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import {
  BID_STRATEGIES, DEVICE_PRESETS, LOCATION_AUDIENCES, LOCATION_TYPES, OBJECTIVES, PERFORMANCE_GOALS, PLACEMENTS, STEPS,
  adsForAdset, applyPlaceholders, campaignName, fmtPrice, leftoverMentions, newAd, newAdset, newConfig, objectiveOf, retargetConfig, rid, totalAds,
} from '../../../../shared/esteira.js';
import { api } from '../../lib/api.js';
import { fmtBudget, fmtInt, fmtMoney } from '../../lib/format.js';
import { rise, stagger } from '../../lib/motion.js';
import { Segmented, Switch } from '../Common.jsx';
import {
  AlertIcon, CanvaIcon, CheckIcon, CopyIcon, ImageIcon, LayersIcon, PinIcon, PlusIcon, StarIcon, TrashIcon, VideoIcon, XIcon,
} from '../Icons.jsx';
import { MediaLibrary } from './MediaLibrary.jsx';
import { NewItemModal } from './NewItemModal.jsx';
import { PostPicker } from './PostPicker.jsx';
import { AdMock, WhatsAppMock } from './Preview.jsx';
import { BrandLogo } from '../Brands.jsx';
import {
  fmtAudience, fmtPhone, IntInput, matchScore, mediaThumb, MoneyInput, SearchCombo, TEXT_TOKENS, TokenChips, useDebounced,
} from './kit.jsx';

function StepHead({ index, title, text }) {
  return (
    <div className="step-head">
      <div className="eyebrow">Etapa {index + 1} de {STEPS.length}</div>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

function Issues({ list }) {
  if (!list?.length) return null;
  return (
    <motion.div className="issues" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {list.map((m) => <div key={m}><AlertIcon />{m}</div>)}
    </motion.div>
  );
}

const choiceMotion = { variants: rise, whileHover: { y: -2 }, whileTap: { scale: 0.98 } };

// ---------------------------------------------------------------- 1. Conta e modelo
export function StepModelo({ config, setConfig, templates, accounts, onTemplateApplied, issues }) {
  const account = accounts?.find((a) => a.id === config.accountId);
  const [changing, setChanging] = useState(!config.accountId);

  function chooseAccount(a) {
    if (a.id === config.accountId) return setChanging(false);
    if (config.accountId && !window.confirm('Trocar de conta limpa a configuração (página, públicos e criativos são de cada cliente). Continuar?')) return;
    setConfig(newConfig(a.id), a.name);
    setChanging(false);
  }

  const [using, setUsing] = useState(null);

  function applyTemplate(t, offer) {
    const { config: next } = retargetConfig(t.config, offer);
    setConfig({ ...next, accountId: config.accountId });
    onTemplateApplied(t);
    setUsing(null);
  }

  return (
    <div className="step-card">
      <StepHead index={0} title="Conta e modelo" text="Cada conta é um cliente. Escolha a conta e, se quiser, parta de um modelo que já deu certo nela." />
      <div className="q">
        <div className="q-label">Conta de anúncios</div>
        {!changing && account ? (
          <div className="choice on" style={{ cursor: 'default' }}>
            <span className="avatar" style={{ width: 34, height: 34 }}>{account.name.replace(/[^A-Za-zÀ-ú]/g, '').slice(0, 2).toUpperCase()}</span>
            <span style={{ flex: 1 }}>
              <div className="choice-title">{account.name}</div>
              <div className="choice-sub mono">{account.id} · {account.currency}</div>
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setChanging(true)}>Trocar</button>
          </div>
        ) : (
          <motion.div className="choice-grid" variants={stagger(0.02)} initial="hidden" animate="show">
            {(accounts || []).filter((a) => a.status === 1).map((a) => (
              <motion.button key={a.id} type="button" className={`choice ${a.id === config.accountId ? 'on' : ''}`} onClick={() => chooseAccount(a)} {...choiceMotion}>
                <span className="avatar" style={{ width: 30, height: 30 }}>{a.name.replace(/[^A-Za-zÀ-ú]/g, '').slice(0, 2).toUpperCase()}</span>
                <span style={{ minWidth: 0 }}><div className="choice-title">{a.name}</div></span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>

      {config.accountId && !changing && (
        <div className="q">
          <div className="q-label">Modelos desta conta <small>opcional</small></div>
          {templates === null && <div className="skeleton" style={{ height: 110 }} />}
          {templates?.length === 0 && <div className="empty">Esta conta ainda não tem modelos — siga montando do zero. Quando a campanha der certo, salve-a como modelo.</div>}
          <motion.div className="choice-grid" variants={stagger(0.04)} initial="hidden" animate="show">
            {templates?.map((t) => (
              <motion.button key={t.id} type="button" className="choice choice-big" onClick={() => setUsing(t)} {...choiceMotion}>
                <span className="kpi-icon" style={{ color: 'var(--gold)' }}><StarIcon /></span>
                <div className="choice-title">{t.name}</div>
                <div className="choice-sub">
                  {t.performance?.costPerConversation != null ? `${fmtMoney(t.performance.costPerConversation)}/conversa · ${fmtInt(t.performance.conversations)} conversas · ` : ''}
                  {t.config.adsets.length} conjunto(s) · {t.config.ads.length} anúncio(s)
                </div>
              </motion.button>
            ))}
          </motion.div>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => window.confirm('Recomeçar do zero nesta conta?') && setConfig(newConfig(config.accountId))}>
            Recomeçar do zero
          </button>
        </div>
      )}
      <Issues list={issues.modelo} />
      <NewItemModal open={Boolean(using)} template={using} onClose={() => setUsing(null)} onConfirm={(offer) => applyTemplate(using, offer)} confirmLabel="Aplicar modelo" />
    </div>
  );
}

// ---------------------------------------------------------------- 2. Oferta
export function StepOferta({ config, update, canvaVehicles, issues }) {
  return (
    <div className="step-card">
      <StepHead index={1} title="O que vamos anunciar?" text="O veículo ou a oferta vira o nome da campanha e pode ser usado nos textos com {oferta}." />
      <div className="q">
        <label htmlFor="offer">Veículo ou oferta</label>
        <input id="offer" className="field field-lg" style={{ width: '100%' }} autoFocus placeholder="Ex.: Chevrolet Onix LTZ 1.0 Turbo 2024" value={config.offer.title} onChange={(e) => update((c) => { c.offer.title = e.target.value; })} />
        {canvaVehicles.length > 0 && (
          <>
            <div className="hint">Veículos com arte do Canva nesta conta:</div>
            <div className="token-chips">
              {canvaVehicles.map((v) => (
                <button key={v} type="button" className="token-chip" style={{ fontFamily: 'var(--font)' }} onClick={() => update((c) => { c.offer.title = v; })}>{v}</button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="row-3">
        <div className="q">
          <label htmlFor="price">Preço <small style={{ fontWeight: 400, color: 'var(--muted)' }}>opcional · {'{preco}'}</small></label>
          <MoneyInput id="price" cents={false} style={{ width: '100%' }} placeholder="R$ 79.900" value={config.offer.priceValue ?? null} onChange={(v) => update((c) => { c.offer.priceValue = v; c.offer.price = fmtPrice(v); })} />
        </div>
        <div className="q">
          <label htmlFor="km">Quilometragem <small style={{ fontWeight: 400, color: 'var(--muted)' }}>opcional · {'{km}'}</small></label>
          <div className="input-suffix"><IntInput id="km" style={{ width: '100%' }} placeholder="45.000" value={config.offer.km} onChange={(v) => update((c) => { c.offer.km = v; })} /><span>km</span></div>
        </div>
        <div className="q">
          <label htmlFor="year">Ano <small style={{ fontWeight: 400, color: 'var(--muted)' }}>opcional · {'{ano}'}</small></label>
          <input id="year" className="field mono-field" style={{ width: '100%' }} placeholder="2024" maxLength={9} value={config.offer.year} onChange={(e) => update((c) => { c.offer.year = e.target.value.replace(/[^\d/]/g, ''); })} />
        </div>
      </div>
      <div className="q">
        <label htmlFor="naming">Nome da campanha (padrão)</label>
        <input id="naming" className="field mono-field" style={{ width: '100%' }} value={config.naming.campaign} onChange={(e) => update((c) => { c.naming.campaign = e.target.value; })} />
        <TokenChips tokens={[['{OFERTA}', 'Oferta em maiúsculas'], ['{oferta}', 'Oferta como digitada'], ['{cidade}', 'Primeira cidade'], ['[DOM]', 'Prefixo da agência'], [`[${objectiveOf(config).tag}]`, 'Objetivo'], ['[CRM]', ''], ['[MENSAGEM]', ''], ['[WHATSAPP]', '']]} onInsert={(t) => update((c) => { c.naming.campaign = `${c.naming.campaign} ${t}`.trim(); })} />
        <motion.div className="name-preview" key={campaignName(config)} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}>{campaignName(config)}</motion.div>
      </div>
      <Issues list={issues.oferta} />
    </div>
  );
}

// ---------------------------------------------------------------- 3. Destino
export function StepDestino({ config, update, assets, issues }) {
  const d = config.destination;
  const page = assets?.pages.find((p) => p.id === d.pageId);
  const knownNumber = !d.whatsappNumber || assets?.whatsappNumbers.some((w) => w.number === d.whatsappNumber);
  const [custom, setCustom] = useState(!knownNumber);

  function chooseObjective(o) {
    update((c) => {
      const before = objectiveOf(c).tag;
      c.objective = o.key;
      // Mantém o padrão de nome coerente: [ENGAJAMENTO] → [LEADS] etc.
      if (c.naming?.campaign?.includes(`[${before}]`)) c.naming.campaign = c.naming.campaign.replace(`[${before}]`, `[${o.tag}]`);
      if (!o.goals.includes(c.performanceGoal)) c.performanceGoal = o.goals[0];
    });
  }

  function choosePage(p) {
    update((c) => {
      c.destination.pageId = p.id;
      c.destination.pageName = p.name;
      c.destination.instagramId = p.instagram?.id || '';
      c.destination.instagramUsername = p.instagram?.username || '';
    });
  }

  return (
    <div className="step-card">
      <StepHead index={2} title="Destino no WhatsApp" text="Identidade do anúncio, número que recebe as conversas e o modelo de mensagem que o cliente vê ao clicar." />
      <div className="row-2" style={{ alignItems: 'start' }}>
        <div>
          <div className="q">
            <div className="q-label">Objetivo da campanha</div>
            <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {OBJECTIVES.map((o) => (
                <button key={o.key} type="button" className={`choice choice-big ${config.objective === o.key ? 'on' : ''}`} style={{ minHeight: 96 }} onClick={() => chooseObjective(o)}>
                  <div className="choice-title">{o.label}</div>
                  <div className="choice-sub">{o.hint}</div>
                  {config.objective === o.key && <span className="check"><CheckIcon /></span>}
                </button>
              ))}
            </div>
            <div className="hint">Local da conversão: <strong>Apps de mensagem → WhatsApp</strong>, otimizando conversas.{config.objective === 'OUTCOME_LEADS' ? ' No Gerenciador em português este objetivo aparece como "Cadastros".' : ''}</div>
          </div>
          <div className="q">
            <div className="q-label">Identidade · Página do Facebook</div>
            {!assets && <div className="skeleton" style={{ height: 64 }} />}
            {assets?.pages.length === 0 && <div className="notice warning">Nenhuma página disponível para esta conta anunciar.</div>}
            <div className="choice-grid" style={{ gridTemplateColumns: '1fr' }}>
              {assets?.pages.map((p) => (
                <button key={p.id} type="button" className={`choice ${p.id === d.pageId ? 'on' : ''}`} onClick={() => choosePage(p)}>
                  {p.picture ? <img src={p.picture} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{p.name.slice(0, 1)}</span>}
                  <span style={{ minWidth: 0 }}>
                    <div className="choice-title">{p.name}</div>
                    <div className="choice-sub">{p.instagram ? `Instagram @${p.instagram.username}` : 'Sem Instagram conectado'}</div>
                  </span>
                  {p.id === d.pageId && <span className="check"><CheckIcon /></span>}
                </button>
              ))}
            </div>
          </div>
          <div className="q">
            <div className="q-label">Número do WhatsApp</div>
            <div className="choice-grid" style={{ gridTemplateColumns: '1fr' }}>
              <button type="button" className={`choice ${!d.whatsappNumber && !custom ? 'on' : ''}`} onClick={() => { setCustom(false); update((c) => { c.destination.whatsappNumber = ''; }); }}>
                <span><div className="choice-title">Número conectado à página</div><div className="choice-sub">A Meta usa o WhatsApp vinculado à página escolhida</div></span>
              </button>
              {assets?.whatsappNumbers.map((w) => (
                <button key={w.number} type="button" className={`choice ${d.whatsappNumber === w.number && !custom ? 'on' : ''}`} onClick={() => { setCustom(false); update((c) => { c.destination.whatsappNumber = w.number; }); }}>
                  <span><div className="choice-title mono">{fmtPhone(w.number)}</div><div className="choice-sub">usado em {w.uses} conjunto(s) desta conta</div></span>
                </button>
              ))}
              <button type="button" className={`choice ${custom ? 'on' : ''}`} onClick={() => setCustom(true)}>
                <span><div className="choice-title">Outro número</div><div className="choice-sub">Precisa estar conectado à página na Meta</div></span>
              </button>
            </div>
            {custom && (
              <input className="field mono-field" style={{ width: '100%', marginTop: 8 }} placeholder="5548999990000" value={d.whatsappNumber} onChange={(e) => update((c) => { c.destination.whatsappNumber = e.target.value.replace(/\D/g, ''); })} />
            )}
          </div>
        </div>
        <div>
          <div className="q">
            <label htmlFor="greet">Modelo de mensagem · Saudação</label>
            <textarea id="greet" className="field" rows={3} value={d.greeting} onChange={(e) => update((c) => { c.destination.greeting = e.target.value; })} />
            <TokenChips tokens={TEXT_TOKENS} onInsert={(t) => update((c) => { c.destination.greeting = `${c.destination.greeting} ${t}`.trim(); })} />
          </div>
          <div className="q">
            <label htmlFor="autofill">Mensagem pré-preenchida do cliente</label>
            <textarea id="autofill" className="field" rows={2} value={d.autofill} onChange={(e) => update((c) => { c.destination.autofill = e.target.value; })} />
            <TokenChips tokens={TEXT_TOKENS} onInsert={(t) => update((c) => { c.destination.autofill = `${c.destination.autofill} ${t}`.trim(); })} />
          </div>
          <WhatsAppMock config={config} page={page} />
        </div>
      </div>
      <Issues list={issues.destino} />
    </div>
  );
}

// ---------------------------------------------------------------- 4. Público
function Estimate({ accountId, pageId, adset }) {
  const key = useDebounced(JSON.stringify({ accountId, pageId, adset }), 900);
  const [state, setState] = useState({ loading: false, data: null });
  useEffect(() => {
    const { accountId: acc, pageId: page, adset: a } = JSON.parse(key);
    const hasGeo = a.geo.locations?.some((l) => !l.excluded);
    if (!acc || !page || !hasGeo) return setState({ loading: false, data: null });
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    api('/api/builder/estimate', { method: 'POST', body: { accountId: acc, pageId: page, adset: a } })
      .then((data) => !cancelled && setState({ loading: false, data }), () => !cancelled && setState({ loading: false, data: null }));
    return () => { cancelled = true; };
  }, [key]);

  const e = state.data;
  return (
    <div className="card estimate">
      <div className="q-label" style={{ marginBottom: 0 }}>Tamanho estimado do público</div>
      {!pageId && <div className="hint">Escolha a página na etapa Destino para estimar.</div>}
      {pageId && !e && !state.loading && <div className="hint">Adicione uma localização para estimar.</div>}
      {state.loading && !e && <div className="skeleton" style={{ height: 40, marginTop: 8 }} />}
      {e && (
        <div className={state.loading ? 'loading-dim' : undefined}>
          <div className="estimate-num">
            {e.mauLower != null ? (
              <><NumberFlow value={e.mauLower} locales="pt-BR" format={{ notation: 'compact', maximumFractionDigits: 1 }} /> – <NumberFlow value={e.mauUpper} locales="pt-BR" format={{ notation: 'compact', maximumFractionDigits: 1 }} /> pessoas</>
            ) : 'Indisponível'}
          </div>
          {e.error && <div className="hint">{e.error}</div>}
          {e.sentences.length > 0 && (
            <ul>
              {e.sentences.map((s) => <li key={s.content}><strong>{s.content}</strong> {s.children.join(' · ')}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const typeLabel = (t) => LOCATION_TYPES[t]?.label || t;

/** Locais como no Gerenciador: busca de país/estado/cidade/bairro/CEP, raio quando cabe e incluir/excluir. */
function LocationsField({ adset, set, page }) {
  const locs = adset.geo.locations;
  const audienceValue = (adset.locationTypes || ['home', 'recent']).join(',');
  const add = (l) => set((a) => { if (!a.geo.locations.some((x) => x.type === l.type && x.key === l.key)) a.geo.locations.push(l); });
  const included = locs.filter((l) => !l.excluded).length;

  return (
    <div className="q">
      <div className="q-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span>Locais <small>{included} incluído(s){locs.length > included ? ` · ${locs.length - included} excluído(s)` : ''}</small></span>
        <select className="field" style={{ height: 30, fontSize: 12, maxWidth: 360 }} value={audienceValue} onChange={(e) => set((a) => { a.locationTypes = e.target.value.split(','); })} aria-label="Quem considerar no local">
          {LOCATION_AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          {!LOCATION_AUDIENCES.some(([v]) => v === audienceValue) && <option value={audienceValue}>Personalizado ({audienceValue.replace(/,/g, ', ')})</option>}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <SearchCombo
            placeholder="Buscar país, estado, cidade, bairro ou CEP"
            endpoint="/api/builder/search/geo"
            render={(g) => (
              <>
                <span><span className={`loc-type t-${g.type}`}>{typeLabel(g.type)}</span>{g.name}</span>
                <small>{[g.region, g.country && g.country !== 'BR' ? g.countryName || g.country : ''].filter(Boolean).join(' · ')}</small>
              </>
            )}
            onPick={(g) => add({ type: g.type, key: g.key, name: g.name, region: g.region, radius: g.type === 'city' ? 40 : undefined, excluded: false })}
          />
        </div>
        {page?.location && (
          <button type="button" className="btn" title="Raio em volta do endereço cadastrado na página" onClick={() => add({ type: 'address', key: `pin:${page.location.latitude},${page.location.longitude}`, name: page.location.label || page.name, latitude: page.location.latitude, longitude: page.location.longitude, radius: 20, excluded: false })}>
            <PinIcon /> Endereço da loja
          </button>
        )}
      </div>
      {locs.length === 0 && <div className="hint">Ex.: “Santa Catarina” (estado), “Criciúma” (cidade + raio), “88801” (CEP) ou “Brasil”.</div>}
      <AnimatePresence initial={false}>
        {locs.map((l, li) => {
          const r = LOCATION_TYPES[l.type]?.radius;
          const sliderMin = r?.optional ? r.min - 1 : r?.min;
          return (
            <motion.div key={`${l.type}:${l.key}`} className={`loc-row ${l.excluded ? 'excluded' : ''}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <button type="button" className={`loc-mode ${l.excluded ? 'out' : 'in'}`} onClick={() => set((a) => { a.geo.locations[li].excluded = !l.excluded; })} title="Alternar entre incluir e excluir">
                {l.excluded ? 'Excluir' : 'Incluir'}
              </button>
              <span className={`loc-type t-${l.type}`}>{typeLabel(l.type)}</span>
              <span style={{ minWidth: 0 }}><strong>{l.name}</strong> {l.region && <small style={{ color: 'var(--muted)' }}>{l.region}</small>}</span>
              {r ? (
                <span className="loc-radius">
                  <input
                    type="range"
                    min={sliderMin}
                    max={r.max}
                    value={l.radius || sliderMin}
                    onChange={(e) => set((a) => { const v = Number(e.target.value); a.geo.locations[li].radius = r.optional && v < r.min ? 0 : v; })}
                    aria-label={`Raio em ${l.name}`}
                  />
                  <span className="mono">{l.radius ? `+${l.radius} km` : 'só a cidade'}</span>
                </span>
              ) : <span />}
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => set((a) => { a.geo.locations.splice(li, 1); })} aria-label={`Remover ${l.name}`}><XIcon /></button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

const OS_VERSIONS = { iOS: ['15.0', '16.0', '17.0', '18.0', '26.0'], Android: ['10.0', '11.0', '12.0', '13.0', '14.0', '15.0', '16.0'] };
let devicesCache = null;

/** Dispositivos: celular/computador, sistema (com versão mínima) e aparelhos específicos (ex.: apenas iPhone 16+). */
function DevicesField({ adset, set }) {
  const dev = adset.devices;
  const [list, setList] = useState(devicesCache);
  const [term, setTerm] = useState('');
  useEffect(() => {
    if (devicesCache) return;
    api('/api/builder/devices').then((l) => { devicesCache = l; setList(l); }, () => setList([]));
  }, []);
  const platform = dev.platforms.length === 1 ? dev.platforms[0] : 'all';
  const q = term.trim().toLowerCase();
  const results = q.length >= 2 ? (list || []).filter((d) => d.name.toLowerCase().includes(q) && !dev.include.includes(d.name)).slice(0, 8) : [];
  const preset = DEVICE_PRESETS.find((p) => p.devices.length === dev.include.length && p.devices.every((d) => dev.include.includes(d)));

  return (
    <div className="q">
      <div className="q-label">Dispositivos <small>{deviceSummary(dev)}</small></div>
      <div className="row-2" style={{ alignItems: 'start' }}>
        <div>
          <div className="hint" style={{ marginTop: 0, marginBottom: 6 }}>Tipo de dispositivo</div>
          <Segmented
            options={[['all', 'Todos'], ['mobile', 'Celular'], ['desktop', 'Computador']]}
            value={platform}
            onChange={(v) => set((a) => {
              a.devices.platforms = v === 'all' ? [] : [v];
              if (v === 'desktop') { a.devices.os = ''; a.devices.osMin = ''; a.devices.include = []; a.devices.exclude = []; }
            })}
            label="Tipo de dispositivo"
            size="sm"
          />
        </div>
        <div>
          <div className="hint" style={{ marginTop: 0, marginBottom: 6 }}>Sistema operacional</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Segmented
              options={[['', 'Todos'], ['iOS', 'iOS'], ['Android', 'Android']]}
              value={dev.os}
              onChange={(v) => set((a) => { a.devices.os = v; a.devices.osMin = ''; if (v) a.devices.platforms = ['mobile']; if (v === 'Android') a.devices.include = a.devices.include.filter((d) => !/^(iphone|ipad|ipod)/i.test(d)); })}
              label="Sistema operacional"
              size="sm"
            />
            {dev.os && (
              <select className="field" style={{ height: 30, fontSize: 12 }} value={dev.osMin} onChange={(e) => set((a) => { a.devices.osMin = e.target.value; })} aria-label="Versão mínima">
                <option value="">qualquer versão</option>
                {OS_VERSIONS[dev.os].map((v) => <option key={v} value={v}>{v} ou superior</option>)}
              </select>
            )}
          </div>
        </div>
      </div>
      <div className="hint" style={{ marginBottom: 6 }}>Aparelhos específicos <span style={{ color: 'var(--muted)' }}>(usado para públicos de maior poder de compra)</span></div>
      <div className="token-chips" style={{ marginTop: 0 }}>
        {DEVICE_PRESETS.map((p) => (
          <button key={p.key} type="button" className={`token-chip ${preset?.key === p.key ? 'on' : ''}`} style={{ fontFamily: 'var(--font)' }} onClick={() => set((a) => { a.devices.include = [...p.devices]; a.devices.os = 'iOS'; a.devices.platforms = ['mobile']; })}>
            {p.label}
          </button>
        ))}
        {dev.include.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set((a) => { a.devices.include = []; })}>Limpar aparelhos</button>}
      </div>
      <div className="combo" style={{ marginTop: 8 }}>
        <input className="field" style={{ width: '100%' }} placeholder={list ? 'Buscar aparelho (ex.: iphone 15, galaxy s24)' : 'Carregando lista de aparelhos…'} value={term} onChange={(e) => setTerm(e.target.value)} disabled={!list} />
        {results.length > 0 && (
          <div className="combo-list">
            {results.map((d) => (
              <button key={d.name} type="button" className="combo-item" onClick={() => { set((a) => { a.devices.include.push(d.name); a.devices.platforms = ['mobile']; }); setTerm(''); }}>
                <span>{d.name}</span><small>{d.platform}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      {dev.include.length > 0 && (
        <div className="pill-list">
          {dev.include.map((d) => (
            <span key={d} className="pill">{d}<button type="button" onClick={() => set((a) => { a.devices.include = a.devices.include.filter((x) => x !== d); })} aria-label={`Remover ${d}`}><XIcon /></button></span>
          ))}
        </div>
      )}
    </div>
  );
}

export function deviceSummary(dev) {
  if (!dev) return 'Todos os dispositivos';
  if (dev.include?.length) {
    const preset = DEVICE_PRESETS.find((p) => p.devices.length === dev.include.length && p.devices.every((d) => dev.include.includes(d)));
    return preset ? preset.label : `${dev.include.length} aparelho(s) específico(s)`;
  }
  if (dev.os) return `Somente ${dev.os}${dev.osMin ? ` ${dev.osMin}+` : ''}`;
  if (dev.platforms?.[0] === 'mobile') return 'Somente celular';
  if (dev.platforms?.[0] === 'desktop') return 'Somente computador';
  return 'Todos os dispositivos';
}

export function StepPublico({ config, update, assets, issues }) {
  const [active, setActive] = useState(config.adsets[0]?.key);
  const idx = Math.max(0, config.adsets.findIndex((a) => a.key === active));
  const adset = config.adsets[idx];
  const page = assets?.pages.find((p) => p.id === config.destination.pageId);
  const set = (fn) => update((c) => fn(c.adsets[idx]));

  useEffect(() => {
    if (!config.adsets.some((a) => a.key === active)) setActive(config.adsets[0]?.key);
  }, [config.adsets, active]);

  function addAdset() {
    const a = newAdset(`TESTE 0${config.adsets.length + 1}`);
    update((c) => { c.adsets.push(a); });
    setActive(a.key);
  }
  function duplicateAdset() {
    const copy = { ...JSON.parse(JSON.stringify(adset)), key: rid(), name: `${adset.name} (cópia)` };
    update((c) => { c.adsets.splice(idx + 1, 0, copy); });
    setActive(copy.key);
  }
  function removeAdset(key) {
    if (config.adsets.length === 1) return;
    update((c) => { c.adsets = c.adsets.filter((a) => a.key !== key); });
  }

  if (!adset) return null;
  const extraKeys = Object.keys(adset.extraTargeting || {}).filter((k) => !['targeting_automation'].includes(k));
  const audiences = assets?.audiences || [];
  const placementsManual = Array.isArray(adset.placements);

  return (
    <div className="step-card">
      <StepHead index={3} title="Público" text="Cada conjunto é um público diferente. Vários conjuntos permitem testar qual público gera conversas mais baratas." />
      <div className="tabs">
        {config.adsets.map((a) => (
          <motion.button layout key={a.key} type="button" className={`tab ${a.key === adset.key ? 'on' : ''}`} onClick={() => setActive(a.key)}>
            <PinIcon width={13} height={13} /> {a.name || 'Sem nome'}
            {config.adsets.length > 1 && <span className="x" role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); removeAdset(a.key); }} title="Remover conjunto"><XIcon /></span>}
          </motion.button>
        ))}
        <button type="button" className="tab" onClick={addAdset}><PlusIcon width={13} height={13} /> Novo conjunto</button>
        <button type="button" className="tab" onClick={duplicateAdset} title="Duplicar conjunto atual"><CopyIcon width={13} height={13} /> Duplicar</button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={adset.key} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.22 }}>
          <div className="q">
            <label htmlFor="adset-name">Nome do conjunto</label>
            <input id="adset-name" className="field" style={{ width: '100%' }} value={adset.name} onChange={(e) => set((a) => { a.name = e.target.value; })} />
          </div>

          <LocationsField adset={adset} set={set} page={page} />

          <div className="row-2">
            <div className="q">
              <div className="q-label">Idade</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" className="field" style={{ width: 80 }} min={18} max={65} value={adset.ageMin} onChange={(e) => set((a) => { a.ageMin = Number(e.target.value); })} aria-label="Idade mínima" />
                <span>até</span>
                <input type="number" className="field" style={{ width: 80 }} min={18} max={65} value={adset.ageMax} onChange={(e) => set((a) => { a.ageMax = Number(e.target.value); })} aria-label="Idade máxima" />
                <span className="hint" style={{ margin: 0 }}>65 = 65+</span>
              </div>
            </div>
            <div className="q">
              <div className="q-label">Gênero</div>
              <Segmented
                options={[['all', 'Todos'], ['1', 'Homens'], ['2', 'Mulheres']]}
                value={adset.genders.length === 1 ? String(adset.genders[0]) : 'all'}
                onChange={(v) => set((a) => { a.genders = v === 'all' ? [] : [Number(v)]; })}
                label="Gênero"
              />
            </div>
          </div>

          <div className="q">
            <div className="q-label">Segmentação detalhada <small>interesses</small></div>
            <SearchCombo
              placeholder="Buscar interesse (ex.: automóveis, caminhonete, agronegócio)"
              endpoint="/api/builder/search/interests"
              render={(i) => <><span>{i.name}</span><small>{i.audienceUpper ? `até ${fmtAudience(i.audienceUpper)}` : ''}</small></>}
              onPick={(i) => set((a) => { if (!a.interests.some((x) => x.id === i.id)) a.interests.push({ id: i.id, name: i.name }); })}
            />
            <div className="pill-list">
              {adset.interests.map((i) => (
                <span key={i.id} className="pill">{i.name}<button type="button" onClick={() => set((a) => { a.interests = a.interests.filter((x) => x.id !== i.id); })} aria-label={`Remover ${i.name}`}><XIcon /></button></span>
              ))}
            </div>
          </div>

          {audiences.length > 0 && (
            <div className="row-2">
              {[['customAudiences', 'Públicos personalizados · incluir'], ['excludedAudiences', 'Públicos personalizados · excluir']].map(([field, label]) => (
                <div className="q" key={field}>
                  <div className="q-label">{label}</div>
                  <select className="field" style={{ width: '100%' }} value="" onChange={(e) => {
                    const aud = audiences.find((x) => x.id === e.target.value);
                    if (aud) set((a) => { if (!a[field].some((x) => x.id === aud.id)) a[field].push({ id: aud.id, name: aud.name }); });
                  }}>
                    <option value="">Adicionar público…</option>
                    {audiences.map((aud) => <option key={aud.id} value={aud.id}>{aud.name}</option>)}
                  </select>
                  <div className="pill-list">
                    {adset[field].map((aud) => (
                      <span key={aud.id} className="pill">{aud.name}<button type="button" onClick={() => set((a) => { a[field] = a[field].filter((x) => x.id !== aud.id); })} aria-label={`Remover ${aud.name}`}><XIcon /></button></span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="q">
            <div className="switch-row" style={{ borderTop: 0, padding: 0 }}>
              <div>
                <strong>Público Advantage+</strong>
                <span>A Meta pode ir além da idade, gênero e interesses quando achar pessoas com mais chance de conversar. Localização continua obrigatória.</span>
              </div>
              <Switch on={adset.advantageAudience} onChange={(v) => set((a) => { a.advantageAudience = v; if (v && a.ageMin > 25) a.ageMin = 25; })} label="Público Advantage+" />
            </div>
          </div>

          <DevicesField adset={adset} set={set} />

          <div className="q">
            <div className="q-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Posicionamentos
              <Segmented options={[['auto', 'Advantage+ (recomendado)'], ['manual', 'Manuais']]} value={placementsManual ? 'manual' : 'auto'} onChange={(v) => set((a) => { a.placements = v === 'auto' ? 'auto' : PLACEMENTS.slice(0, 2).map((p) => p.key).concat(['facebook:story', 'instagram:story', 'instagram:reels', 'facebook:facebook_reels']); })} label="Posicionamentos" size="sm" />
            </div>
            {placementsManual && (
              <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {PLACEMENTS.map((p) => {
                  const on = adset.placements.includes(p.key);
                  return (
                    <button key={p.key} type="button" className={`choice ${on ? 'on' : ''}`} style={{ padding: '9px 12px' }} onClick={() => set((a) => { a.placements = on ? a.placements.filter((k) => k !== p.key) : [...a.placements, p.key]; })}>
                      <span className="plc-logo"><BrandLogo name={p.platform} size={17} /></span>
                      <span><div className="choice-title" style={{ fontSize: 12.5 }}>{p.label}</div><div className="choice-sub">{p.group}</div></span>
                      {on && <span className="check"><CheckIcon /></span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {extraKeys.length > 0 && <div className="notice accent">Este conjunto veio de um modelo e mantém ajustes extras da campanha original: <span className="mono">{extraKeys.join(', ')}</span>.</div>}
          <Estimate accountId={config.accountId} pageId={config.destination.pageId} adset={adset} />
        </motion.div>
      </AnimatePresence>
      <Issues list={issues.publico} />
    </div>
  );
}

// ---------------------------------------------------------------- 5. Orçamento
export function StepOrcamento({ config, update, assets, referenceCost, issues }) {
  const b = config.budget;
  const min = assets?.account.minDailyBudget || 5;
  const [refCost, setRefCost] = useState(referenceCost || 20);
  useEffect(() => { if (referenceCost) setRefCost(referenceCost); }, [referenceCost]);
  const dailyTotal = b.level === 'campaign' ? b.amount : config.adsets.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const perDay = b.type === 'daily' && refCost > 0 ? dailyTotal / refCost : null;
  const usesBid = b.bidStrategy === 'COST_CAP' || b.bidStrategy === 'LOWEST_COST_WITH_BID_CAP';

  return (
    <div className="step-card">
      <StepHead index={4} title="Orçamento e programação" text="Quanto investir, por quanto tempo e como a Meta deve dar lances." />
      <div className="row-2">
        <div className="q">
          <div className="q-label">Orçamento</div>
          <Segmented options={[['campaign', 'Orçamento da campanha Advantage+'], ['adset', 'Orçamento por conjunto']]} value={b.level} onChange={(v) => update((c) => { c.budget.level = v; })} label="Nível do orçamento" />
        </div>
        <div className="q">
          <div className="q-label">Tipo</div>
          <Segmented options={[['daily', 'Diário'], ['lifetime', 'Total']]} value={b.type} onChange={(v) => update((c) => { c.budget.type = v; })} label="Tipo de orçamento" />
        </div>
      </div>

      {b.level === 'campaign' ? (
        <div className="q">
          <label htmlFor="amount">{b.type === 'daily' ? 'Orçamento diário' : 'Orçamento total'}</label>
          <div className="budget-big">
            <MoneyInput id="amount" className="field field-lg" style={{ width: 200 }} value={b.amount || null} onChange={(v) => update((c) => { c.budget.amount = v || 0; })} />
            {b.type === 'daily' && <input type="range" min={Math.ceil(min)} max={500} value={Math.min(b.amount, 500)} onChange={(e) => update((c) => { c.budget.amount = Number(e.target.value); })} aria-label="Orçamento diário" style={{ flex: 1 }} />}
          </div>
          <div className="hint">Mínimo diário desta conta: {fmtMoney(min)}.</div>
        </div>
      ) : (
        <div className="q">
          <div className="q-label">Orçamento de cada conjunto ({b.type === 'daily' ? 'por dia' : 'total'})</div>
          {config.adsets.map((a, i) => (
            <div key={a.key} className="city-row" style={{ gridTemplateColumns: 'minmax(0,1fr) 160px' }}>
              <strong>{a.name}</strong>
              <MoneyInput value={a.amount || null} onChange={(v) => update((c) => { c.adsets[i].amount = v || 0; })} aria-label={`Orçamento de ${a.name}`} />
            </div>
          ))}
        </div>
      )}

      <div className="row-2">
        <div className="q">
          <label htmlFor="start">Data de início <small style={{ fontWeight: 400, color: 'var(--muted)' }}>vazio = assim que publicar</small></label>
          <input id="start" type="date" className="field" style={{ width: '100%' }} value={b.startDate || ''} onChange={(e) => update((c) => { c.budget.startDate = e.target.value || null; })} />
        </div>
        <div className="q">
          <label htmlFor="end">Data de término {b.type === 'lifetime' ? '' : <small style={{ fontWeight: 400, color: 'var(--muted)' }}>opcional</small>}</label>
          <input id="end" type="date" className="field" style={{ width: '100%' }} value={b.endDate || ''} onChange={(e) => update((c) => { c.budget.endDate = e.target.value || null; })} />
        </div>
      </div>

      <div className="q">
        <div className="q-label">Meta de desempenho</div>
        <Segmented options={PERFORMANCE_GOALS} value={config.performanceGoal || 'CONVERSATIONS'} onChange={(v) => update((c) => { c.performanceGoal = v; })} label="Meta de desempenho" />
      </div>

      <div className="q">
        <div className="q-label">Estratégia de lance</div>
        <div className="choice-grid">
          {BID_STRATEGIES.map(([value, label, hint]) => (
            <button key={value} type="button" className={`choice choice-big ${b.bidStrategy === value ? 'on' : ''}`} style={{ minHeight: 90 }} onClick={() => update((c) => { c.budget.bidStrategy = value; if (value !== 'LOWEST_COST_WITHOUT_CAP' && !c.budget.costCap && referenceCost) c.budget.costCap = Math.round(referenceCost * 100) / 100; })}>
              <div className="choice-title">{label}</div>
              <div className="choice-sub">{hint}</div>
              {b.bidStrategy === value && <span className="check"><CheckIcon /></span>}
            </button>
          ))}
        </div>
        {usesBid && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{b.bidStrategy === 'COST_CAP' ? 'Custo por resultado desejado' : 'Lance máximo'}:</span>
            <MoneyInput style={{ width: 140 }} value={b.costCap || null} onChange={(v) => update((c) => { c.budget.costCap = v; })} />
            {referenceCost && <span className="hint" style={{ margin: 0 }}>Referência do modelo: {fmtMoney(referenceCost)}</span>}
          </div>
        )}
      </div>

      {b.type === 'daily' && (
        <div className="card projection">
          <div>Investimento por mês<strong>{fmtMoney(dailyTotal * 30)}</strong></div>
          <div>Conversas por dia (estim.)<strong>{perDay != null ? <NumberFlow value={Math.round(perDay * 10) / 10} locales="pt-BR" format={{ maximumFractionDigits: 1 }} /> : '—'}</strong></div>
          <div>
            Custo de referência
            <strong style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MoneyInput style={{ width: 110, height: 30 }} value={refCost || null} onChange={(v) => setRefCost(v || 0)} aria-label="Custo de referência por conversa" /></strong>
          </div>
        </div>
      )}
      <Issues list={issues.orcamento} />
    </div>
  );
}

// ---------------------------------------------------------------- 6. Criativos
/** Artes do Canva da conta que combinam com o item do anúncio (para não precisar procurar na biblioteca). */
function useCanvaMatches(accountId, titles) {
  const [lib, setLib] = useState(null);
  useEffect(() => {
    if (!accountId) return undefined;
    let cancelled = false;
    api(`/api/builder/media?accountId=${accountId}`).then((l) => !cancelled && setLib(l), () => {});
    return () => { cancelled = true; };
  }, [accountId]);
  return (title) => {
    if (!lib || !title?.trim()) return [];
    const scored = lib.canva
      .filter((m) => !m.canva.isBase && m.canva.format === 'feed')
      .map((m) => ({ m, score: matchScore(title, `${m.canva.vehicle} ${m.canva.year}`) }))
      .filter((x) => x.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return scored.map(({ m }) => {
      const pair = lib.canva.find((s) => s.canva.format === 'story' && s.canva.vehicle === m.canva.vehicle && s.canva.year === m.canva.year && s.canva.variant === m.canva.variant)
        || lib.canva.filter((s) => s.canva.format === 'story' && s.canva.vehicle === m.canva.vehicle && s.canva.year === m.canva.year).at(0);
      return { feed: m, story: pair || null };
    });
  };
}

const fromLib = (m) => ({ kind: m.kind, source: 'upload', mediaId: m.id, name: m.canva?.vehicle || m.originalName, thumbUrl: m.url });

export function StepCriativos({ config, update, assets, issues, retarget }) {
  const [library, setLibrary] = useState(null); // { adKey, slot }
  const [picking, setPicking] = useState(null); // adKey escolhendo publicação existente
  const page = assets?.pages.find((p) => p.id === config.destination.pageId);
  const canvaFor = useCanvaMatches(config.accountId);
  const leftovers = retarget ? [...new Set((retarget.oldCars?.length ? retarget.oldCars : [retarget.from]).filter(Boolean).flatMap((t) => leftoverMentions(config, t)))] : [];
  const multiAdsets = config.adsets.length > 1;

  function pick(media, storyPair) {
    const { adKey, slot } = library;
    update((c) => {
      const ad = c.ads.find((a) => a.key === adKey);
      ad[slot] = media;
      if (slot === 'media' && storyPair) ad.storyMedia = storyPair;
      if (slot === 'media' && media.kind === 'video') ad.storyMedia = null;
    });
    setLibrary(null);
  }

  return (
    <div className="step-card">
      <StepHead index={5} title="Criativos" text="Crie o anúncio com imagem ou vídeo (com a versão 9:16 para stories e reels) ou use uma publicação que já está na página." />
      {retarget && (
        <div className={`notice ${leftovers.length ? 'warning' : 'accent'}`} style={{ marginBottom: 14 }}>
          Modelo adaptado de <strong>{retarget.oldCars?.slice(-1)[0] || retarget.from || 'item anterior'}</strong> para <strong>{config.offer.title || 'o novo item'}</strong>. As mídias do carro antigo foram removidas — escolha as artes do novo item.
          {leftovers.length > 0 && <> Os textos ainda citam <strong>{leftovers.join(', ')}</strong>: revise antes de publicar.</>}
          {retarget.collapsedAds > 1 && <> O modelo tinha {retarget.collapsedAds} anúncios de carros diferentes; a campanha começa com um anúncio para o novo item.</>}
        </div>
      )}
      <AnimatePresence initial={false}>
        {config.ads.map((ad, i) => {
          const set = (fn) => update((c) => fn(c.ads[i]));
          const existing = ad.source === 'existing';
          const itemTitle = ad.offer?.title || config.offer.title;
          const matches = !existing && !ad.media ? canvaFor(itemTitle) : [];
          const inAdsets = ad.adsetKeys?.length ? ad.adsetKeys : config.adsets.map((a) => a.key);
          return (
            <motion.div key={ad.key} layout className="card ad-editor" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}>
              <div className="ad-editor-head">
                <span className="tag accent">Anúncio {i + 1}</span>
                <strong>{applyPlaceholders(ad.name, config, ad) || 'Sem nome'}</strong>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => update((c) => { c.ads.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(ad)), key: rid() }); })}><CopyIcon /> Duplicar</button>
                {config.ads.length > 1 && <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => update((c) => { c.ads.splice(i, 1); })}><TrashIcon /></button>}
              </div>
              <div className="q" style={{ marginBottom: 14 }}>
                <div className="q-label">Configuração do anúncio</div>
                <Segmented
                  options={[['new', 'Criar anúncio'], ['existing', 'Usar publicação existente']]}
                  value={ad.source || 'new'}
                  onChange={(v) => set((a) => { a.source = v; })}
                  label="Configuração do anúncio"
                />
                {!existing && <div className="hint">Formato: <strong>Imagem ou vídeo único</strong> · Mídia com ajuste por posicionamento (feed 4:5 e stories/reels 9:16), como no Gerenciador.</div>}
              </div>
              <div className="row-2" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', alignItems: 'start' }}>
                <div>
                  {existing ? (
                    <div className="q">
                      <button type="button" className="media-slot" style={{ width: '100%' }} onClick={() => setPicking(ad.key)} disabled={!config.destination.pageId}>
                        {ad.post?.picture ? <img src={ad.post.picture} alt="" referrerPolicy="no-referrer" /> : <span className="ph"><LayersIcon /></span>}
                        <span style={{ minWidth: 0 }}>
                          <strong>{ad.post ? `Publicação do ${ad.post.platform === 'instagram' ? 'Instagram' : 'Facebook'}` : 'Selecionar publicação'}</strong>
                          <span className="clamp-2">{!config.destination.pageId ? 'Escolha a página na etapa Destino primeiro' : ad.post ? (ad.post.message || 'Sem legenda') : 'Posts recentes da página e do Instagram'}</span>
                        </span>
                      </button>
                      <div className="hint">O texto e a mídia são os da publicação (curtidas e comentários continuam somando). O botão será <strong>Enviar mensagem pelo WhatsApp</strong> com a saudação da etapa Destino.</div>
                    </div>
                  ) : (
                    <>
                      <div className="media-slots">
                        <button type="button" className="media-slot" onClick={() => setLibrary({ adKey: ad.key, slot: 'media' })}>
                          {mediaThumb(ad.media) ? <img src={mediaThumb(ad.media)} alt="" referrerPolicy="no-referrer" /> : <span className="ph">{ad.media?.kind === 'video' ? <VideoIcon /> : <ImageIcon />}</span>}
                          <span><strong>Feed · imagem ou vídeo</strong><span>{ad.media ? ad.media.name || 'Selecionado' : 'Escolher da biblioteca'}</span></span>
                        </button>
                        <button type="button" className="media-slot story" onClick={() => setLibrary({ adKey: ad.key, slot: 'storyMedia' })} disabled={ad.media?.kind === 'video'}>
                          {mediaThumb(ad.storyMedia) ? <img src={mediaThumb(ad.storyMedia)} alt="" referrerPolicy="no-referrer" /> : <span className="ph"><ImageIcon /></span>}
                          <span><strong>Stories e Reels · 9:16</strong><span>{ad.media?.kind === 'video' ? 'Indisponível para vídeo' : ad.storyMedia ? ad.storyMedia.name || 'Selecionado' : 'Opcional'}</span></span>
                          {ad.storyMedia && <span role="button" tabIndex={0} className="btn btn-ghost btn-icon btn-sm" style={{ marginLeft: 'auto' }} onClick={(e) => { e.stopPropagation(); set((a) => { a.storyMedia = null; }); }} title="Remover arte de stories"><XIcon /></span>}
                        </button>
                      </div>
                      {matches.length > 0 && (
                        <div className="canva-suggest">
                          <div className="hint" style={{ marginTop: 0 }}><CanvaIcon /> Artes do Canva que combinam com <strong>{itemTitle}</strong>:</div>
                          <div className="canva-suggest-row">
                            {matches.map(({ feed, story }) => (
                              <button key={feed.id} type="button" className="lib-item" title={feed.originalName} onClick={() => set((a) => { a.media = fromLib(feed); a.storyMedia = story ? fromLib(story) : null; })}>
                                <img src={feed.url} alt="" loading="lazy" />
                                {story && <span className="kind tag">+ stories</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div className="q">
                    <label>Nome do anúncio</label>
                    <input className="field" style={{ width: '100%' }} value={ad.name} onChange={(e) => set((a) => { a.name = e.target.value; })} />
                  </div>
                  {!existing && (
                    <>
                      <div className="q">
                        <label>Texto principal <span className="char-count">{ad.primaryText.length}</span></label>
                        <textarea className="field" rows={5} value={ad.primaryText} onChange={(e) => set((a) => { a.primaryText = e.target.value; })} placeholder={'{OFERTA}\n\nCompleto, revisado e com garantia. Chame no WhatsApp e agende seu test drive!'} />
                        <TokenChips tokens={TEXT_TOKENS} onInsert={(t) => set((a) => { a.primaryText = `${a.primaryText}${a.primaryText ? ' ' : ''}${t}`; })} />
                      </div>
                      <div className="row-2">
                        <div className="q">
                          <label>Título <span className="char-count">{ad.headline.length}/40</span></label>
                          <input className="field" style={{ width: '100%' }} value={ad.headline} onChange={(e) => set((a) => { a.headline = e.target.value; })} placeholder="{oferta}" />
                        </div>
                        <div className="q">
                          <label>Descrição</label>
                          <input className="field" style={{ width: '100%' }} value={ad.description} onChange={(e) => set((a) => { a.description = e.target.value; })} placeholder="{preco}" />
                        </div>
                      </div>
                      <div className="hint">Chamada para ação: <strong>Enviar mensagem pelo WhatsApp</strong></div>
                    </>
                  )}
                  <details className="ad-more" open={Boolean(ad.offer?.title) || Boolean(ad.adsetKeys?.length)}>
                    <summary>Vários carros na mesma campanha</summary>
                    <div className="row-2" style={{ marginTop: 10 }}>
                      <div className="q">
                        <label>Carro deste anúncio <small style={{ fontWeight: 400, color: 'var(--muted)' }}>vazio = item da campanha</small></label>
                        <input className="field" style={{ width: '100%' }} placeholder={config.offer.title || 'Ex.: Jeep Compass Longitude 2023'} value={ad.offer?.title || ''} onChange={(e) => set((a) => { a.offer = e.target.value ? { ...(a.offer || {}), title: e.target.value } : null; })} />
                      </div>
                      <div className="q">
                        <label>Preço deste carro</label>
                        <MoneyInput cents={false} style={{ width: '100%' }} value={ad.offer?.priceValue ?? null} disabled={!ad.offer?.title} onChange={(v) => set((a) => { a.offer = { ...(a.offer || {}), priceValue: v, price: fmtPrice(v) }; })} />
                      </div>
                    </div>
                    {multiAdsets && (
                      <div className="q" style={{ marginBottom: 4 }}>
                        <div className="q-label" style={{ fontSize: 13 }}>Veicular nos conjuntos</div>
                        <div className="token-chips" style={{ marginTop: 0 }}>
                          {config.adsets.map((a) => {
                            const on = inAdsets.includes(a.key);
                            return (
                              <button key={a.key} type="button" className={`token-chip ${on ? 'on' : 'off'}`} style={{ fontFamily: 'var(--font)' }} onClick={() => set((x) => {
                                const next = on ? inAdsets.filter((k) => k !== a.key) : [...inAdsets, a.key];
                                x.adsetKeys = next.length === config.adsets.length ? null : next;
                              })}>
                                {on ? '✓ ' : ''}{applyPlaceholders(a.name, config) || 'Sem nome'}
                              </button>
                            );
                          })}
                        </div>
                        <div className="hint">Para “1 conjunto por carro”, deixe cada anúncio em um conjunto só.</div>
                      </div>
                    )}
                  </details>
                </div>
                <AdMock config={config} ad={ad} page={page} />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <button type="button" className="btn" onClick={() => update((c) => { c.ads.push(newAd()); })}><PlusIcon /> Novo anúncio</button>
      <Issues list={issues.criativos} />
      <MediaLibrary open={Boolean(library)} onClose={() => setLibrary(null)} accountId={config.accountId} slot={library?.slot} onPick={pick} />
      <PostPicker
        open={Boolean(picking)}
        onClose={() => setPicking(null)}
        pageId={config.destination.pageId}
        instagramId={config.destination.instagramId}
        onPick={(post) => { update((c) => { const ad = c.ads.find((a) => a.key === picking); ad.post = post; ad.source = 'existing'; if (!ad.name || ad.name === '{OFERTA}') ad.name = '{OFERTA}'; }); setPicking(null); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- 7. Revisão
export function StepRevisao({ config, assets, issues, onJump, onValidate, validation, publishStatus, setPublishStatus, onPublish, busy }) {
  const all = Object.entries(issues);
  const ok = all.length === 0;
  const geo = (a) => a.geo.locations.map((l) => `${l.excluded ? 'exceto ' : ''}${l.name}${l.radius ? ` +${l.radius} km` : ''}`).join(', ') || '—';
  const bid = BID_STRATEGIES.find(([v]) => v === config.budget.bidStrategy)?.[1];

  return (
    <div className="step-card">
      <StepHead index={6} title="Revisão e publicação" text="Confira tudo. A campanha é criada na Meta e, por padrão, fica pausada para você revisar no Gerenciador." />
      {!ok && (
        <div className="notice warning" style={{ marginBottom: 16 }}>
          <strong>Faltam ajustes antes de publicar:</strong>
          {all.map(([step, msgs]) => (
            <div key={step} style={{ marginTop: 6 }}>
              <button type="button" className="btn btn-sm" onClick={() => onJump(STEPS.findIndex((s) => s.key === step))}>{STEPS.find((s) => s.key === step)?.label}</button>
              <span style={{ marginLeft: 8 }}>{msgs.join(' ')}</span>
            </div>
          ))}
        </div>
      )}
      <motion.div className="review-grid" variants={stagger(0.06)} initial="hidden" animate="show">
        <motion.div variants={rise} className="card review-card">
          <h3>Campanha <button type="button" className="btn btn-ghost btn-sm" onClick={() => onJump(1)}>Editar</button></h3>
          <dl>
            <dt>Nome</dt><dd className="mono">{campaignName(config)}</dd>
            <dt>Objetivo</dt><dd>{objectiveOf(config).label} · Apps de mensagem → WhatsApp</dd>
            <dt>Orçamento</dt><dd>{config.budget.level === 'campaign' ? fmtBudget({ [config.budget.type === 'lifetime' ? 'lifetime' : 'daily']: config.budget.amount }, 'BRL') : 'Por conjunto'}</dd>
            <dt>Meta de desempenho</dt><dd>{PERFORMANCE_GOALS.find(([v]) => v === (config.performanceGoal || 'CONVERSATIONS'))?.[1]}</dd>
            <dt>Lance</dt><dd>{bid}{config.budget.costCap ? ` · ${fmtMoney(config.budget.costCap)}` : ''}</dd>
            <dt>Programação</dt><dd>{config.budget.startDate || 'Ao publicar'} → {config.budget.endDate || 'sem término'}</dd>
          </dl>
        </motion.div>
        <motion.div variants={rise} className="card review-card">
          <h3>Destino <button type="button" className="btn btn-ghost btn-sm" onClick={() => onJump(2)}>Editar</button></h3>
          <dl>
            <dt>Página</dt><dd>{config.destination.pageName || '—'}</dd>
            <dt>Instagram</dt><dd>{config.destination.instagramUsername ? `@${config.destination.instagramUsername}` : '—'}</dd>
            <dt>WhatsApp</dt><dd className="mono">{config.destination.whatsappNumber ? fmtPhone(config.destination.whatsappNumber) : 'Número da página'}</dd>
            <dt>Saudação</dt><dd>{applyPlaceholders(config.destination.greeting, config)}</dd>
            <dt>Mensagem do cliente</dt><dd>{applyPlaceholders(config.destination.autofill, config)}</dd>
          </dl>
        </motion.div>
        <motion.div variants={rise} className="card review-card">
          <h3>Conjuntos ({config.adsets.length}) <button type="button" className="btn btn-ghost btn-sm" onClick={() => onJump(3)}>Editar</button></h3>
          <dl>
            {config.adsets.map((a) => (
              <FragmentRow key={a.key} label={applyPlaceholders(a.name, config)} value={`${geo(a)} · ${a.ageMin}–${a.ageMax} anos${a.interests.length ? ` · ${a.interests.length} interesse(s)` : ''}${a.customAudiences.length ? ` · ${a.customAudiences.length} público(s)` : ''}${a.advantageAudience ? ' · Advantage+' : ''} · ${deviceSummary(a.devices)}${Array.isArray(a.placements) ? ` · ${a.placements.length} posicionamento(s)` : ' · Posicionamentos Advantage+'}`} />
            ))}
          </dl>
        </motion.div>
        <motion.div variants={rise} className="card review-card">
          <h3>Anúncios ({config.ads.length}) <button type="button" className="btn btn-ghost btn-sm" onClick={() => onJump(5)}>Editar</button></h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {config.ads.map((ad) => (
              <div key={ad.key} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                {mediaThumb(ad.media) || ad.post?.picture ? <img className="thumb" src={ad.source === 'existing' ? ad.post?.picture : mediaThumb(ad.media)} alt="" referrerPolicy="no-referrer" /> : <span className="thumb" />}
                <span style={{ minWidth: 0 }}><strong style={{ fontSize: 12.5 }}>{applyPlaceholders(ad.name, config, ad)}</strong><div className="hint" style={{ margin: 0 }}>{ad.source === 'existing' ? `Publicação existente do ${ad.post?.platform === 'instagram' ? 'Instagram' : 'Facebook'}` : ad.media ? (ad.media.kind === 'video' ? 'Vídeo' : 'Imagem') : 'sem mídia'}{ad.storyMedia && ad.source !== 'existing' ? ' + arte de stories' : ''}{ad.adsetKeys?.length ? ` · ${ad.adsetKeys.length} conjunto(s)` : ''}</div></span>
              </div>
            ))}
          </div>
          <div className="hint">Total: {totalAds(config)} anúncio(s) na Meta em {config.adsets.length} conjunto(s).</div>
        </motion.div>
      </motion.div>

      <div className="q" style={{ marginTop: 22 }}>
        <div className="q-label">Como publicar</div>
        <div className="publish-choice">
          <button type="button" className={`choice choice-big ${publishStatus === 'PAUSED' ? 'on' : ''}`} onClick={() => setPublishStatus('PAUSED')}>
            <div className="choice-title">Publicar pausada (recomendado)</div>
            <div className="choice-sub">Tudo é criado na Meta, mas nada é veiculado até você ativar no Gerenciador.</div>
            {publishStatus === 'PAUSED' && <span className="check"><CheckIcon /></span>}
          </button>
          <button type="button" className={`choice choice-big ${publishStatus === 'ACTIVE' ? 'on' : ''}`} onClick={() => setPublishStatus('ACTIVE')}>
            <div className="choice-title">Publicar ativa</div>
            <div className="choice-sub">Entra em análise e começa a gastar assim que a Meta aprovar.</div>
            {publishStatus === 'ACTIVE' && <span className="check"><CheckIcon /></span>}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={onValidate} disabled={!ok || busy}>Validar na Meta (sem criar nada)</button>
        {validation && (
          <span className={`tag ${validation.meta?.ok ? 'good' : 'critical'}`}>
            {validation.meta?.ok ? 'A Meta aceitou a configuração da campanha' : validation.meta?.message || 'Há pendências'}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <motion.button type="button" className="btn btn-primary btn-lg" onClick={onPublish} disabled={!ok || busy || !assets} whileHover={{ scale: ok ? 1.02 : 1 }} whileTap={{ scale: 0.98 }}>
          Publicar na Meta
        </motion.button>
      </div>
    </div>
  );
}

function FragmentRow({ label, value }) {
  return <><dt>{label}</dt><dd>{value}</dd></>;
}

export { useCanvaVehicles } from './kit.jsx';
