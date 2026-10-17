import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import {
  adsForAdset, applyPlaceholders, buildTargeting, campaignName, fmtPrice, objectiveOf, totalAds,
} from '../../../shared/esteira.js';
import { api } from '../lib/api.js';
import { fmtBudget, fmtMoney } from '../lib/format.js';
import { rise, stagger } from '../lib/motion.js';
import { Modal } from '../components/Common.jsx';
import { audienceOf } from '../components/AudiencePanel.jsx';
import { AdMock } from '../components/esteira/Preview.jsx';
import { fmtPhone } from '../components/esteira/kit.jsx';
import {
  AlertIcon, BoltIcon, CanvaIcon, CheckIcon, DriveIcon, ExternalIcon, GlobeIcon, PinIcon, RocketIcon, TargetIcon, TrashIcon, UsersIcon, WandIcon,
} from '../components/Icons.jsx';

function adsetAudience(adset) {
  const au = audienceOf(buildTargeting(adset));
  return { ...au, locations: adset.geo?.locations || au.locations, customIn: adset.customAudiences.map((a) => a.name), customOut: adset.excludedAudiences.map((a) => a.name) };
}

function Chips({ items, tone, max = 5 }) {
  if (!items?.length) return <span className="muted">—</span>;
  return <>{items.slice(0, max).map((i) => <span key={i} className={`tag ${tone || ''}`}>{i}</span>)}{items.length > max && <span className="tag">+{items.length - max}</span>}</>;
}

const asInput = (v) => (Array.isArray(v) ? v.join(' | ') : v ?? '');

/**
 * Ajustes da arte nova antes de refazer: a foto do Drive e os textos (campos do layout do cliente — no padrão
 * Auto Prime: marca e modelo, versão, detalhes e preço). Ficam guardados no rascunho para as próximas vezes.
 */
function ArtAdjust({ choice, art, vehicleId, busy, onPick }) {
  const [photoId, setPhotoId] = useState(choice.created?.photoId || choice.drivePhotos?.[0]?.id || null);
  const [vals, setVals] = useState(() => Object.fromEntries((art?.fields || []).map(([k]) => [k, asInput(art?.values?.[vehicleId]?.[k])])));
  if (!art?.fields?.length) return null;
  return (
    <div className="art-adjust">
      <div className="q-label">Foto da arte <small className="muted">(da pasta do carro no Drive)</small></div>
      <div className="mc-row">
        {choice.drivePhotos.slice(0, 16).map((p) => (
          <button key={p.id} type="button" className={`lib-item ${p.id === photoId ? 'on' : ''}`} title={p.name} onClick={() => setPhotoId(p.id)}>
            {p.thumb ? <img src={p.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="ph" />}
          </button>
        ))}
      </div>
      <div className="art-fields">
        {art.fields.map(([k, label]) => (
          <label key={k}>
            <span>{label}</span>
            <input className="field" value={vals[k] ?? ''} onChange={(e) => setVals((cur) => ({ ...cur, [k]: e.target.value }))} />
          </label>
        ))}
      </div>
      <div>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onPick('canva-new', { photoId, overrides: vals })}>
          <CanvaIcon /> {busy ? 'Refazendo a arte…' : 'Refazer a arte com estes ajustes'}
        </button>
      </div>
    </div>
  );
}

/** Alternativas de mídia para um anúncio: fotos do Drive, fotos do site e páginas do design do Canva. */
function MediaChoices({ choice, art, vehicleId, onPick, busy }) {
  const [tab, setTab] = useState(choice?.driveArts?.length ? 'arts' : choice?.drivePhotos?.length ? 'drive' : choice?.canvaPages?.length ? 'canva' : 'site');
  const [adjust, setAdjust] = useState(false);
  if (!choice) return null;
  const tabs = [
    ['arts', <><CanvaIcon /> Artes no Drive ({choice.driveArts?.length || 0})</>, choice.driveArts?.length],
    ['drive', <><DriveIcon /> Fotos no Drive ({choice.drivePhotos?.length || 0})</>, choice.drivePhotos?.length],
    ['canva', <><CanvaIcon /> Canva ({choice.canvaPages?.length || 0})</>, choice.canvaPages?.length],
    ['site', <><GlobeIcon /> Site ({choice.sitePhotos?.length || 0})</>, choice.sitePhotos?.length],
  ].filter((t) => t[2]);
  if (!tabs.length) return null;
  return (
    <div className="media-choices">
      <div className="mc-tabs">
        <span className="hint" style={{ margin: 0 }}>Trocar mídia:</span>
        {tabs.map(([k, label]) => <button key={k} type="button" className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {(tab === 'drive' || tab === 'arts') && choice.driveFolder && <div className="hint">Pasta: {choice.driveFolder.name}</div>}
      {choice.drivePhotos?.length > 0 && (
        <div className="mc-create">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onPick('canva-new', {})} title="Cria a arte (feed e stories) com o layout do cliente e as fotos da pasta do carro no Drive">
            <CanvaIcon /> {busy ? 'Criando a arte…' : choice.created ? 'Criar a arte de novo' : 'Criar arte nova'}
          </button>
          {choice.created?.url && <a className="btn btn-ghost btn-sm" href={choice.created.url} target="_blank" rel="noreferrer">Abrir arte criada no Canva</a>}
          {art?.fields?.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdjust((a) => !a)}>{adjust ? 'Fechar ajustes' : 'Ajustar foto e textos'}</button>}
          <span className="hint" style={{ margin: 0 }}>
            {choice.created
              ? `Criada ${choice.created.engine === 'canva' ? 'pelo modelo do Canva' : 'pela esteira'} com a foto do Drive${choice.created.pickedBy === 'claude' ? ' escolhida pelo Claude' : choice.created.pickedBy === 'revisão' ? ' escolhida por você' : ''}${choice.created.ai ? ' · cenário ampliado com IA' : ''}.`
              : 'Com o layout do cliente e as fotos do Drive.'}
          </span>
        </div>
      )}
      {adjust && choice.drivePhotos?.length > 0 && <ArtAdjust choice={choice} art={art} vehicleId={vehicleId} busy={busy} onPick={onPick} />}
      <div className={`mc-row ${busy ? 'loading-dim' : ''}`}>
        {tab === 'arts' && choice.driveArts.map((p) => (
          <button key={p.id} type="button" className="lib-item" title={p.name} onClick={() => onPick('drive-art', p)}>
            {p.thumb ? <img src={p.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="ph" />}
          </button>
        ))}
        {tab === 'drive' && choice.drivePhotos.map((p) => (
          <button key={p.id} type="button" className="lib-item" title={p.name} onClick={() => onPick('drive', p)}>
            {p.thumb ? <img src={p.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="ph" />}
          </button>
        ))}
        {tab === 'site' && choice.sitePhotos.map((url) => (
          <button key={url} type="button" className="lib-item" onClick={() => onPick('site', url)}>
            <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" />
          </button>
        ))}
        {tab === 'canva' && choice.canvaPages.map((p) => (
          <button key={p.page} type="button" className={`lib-item ${p.format === 'story' ? 'story' : ''}`} title={`Página ${p.page} · ${p.format === 'story' ? 'stories' : 'feed'}`} onClick={() => onPick('canva', { designId: choice.designId, pages: [p] })}>
            {p.thumb ? <img src={p.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="ph" />}
            <span className="kind tag">{p.page} · {p.format === 'story' ? 'stories' : 'feed'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AutoReview() {
  const { draftId } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [assets, setAssets] = useState(null);
  const [editing, setEditing] = useState(null); // adKey
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState('PAUSED');

  useEffect(() => {
    api(`/api/auto/drafts/${draftId}`).then((x) => {
      setD(x);
      api(`/api/builder/assets/${x.accountId}`).then(setAssets, () => {});
    }, (err) => { toast.error('Campanha não encontrada', { description: err.message }); navigate('/automatica', { replace: true }); });
  }, [draftId, navigate]);

  if (!d) return <div className="skeleton" style={{ height: 480 }} />;
  const c = d.config;
  const o = d.origin || {};
  const page = assets?.pages.find((p) => p.id === c.destination.pageId);
  const issueList = Object.values(d.issues || {}).flat();
  const locked = d.stage !== 'draft';

  async function saveConfig(next) {
    const r = await api(`/api/builder/drafts/${draftId}`, { method: 'PATCH', body: { config: next } });
    setD((cur) => ({ ...cur, config: r.config, issues: r.issues }));
  }

  async function pickMedia(ad, from, ref) {
    setBusy(ad.key);
    const creating = from === 'canva-new';
    const tid = creating ? toast.loading('Criando a arte…', { description: d.art?.layout === 'prime' ? 'A IA amplia o cenário da foto do Drive — pode levar cerca de 1 minuto.' : 'Usando as fotos do Drive e o layout do cliente.' }) : undefined;
    try {
      const r = await api(`/api/auto/drafts/${draftId}/media`, { method: 'POST', body: { adKey: ad.key, from, ref } });
      // A criação também atualiza origin.choices (link da arte criada), então guardamos o rascunho inteiro.
      setD((cur) => ({ ...cur, ...r }));
      toast.success(creating ? 'Arte criada' : 'Mídia trocada', { id: tid, description: creating ? 'Feed e stories já estão no anúncio.' : undefined });
    } catch (err) {
      toast.error(creating ? 'Não foi possível criar a arte' : 'Não foi possível trocar a mídia', { id: tid, description: err.message });
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setConfirm(false);
    try {
      await api(`/api/builder/drafts/${draftId}/publish`, { method: 'POST', body: { status, minDailyBudget: assets?.account.minDailyBudget } });
      navigate(`/esteira/${draftId}`);
    } catch (err) {
      toast.error('Não foi possível publicar', { description: err.message });
    }
  }

  async function discard() {
    if (!window.confirm('Descartar esta campanha montada? Nada foi criado na Meta.')) return;
    await api(`/api/builder/drafts/${draftId}`, { method: 'DELETE' });
    navigate('/automatica');
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><Link to="/automatica">Esteira Automática</Link><span>›</span><span>Revisão</span></div>
          <h1>{locked ? 'Campanha enviada' : 'Campanha pronta para aprovar'}</h1>
          <div className="page-sub">
            <span className="mono">{campaignName(c)}</span>
            <span>{d.accountName}</span>
            {o.base && <span className="tag accent" title={o.base.campaignName}>Padrão de “{o.base.campaignName}”{o.base.metrics?.costPerConversation ? ` · ${fmtMoney(o.base.metrics.costPerConversation)}/conversa` : ''}</span>}
          </div>
        </div>
        <div className="controls">
          {!locked && <button type="button" className="btn btn-ghost btn-danger" onClick={discard}><TrashIcon /> Descartar</button>}
          <button type="button" className="btn" onClick={() => navigate(`/esteira/${draftId}`)}><WandIcon /> Ajustar no assistente</button>
          {!locked && (
            <motion.button type="button" className="btn btn-primary" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={issueList.length > 0} onClick={() => setConfirm(true)}>
              <RocketIcon /> Aprovar e publicar
            </motion.button>
          )}
        </div>
      </div>

      {(o.warnings?.length > 0 || issueList.length > 0) && (
        <div className="notice warning" style={{ marginBottom: 16 }}>
          {issueList.length > 0 && <div><strong>Falta ajustar antes de publicar:</strong> {issueList.join(' ')}</div>}
          {o.warnings?.map((w) => <div key={w}><AlertIcon width={13} /> {w}</div>)}
        </div>
      )}

      <motion.div className="review-auto" variants={stagger(0.05)} initial="hidden" animate="show">
        <motion.div variants={rise} className="card review-card">
          <h3>Campanha</h3>
          <dl>
            <dt>Nome</dt><dd className="mono">{campaignName(c)}</dd>
            <dt>Objetivo</dt><dd>{objectiveOf(c).label} · Apps de mensagem → WhatsApp</dd>
            <dt>Orçamento</dt><dd>{c.budget.level === 'campaign' ? fmtBudget({ [c.budget.type === 'lifetime' ? 'lifetime' : 'daily']: c.budget.amount }, 'BRL') : `Por conjunto (${c.adsets.map((a) => fmtMoney(a.amount)).join(' + ')})`}</dd>
            <dt>Estrutura</dt><dd>{c.adsets.length} conjunto(s) · {totalAds(c)} anúncio(s){o.mode === 'multi' ? ` · ${o.structure === 'adsetPerCar' ? '1 conjunto por carro' : 'públicos × anúncios'}` : ''}</dd>
            <dt>Textos</dt><dd>{o.copySource === 'claude' ? 'Escritos pela Claude no estilo do cliente' : o.copySource === 'ollama' ? 'Escritos pela LLM local no estilo do cliente' : 'Texto-modelo com os dados do site'}</dd>
          </dl>
        </motion.div>
        <motion.div variants={rise} className="card review-card">
          <h3>Destino</h3>
          <dl>
            <dt>Página</dt><dd>{c.destination.pageName || '—'}{c.destination.instagramUsername ? ` · @${c.destination.instagramUsername}` : ''}</dd>
            <dt>WhatsApp</dt><dd className="mono">{c.destination.whatsappNumber ? fmtPhone(c.destination.whatsappNumber) : 'Número da página'}</dd>
            <dt>Saudação</dt><dd>{applyPlaceholders(c.destination.greeting, c)}</dd>
            <dt>Mensagem do cliente</dt><dd>{applyPlaceholders(c.destination.autofill, c, c.ads[0])}</dd>
          </dl>
        </motion.div>
        <motion.div variants={rise} className="card review-card">
          <h3>Veículo(s) no site</h3>
          <div className="auto-vehicles">
            {(o.vehicles || []).map((v) => (
              <a key={v.id} href={v.url || '#'} target="_blank" rel="noreferrer" className="auto-vehicle">
                {v.thumb ? <img src={v.thumb} alt="" referrerPolicy="no-referrer" /> : <span />}
                <span><strong>{v.title}</strong><small>{[v.price ? fmtPrice(v.price) : 'sem preço', v.km ? `${v.km} km` : null, v.year].filter(Boolean).join(' · ')}</small></span>
                {v.url && <ExternalIcon />}
              </a>
            ))}
          </div>
        </motion.div>
      </motion.div>

      <section className="section">
        <div className="section-head"><div><h2><TargetIcon /> Públicos ({c.adsets.length})</h2><p>Vindos da campanha de referência do cliente.</p></div></div>
        <motion.div className="aud-grid" variants={stagger(0.04)} initial="hidden" animate="show">
          {c.adsets.map((a) => {
            const au = adsetAudience(a);
            return (
              <motion.div key={a.key} variants={rise} className="card aud-card">
                <div className="aud-head"><div style={{ minWidth: 0, flex: 1 }}><div className="aud-name">{applyPlaceholders(a.name, c)}</div><span className="hint" style={{ margin: 0 }}>{adsForAdset(c, a).length} anúncio(s){c.budget.level === 'adset' ? ` · ${fmtMoney(a.amount)}/dia` : ''}</span></div></div>
                <div className="aud-body">
                  <div className="aud-row"><span className="aud-k"><PinIcon /> Localização</span><span className="aud-v"><Chips items={au.locations.filter((l) => !l.excluded).map((l) => `${l.name}${l.radius ? ` +${l.radius} km` : ''}`)} max={4} /></span></div>
                  <div className="aud-row"><span className="aud-k">Idade</span><span className="aud-v"><span className="tag">{au.ageMin}–{au.ageMax}{au.ageMax >= 65 ? '+' : ''} anos</span>{au.advantage && <span className="tag accent">Advantage+</span>}</span></div>
                  <div className="aud-row"><span className="aud-k"><TargetIcon /> Interesses</span><span className="aud-v"><Chips items={[...au.interests, ...au.otherDetailed]} /></span></div>
                  <div className="aud-row"><span className="aud-k"><UsersIcon /> Públicos</span><span className="aud-v"><Chips items={au.customIn} tone="good" max={3} />{au.customOut.length > 0 && <Chips items={au.customOut.map((x) => `exceto ${x}`)} tone="critical" max={2} />}</span></div>
                  <div className="aud-row"><span className="aud-k">Dispositivos</span><span className="aud-v"><span className={`tag ${au.device.kind === 'all' ? '' : 'accent'}`}>{au.device.label}</span></span></div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      <section className="section">
        <div className="section-head"><div><h2><BoltIcon /> Anúncios ({c.ads.length})</h2><p>Prévia como vai aparecer no feed. Troque a mídia ou edite o texto aqui mesmo.</p></div></div>
        <div className="auto-ads">
          {c.ads.map((ad, i) => (
            <motion.div key={ad.key} className="card auto-ad" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <AdMock config={c} ad={ad} page={page} />
              <div className="auto-ad-side">
                <div className="auto-ad-head">
                  <strong>{applyPlaceholders(ad.name, c, ad)}</strong>
                  {ad.storyMedia && <span className="tag good"><CheckIcon /> arte de stories</span>}
                  {!ad.media && <span className="tag warning">sem mídia</span>}
                </div>
                {editing === ad.key ? (
                  <EditTexts ad={ad} onCancel={() => setEditing(null)} onSave={async (patch) => { await saveConfig({ ...c, ads: c.ads.map((x) => (x.key === ad.key ? { ...x, ...patch } : x)) }); setEditing(null); toast.success('Texto salvo'); }} />
                ) : (
                  <>
                    <pre className="auto-text">{applyPlaceholders(ad.primaryText, c, ad)}</pre>
                    {!locked && <button type="button" className="btn btn-sm" onClick={() => setEditing(ad.key)}><WandIcon /> Editar texto</button>}
                  </>
                )}
                {!locked && <MediaChoices choice={o.choices?.[ad.vehicleId]} art={d.art} vehicleId={ad.vehicleId} busy={busy === ad.key} onPick={(from, ref) => pickMedia(ad, from, ref)} />}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Aprovar e publicar na Meta?"
        subtitle={d.accountName}
        footer={(
          <>
            <button type="button" className="btn" onClick={() => setConfirm(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={publish}><RocketIcon /> {status === 'ACTIVE' ? 'Publicar ativa' : 'Publicar pausada'}</button>
          </>
        )}
      >
        <p style={{ marginTop: 0 }}>Serão criados 1 campanha, {c.adsets.length} conjunto(s) e {totalAds(c)} anúncio(s).</p>
        <div className="publish-choice">
          <button type="button" className={`choice choice-big ${status === 'PAUSED' ? 'on' : ''}`} onClick={() => setStatus('PAUSED')}>
            <div className="choice-title">Publicar pausada (recomendado)</div>
            <div className="choice-sub">Tudo é criado na Meta, mas nada é veiculado até você ativar.</div>
            {status === 'PAUSED' && <span className="check"><CheckIcon /></span>}
          </button>
          <button type="button" className={`choice choice-big ${status === 'ACTIVE' ? 'on' : ''}`} onClick={() => setStatus('ACTIVE')}>
            <div className="choice-title">Publicar ativa</div>
            <div className="choice-sub">Entra em análise e começa a gastar assim que a Meta aprovar.</div>
            {status === 'ACTIVE' && <span className="check"><CheckIcon /></span>}
          </button>
        </div>
      </Modal>
    </>
  );
}

function EditTexts({ ad, onSave, onCancel }) {
  const [primaryText, setPrimaryText] = useState(ad.primaryText);
  const [headline, setHeadline] = useState(ad.headline);
  const [saving, setSaving] = useState(false);
  return (
    <div>
      <div className="q" style={{ marginBottom: 10 }}>
        <label>Texto principal</label>
        <textarea className="field" rows={9} value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} />
        <div className="hint">Variáveis: {'{OFERTA}'} {'{oferta}'} {'{preco}'} {'{km}'} {'{ano}'}</div>
      </div>
      <div className="q" style={{ marginBottom: 10 }}>
        <label>Título</label>
        <input className="field" style={{ width: '100%' }} value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={async () => { setSaving(true); try { await onSave({ primaryText, headline }); } finally { setSaving(false); } }}>Salvar</button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
