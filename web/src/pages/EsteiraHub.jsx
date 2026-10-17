import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useOutlet, useSearchParams } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { toast } from 'sonner';
import { api, useApi } from '../lib/api.js';
import { fmtBudget, fmtInt, fmtMoney, fmtPct } from '../lib/format.js';
import { EASE_OUT, rise, spring, stagger, trackSpotlight } from '../lib/motion.js';
import { STEPS } from '../../../shared/esteira.js';
import { Modal } from '../components/Common.jsx';
import { SaveTemplateModal } from '../components/SaveTemplateModal.jsx';
import { NewItemModal } from '../components/esteira/NewItemModal.jsx';
import {
  BoltIcon, ConveyorIcon, CopyIcon, ImageIcon, LayersIcon, PlusIcon, SearchIcon, StarIcon, TrashIcon, VideoIcon, XIcon,
} from '../components/Icons.jsx';

const LANES = [
  { key: 'montando', title: 'Montando', desc: 'Respondendo as etapas da esteira' },
  { key: 'pronta', title: 'Pronta para publicar', desc: 'Tudo preenchido — falta publicar' },
  { key: 'publicada', title: 'Publicada', desc: 'Na Meta, pausada ou em análise' },
  { key: 'teste', title: 'Em teste', desc: 'Ativa e gerando resultados' },
  { key: 'modelo', title: 'Virou modelo', desc: 'Configuração guardada para reutilizar' },
];

import { mediaThumb } from '../components/esteira/kit.jsx';
import { BeltRiders, PlatformStrip } from '../components/Decor.jsx';

function DraftCard({ d, onOpen, onDuplicate, onDelete, onTemplate }) {
  const thumb = mediaThumb(d.thumb);
  const progress = d.column === 'montando' ? Math.min(d.step, STEPS.length - 1) / (STEPS.length - 1) : 1;
  const m = d.live?.metrics;
  return (
    <motion.div
      layoutId={`draft-${d.id}`}
      layout
      transition={spring}
      className={`dcard ${d.stage === 'publishing' ? 'publishing' : ''}`}
      onClick={() => onOpen(d)}
      whileHover={{ y: -2 }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(d)}
    >
      <div className="dcard-top">
        {thumb
          ? <img className="dcard-thumb" src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
          : <span className="dcard-thumb">{d.thumb?.kind === 'video' ? <VideoIcon /> : <ImageIcon />}</span>}
        <div style={{ minWidth: 0 }}>
          <div className="dcard-title">{d.title}</div>
          <div className="dcard-acc">{d.accountName || 'Conta não escolhida'}</div>
        </div>
      </div>
      <div className="dcard-meta">
        {d.budget?.amount > 0 && d.budget.level === 'campaign' && <span className="tag">{fmtBudget({ [d.budget.type === 'lifetime' ? 'lifetime' : 'daily']: d.budget.amount }, 'BRL')}</span>}
        <span className="tag">{d.adsets} conj. · {d.ads} anúncio(s)</span>
        {d.fromTemplate && <span className="tag accent" title={`Modelo: ${d.fromTemplate.name}`}><StarIcon /> modelo</span>}
        {d.origin?.type === 'auto' && <span className="tag accent" title="Montada pela Esteira Automática"><BoltIcon /> automática</span>}
        {d.stage === 'publishing' && <span className="tag accent">Publicando…</span>}
        {d.stage === 'failed' && <span className="tag critical">Falhou</span>}
        {d.column === 'montando' && d.issues > 0 && <span className="tag warning">{d.issues} pendência(s)</span>}
        {d.column === 'publicada' && <span className="tag warning">{d.live?.effectiveStatus === 'PAUSED' ? 'Pausada' : (d.live?.effectiveStatus || 'Na Meta').replace(/_/g, ' ').toLowerCase()}</span>}
      </div>
      {d.column === 'montando' && <div className="dcard-progress"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: progress }} transition={{ duration: 0.6, ease: EASE_OUT }} /></div>}
      {m && (d.column === 'teste' || d.column === 'modelo' || d.column === 'publicada') && (
        <div className="dcard-metrics">
          <div>Investido<strong>{fmtMoney(m.spend)}</strong></div>
          <div>Conversas<strong>{fmtInt(m.conversations)}</strong></div>
          <div>Custo/conv.<strong>{m.costPerConversation != null ? fmtMoney(m.costPerConversation) : '—'}</strong></div>
        </div>
      )}
      <div className="dcard-actions" onClick={(e) => e.stopPropagation()}>
        {d.stage === 'published' && !d.templateId && (
          <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Salvar como modelo" onClick={() => onTemplate(d)}><StarIcon filled={false} /></button>
        )}
        <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Duplicar" onClick={() => onDuplicate(d)}><CopyIcon /></button>
        {d.stage !== 'publishing' && (
          <button type="button" className="btn btn-ghost btn-icon btn-sm btn-danger" title="Excluir da esteira" onClick={() => onDelete(d)}><TrashIcon /></button>
        )}
      </div>
    </motion.div>
  );
}

function Board({ drafts, onOpen, onDuplicate, onDelete, onTemplate }) {
  return (
    <LayoutGroup>
      <div className="board">
        {LANES.map((lane) => {
          const items = drafts.filter((d) => d.column === lane.key);
          return (
            <div key={lane.key} className="lane" data-lane={lane.key}>
              <div className="lane-head">
                <span className="lane-dot" />
                <h3>{lane.title}</h3>
                <span className="count">{items.length}</span>
              </div>
              <div className="lane-desc">{lane.desc}</div>
              <div className="lane-body">
                <AnimatePresence mode="popLayout">
                  {items.map((d) => (
                    <DraftCard key={d.id} d={d} onOpen={onOpen} onDuplicate={onDuplicate} onDelete={onDelete} onTemplate={onTemplate} />
                  ))}
                </AnimatePresence>
                {items.length === 0 && <div className="lane-empty">Nenhuma campanha aqui</div>}
              </div>
            </div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

function TemplateCard({ t, onUse, onDelete }) {
  const thumbs = t.config.ads.map((a) => mediaThumb(a.media)).filter(Boolean).slice(0, 3);
  const p = t.performance;
  const savings = p?.costPerConversation && p.accountCostPerConversation ? (1 - p.costPerConversation / p.accountCostPerConversation) * 100 : null;
  return (
    <motion.div variants={rise} className="card tpl spotlight tilt" data-tilt="5" onMouseMove={trackSpotlight} whileHover={{ y: -3 }}>
      <div className="tpl-mosaic">
        {[0, 1, 2].map((i) => (thumbs[i] ? <img key={i} src={thumbs[i]} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span key={i} className="ph" />))}
        {savings != null && savings > 0 && <span className="badge tag good">{fmtPct(savings, 0)} abaixo da média</span>}
      </div>
      <div className="tpl-body">
        <div className="tpl-name">{t.name}</div>
        <div className="tpl-acc">{t.accountName} · {t.source?.type === 'campaign' ? 'capturado de campanha' : 'salvo da esteira'}</div>
        <div className="tpl-stats">
          {p?.costPerConversation != null && <span className="tag accent">{fmtMoney(p.costPerConversation)}/conversa</span>}
          {p?.conversations > 0 && <span className="tag">{fmtInt(p.conversations)} conversas</span>}
          <span className="tag">{t.config.adsets.length} conj. · {t.config.ads.length} anúncio(s)</span>
          {t.usageCount > 0 && <span className="tag">usado {t.usageCount}×</span>}
        </div>
      </div>
      <div className="tpl-foot">
        <button type="button" className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onUse(t)}><ConveyorIcon /> Usar modelo</button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm btn-danger" title="Excluir modelo" onClick={() => onDelete(t)}><TrashIcon /></button>
      </div>
    </motion.div>
  );
}

function Suggestion({ s, onSave, onDismiss }) {
  return (
    <motion.div variants={rise} className="card sugg spotlight" onMouseMove={trackSpotlight}>
      <div className="sugg-saving">−{fmtPct(s.savingsPct, 0)}<small>custo/conversa vs. média da conta</small></div>
      <div>
        <div className="sugg-name" title={s.campaignName}>{s.campaignName}</div>
        <div className="tpl-acc">{s.accountName}</div>
      </div>
      <div className="sugg-compare">
        <div>Esta campanha<strong>{fmtMoney(s.costPerConversation)}</strong></div>
        <div>Média da conta<strong>{fmtMoney(s.accountCostPerConversation)}</strong></div>
      </div>
      <div className="sugg-bars" aria-hidden="true">
        <motion.span className="mine" initial={{ scaleX: 0 }} whileInView={{ scaleX: s.costPerConversation / s.accountCostPerConversation }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE_OUT }} />
        <motion.span className="avg" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE_OUT }} />
      </div>
      <div className="tpl-acc">{fmtInt(s.conversations)} conversas · {fmtMoney(s.spend)} investidos nos últimos 30 dias</div>
      <div className="sugg-actions">
        <button type="button" className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onSave(s)}><StarIcon /> Salvar como modelo</button>
        <button type="button" className="btn btn-ghost btn-sm" title="Dispensar sugestão" onClick={() => onDismiss(s)}><XIcon /></button>
      </div>
    </motion.div>
  );
}

/** Modal "Nova campanha": escolhe a conta e, em seguida, um modelo dela ou começa do zero. */
function NewCampaignModal({ open, onClose, presetAccount, onCreate, onPickTemplate }) {
  const [accounts, setAccounts] = useState(null);
  const [account, setAccount] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccount(null);
    setTemplates(null);
    setTerm('');
    api('/api/meta/account-list').then((list) => {
      const active = list.filter((a) => a.status === 1);
      setAccounts(active);
      if (presetAccount) setAccount(active.find((a) => a.id === presetAccount) || null);
    }, () => setAccounts([]));
  }, [open, presetAccount]);

  useEffect(() => {
    if (!account) return;
    setTemplates(null);
    api(`/api/builder/templates?accountId=${account.id}`).then(setTemplates, () => setTemplates([]));
  }, [account]);

  async function create(templateId) {
    setBusy(true);
    try {
      await onCreate({ accountId: account.id, accountName: account.name, templateId });
    } finally {
      setBusy(false);
    }
  }

  const filtered = (accounts || []).filter((a) => a.name.toLowerCase().includes(term.trim().toLowerCase()));

  return (
    <Modal open={open} onClose={onClose} wide title={account ? `Nova campanha · ${account.name}` : 'Nova campanha'} subtitle={account ? 'Comece de um modelo que deu certo nesta conta ou monte do zero.' : 'Para qual cliente é a campanha?'}>
      <AnimatePresence mode="wait">
        {!account ? (
          <motion.div key="acc" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <div className="combo" style={{ marginBottom: 14 }}>
              <input className="field" style={{ width: '100%', paddingLeft: 36 }} placeholder="Buscar conta" value={term} onChange={(e) => setTerm(e.target.value)} />
              <span style={{ position: 'absolute', left: 12, top: 10, color: 'var(--muted)', width: 16 }}><SearchIcon /></span>
            </div>
            {!accounts && <div className="skeleton" style={{ height: 160 }} />}
            <motion.div className="choice-grid" variants={stagger(0.03)} initial="hidden" animate="show">
              {filtered.map((a) => (
                <motion.button variants={rise} key={a.id} type="button" className="choice" onClick={() => setAccount(a)}>
                  <span className="avatar" style={{ width: 34, height: 34 }}>{a.name.replace(/[^A-Za-zÀ-ú]/g, '').slice(0, 2).toUpperCase()}</span>
                  <span style={{ minWidth: 0 }}>
                    <div className="choice-title">{a.name}</div>
                    <div className="choice-sub mono">{a.id}</div>
                  </span>
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        ) : (
          <motion.div key="tpl" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}>
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setAccount(null)}>← Trocar conta</button>
            <div className="choice-grid">
              <button type="button" className="choice choice-big" onClick={() => create(null)} disabled={busy}>
                <span className="kpi-icon"><PlusIcon /></span>
                <div className="choice-title">Começar do zero</div>
                <div className="choice-sub">Responda as etapas da esteira e monte a campanha.</div>
              </button>
              {templates === null && [0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}
              {templates?.map((t) => (
                <button key={t.id} type="button" className="choice choice-big" onClick={() => onPickTemplate(t)} disabled={busy}>
                  <span className="kpi-icon" style={{ color: 'var(--gold)' }}><StarIcon /></span>
                  <div className="choice-title">{t.name}</div>
                  <div className="choice-sub">
                    {t.performance?.costPerConversation != null ? `${fmtMoney(t.performance.costPerConversation)}/conversa · ` : ''}
                    {t.config.adsets.length} conj. · {t.config.ads.length} anúncio(s)
                  </div>
                </button>
              ))}
            </div>
            {templates?.length === 0 && <p className="hint" style={{ marginTop: 12 }}>Esta conta ainda não tem modelos. Salve campanhas que deram certo como modelo para reutilizar aqui.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

export function EsteiraHub() {
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
  const [params, setParams] = useSearchParams();
  const drafts = useApi('/api/builder/drafts');
  const suggestions = useApi('/api/builder/suggestions');
  const templates = useApi('/api/builder/templates');
  const [accountFilter, setAccountFilter] = useState('all');
  const [saving, setSaving] = useState(null);
  const [dismissed, setDismissed] = useState(() => new Set());
  const [using, setUsing] = useState(null); // modelo aguardando o novo item
  const [creating, setCreating] = useState(false);
  const newOpen = params.get('nova') === '1';

  // Atualiza o quadro quando o assistente fecha ou uma publicação termina.
  useEffect(() => {
    const onChange = () => drafts.refresh();
    window.addEventListener('esteira:drafts-changed', onChange);
    return () => window.removeEventListener('esteira:drafts-changed', onChange);
  }, [drafts.refresh]);

  const publishing = drafts.data?.some((d) => d.stage === 'publishing');
  useEffect(() => {
    if (!publishing) return undefined;
    const t = setInterval(() => drafts.refresh(), 4000);
    return () => clearInterval(t);
  }, [publishing, drafts.refresh]);

  // ?modelo=<id> cria um rascunho direto do modelo (atalho do toast "Usar agora").
  useEffect(() => {
    const templateId = params.get('modelo');
    if (!templateId) return;
    setParams((p) => { p.delete('modelo'); return p; }, { replace: true });
    api('/api/builder/templates').then((list) => {
      const t = list.find((x) => x.id === templateId);
      if (t) setUsing(t);
    }, () => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (location.hash === '#modelos') setTimeout(() => document.getElementById('modelos')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, [location.hash]);

  async function createDraft(body) {
    setCreating(true);
    try {
      const draft = await api('/api/builder/drafts', { method: 'POST', body });
      setParams((p) => { p.delete('nova'); p.delete('conta'); return p; }, { replace: true });
      drafts.refresh();
      navigate(`/esteira/${draft.id}`);
    } catch (err) {
      toast.error('Não foi possível criar a campanha', { description: err.message });
    } finally {
      setCreating(false);
    }
  }

  async function duplicate(d) {
    const copy = await api(`/api/builder/drafts/${d.id}/duplicate`, { method: 'POST' });
    toast.success('Campanha duplicada', { description: copy.title });
    drafts.refresh();
  }

  async function remove(d) {
    if (!window.confirm(`Excluir "${d.title}" da esteira?${d.stage === 'published' ? ' A campanha continua existindo na Meta.' : ''}`)) return;
    await api(`/api/builder/drafts/${d.id}`, { method: 'DELETE' });
    drafts.refresh();
  }

  async function draftToTemplate(d) {
    try {
      const t = await api(`/api/builder/drafts/${d.id}/to-template`, { method: 'POST', body: {} });
      toast.success('Modelo salvo', { description: t.name });
      drafts.refresh();
      templates.refresh();
    } catch (err) {
      toast.error('Não foi possível salvar o modelo', { description: err.message });
    }
  }

  async function deleteTemplate(t) {
    if (!window.confirm(`Excluir o modelo "${t.name}"?`)) return;
    await api(`/api/builder/templates/${t.id}`, { method: 'DELETE' });
    templates.refresh();
  }

  async function dismiss(s) {
    setDismissed((prev) => new Set(prev).add(s.campaignId));
    await api(`/api/builder/suggestions/${s.campaignId}/dismiss`, { method: 'POST' }).catch(() => {});
  }

  const accountOptions = useMemo(() => {
    const map = new Map();
    for (const t of templates.data || []) map.set(t.accountId, t.accountName);
    for (const d of drafts.data || []) if (d.accountId) map.set(d.accountId, d.accountName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [templates.data, drafts.data]);

  const byAccount = (x) => accountFilter === 'all' || x.accountId === accountFilter;
  const draftList = (drafts.data || []).filter(byAccount);
  const suggList = (suggestions.data?.items || []).filter((s) => byAccount(s) && !dismissed.has(s.campaignId));
  const tplList = (templates.data || []).filter(byAccount);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Linha de montagem</div>
          <h1><span className="grad">Esteira de Campanha</span></h1>
          <div className="page-sub">Monte campanhas de WhatsApp em etapas, a partir dos modelos que deram certo em cada cliente. <PlatformStrip /></div>
        </div>
        <div className="controls">
          <select className="field" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} aria-label="Filtrar por conta">
            <option value="all">Todas as contas</option>
            {accountOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => setParams((p) => { p.set('nova', '1'); return p; })}>
            <PlusIcon /> Nova campanha
          </button>
        </div>
      </div>

      <BeltRiders moving={publishing} />

      {drafts.error && <div className="notice critical" style={{ marginBottom: 12 }}>{drafts.error.message}</div>}
      {!drafts.data ? <div className="skeleton" style={{ height: 260 }} /> : (
        <Board
          drafts={draftList}
          onOpen={(d) => (d.stage === 'published' && d.publish?.campaignId ? navigate(`/campanha/${d.publish.campaignId}`) : navigate(`/esteira/${d.id}`))}
          onDuplicate={duplicate}
          onDelete={remove}
          onTemplate={draftToTemplate}
        />
      )}

      <section className="section">
        <div className="section-head">
          <div>
            <h2><StarIcon /> Campanhas que deram certo</h2>
            <p>Custo por conversa pelo menos 10% abaixo da média da própria conta, com 15+ conversas nos últimos 30 dias.</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={suggestions.refresh} disabled={suggestions.loading}>Atualizar</button>
        </div>
        {!suggestions.data && !suggestions.error && <div className="strip">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 250 }} />)}</div>}
        {suggestions.error && <div className="notice critical">{suggestions.error.message}</div>}
        {suggestions.data && suggList.length === 0 && <div className="empty">Nenhuma sugestão nova agora. Assim que uma campanha se destacar na conta, ela aparece aqui.</div>}
        <motion.div className="strip" variants={stagger(0.05)} initial="hidden" animate={suggestions.data ? 'show' : 'hidden'}>
          <AnimatePresence>
            {suggList.map((s) => (
              <Suggestion
                key={s.campaignId}
                s={s}
                onDismiss={dismiss}
                onSave={() => setSaving({ id: s.campaignId, name: s.campaignName, accountName: s.accountName, currency: 'BRL', metrics: { costPerConversation: s.costPerConversation, conversations: s.conversations } })}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      </section>

      <section className="section" id="modelos">
        <div className="section-head">
          <div>
            <h2><LayersIcon /> Modelos por conta</h2>
            <p>Cada modelo pertence a um cliente e guarda público, orçamento, página, WhatsApp, mensagens e criativos.</p>
          </div>
        </div>
        {!templates.data && <div className="tpl-grid">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 290 }} />)}</div>}
        {templates.data && tplList.length === 0 && <div className="empty">Nenhum modelo ainda. Salve uma campanha que deu certo — pela sugestão acima, pela tabela da conta ou pela página da campanha.</div>}
        <motion.div className="tpl-grid" variants={stagger(0.05)} initial="hidden" animate={templates.data ? 'show' : 'hidden'}>
          {tplList.map((t) => <TemplateCard key={t.id} t={t} onUse={() => setUsing(t)} onDelete={deleteTemplate} />)}
        </motion.div>
      </section>

      <NewCampaignModal
        open={newOpen}
        presetAccount={params.get('conta')}
        onClose={() => setParams((p) => { p.delete('nova'); p.delete('conta'); return p; }, { replace: true })}
        onCreate={createDraft}
        onPickTemplate={(t) => { setParams((p) => { p.delete('nova'); p.delete('conta'); return p; }, { replace: true }); setUsing(t); }}
      />
      <NewItemModal
        open={Boolean(using)}
        template={using}
        busy={creating}
        onClose={() => setUsing(null)}
        onConfirm={async (offer) => { await createDraft({ templateId: using.id, offer }); setUsing(null); }}
      />
      <SaveTemplateModal campaign={saving} onClose={() => setSaving(null)} onSaved={() => { templates.refresh(); suggestions.refresh(); }} />

      <AnimatePresence>{outlet && <motion.div key={location.pathname}>{outlet}</motion.div>}</AnimatePresence>
    </>
  );
}

