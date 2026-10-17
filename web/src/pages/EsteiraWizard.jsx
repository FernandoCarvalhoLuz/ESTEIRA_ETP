import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { STEPS, campaignName, totalAds, validateConfig } from '../../../shared/esteira.js';
import { api } from '../lib/api.js';
import { EASE_OUT } from '../lib/motion.js';
import { Modal } from '../components/Common.jsx';
import {
  AlertIcon, CheckIcon, ChevronLeft, ChevronRight, ExternalIcon, RocketIcon, XIcon,
} from '../components/Icons.jsx';
import { Rail } from '../components/esteira/Rail.jsx';
import { PreviewPanel } from '../components/esteira/Preview.jsx';
import {
  StepCriativos, StepDestino, StepModelo, StepOferta, StepOrcamento, StepPublico, StepRevisao, useCanvaVehicles,
} from '../components/esteira/Steps.jsx';

const slide = {
  enter: (dir) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE_OUT } },
  exit: (dir) => ({ opacity: 0, x: dir * -40, transition: { duration: 0.18 } }),
};

function Burst() {
  const colors = ['var(--accent)', 'var(--accent-2)', 'var(--good)', 'var(--gold)', '#fff3c4'];
  return (
    <div className="burst" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => {
        const angle = (i / 28) * Math.PI * 2;
        const dist = 120 + (i % 5) * 28;
        return (
          <motion.i
            key={i}
            style={{ background: colors[i % colors.length] }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: 0, rotate: 220, scale: 0.6 }}
            transition={{ duration: 1.3, ease: EASE_OUT, delay: (i % 4) * 0.03 }}
          />
        );
      })}
    </div>
  );
}

function PublishOverlay({ draft, onRetry, onCleanup, onClose, onViewCampaign, busy }) {
  const p = draft.publish;
  const done = draft.stage === 'published';
  const failed = draft.stage === 'failed';
  const accountNum = draft.config.accountId.replace('act_', '');
  return (
    <motion.div className="publish-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="card publish-panel" initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: 0.4, ease: EASE_OUT }} style={{ position: 'relative' }}>
        {done && !p.warnings?.length && <Burst />}
        <div className={`belt ${!done && !failed ? 'moving' : ''}`} style={{ margin: '0 0 18px' }} aria-hidden="true" />
        <h2>{done ? (p.warnings?.length ? 'Campanha criada, mas a Meta recusou anúncios' : 'Campanha criada na Meta!') : failed ? 'A publicação parou no meio' : 'Montando sua campanha na Meta…'}</h2>
        <p>{done ? (p.status === 'ACTIVE' ? 'Ela entrou em análise e começa a veicular quando a Meta aprovar.' : 'Ela está pausada. Revise no Gerenciador e ative quando quiser.') : failed ? 'Nada foi perdido: o que já foi criado fica guardado e a nova tentativa continua de onde parou.' : campaignName(draft.config)}</p>
        <div className="pub-steps">
          {p.steps.map((s, i) => (
            <motion.div key={s.key} className={`pub-step ${s.state}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
              <span className="node">
                {s.state === 'done' && (
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <motion.path d="M20 6 9 17l-5-5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }} />
                  </svg>
                )}
                {s.state === 'error' && <XIcon />}
              </span>
              <span className="tx">
                <strong>{s.label}</strong>
                {s.detail && <span>{s.detail}</span>}
              </span>
            </motion.div>
          ))}
        </div>
        {failed && p.error && <div className="notice critical" style={{ textAlign: 'left', marginBottom: 16 }}><AlertIcon width={14} /> {p.error}</div>}
        {done && p.warnings?.length > 0 && (
          <div className="notice critical" style={{ textAlign: 'left', marginBottom: 16 }}>
            <AlertIcon width={14} /> A Meta criou a campanha, mas recusou {p.warnings.length} anúncio(s):
            {[...new Set(p.warnings.map((w) => `${w.message}${w.code ? ` (${w.code})` : ''}`))].map((m) => <div key={m} style={{ marginTop: 4 }}>• {m}</div>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {done && (
            <>
              <a className="btn" href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountNum}&selected_campaign_ids=${p.created.campaignId}`} target="_blank" rel="noreferrer"><ExternalIcon /> Abrir no Gerenciador</a>
              <button type="button" className="btn" onClick={onViewCampaign}>Ver no painel</button>
              <button type="button" className="btn btn-primary" onClick={onClose}><CheckIcon /> Voltar para a esteira</button>
            </>
          )}
          {failed && (
            <>
              {p.created?.campaignId && <button type="button" className="btn btn-danger" onClick={onCleanup} disabled={busy}>Desfazer o que foi criado</button>}
              <button type="button" className="btn" onClick={onClose}>Fechar</button>
              <button type="button" className="btn btn-primary" onClick={onRetry} disabled={busy}>Tentar de novo</button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function EsteiraWizard() {
  const { draftId } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  const [config, setConfigState] = useState(null);
  const [accountName, setAccountName] = useState('');
  const [step, setStepState] = useState(0);
  const [dir, setDir] = useState(1);
  const [saveState, setSaveState] = useState('saved');
  const [assets, setAssets] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [publishStatus, setPublishStatus] = useState('PAUSED');
  const [validation, setValidation] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fromTemplate, setFromTemplate] = useState(null);
  const dirty = useRef(false);
  const canvaVehicles = useCanvaVehicles(config?.accountId);

  // Carrega o rascunho.
  useEffect(() => {
    api(`/api/builder/drafts/${draftId}`).then((d) => {
      setDraft(d);
      setConfigState(d.config);
      setAccountName(d.accountName);
      setStepState(d.step || 0);
      setFromTemplate(d.fromTemplate);
      if (d.publish?.status) setPublishStatus(d.publish.status);
    }, (err) => {
      toast.error('Rascunho não encontrado', { description: err.message });
      navigate('/esteira', { replace: true });
    });
    api('/api/meta/account-list').then(setAccounts, () => setAccounts([]));
  }, [draftId, navigate]);

  // Ativos e modelos da conta escolhida (cada conta é um cliente).
  useEffect(() => {
    if (!config?.accountId) return;
    setAssets(null);
    setTemplates(null);
    api(`/api/builder/assets/${config.accountId}`).then(setAssets, (err) => toast.error('Não foi possível carregar páginas e públicos da conta', { description: err.message }));
    api(`/api/builder/templates?accountId=${config.accountId}`).then(setTemplates, () => setTemplates([]));
  }, [config?.accountId]);

  // Salvamento automático.
  useEffect(() => {
    if (!dirty.current || !config) return undefined;
    setSaveState('saving');
    const t = setTimeout(() => {
      api(`/api/builder/drafts/${draftId}`, { method: 'PATCH', body: { config, step, accountName } })
        .then(() => { dirty.current = false; setSaveState('saved'); }, () => setSaveState('error'));
    }, 700);
    return () => clearTimeout(t);
  }, [config, step, accountName, draftId]);

  // Acompanha a publicação.
  useEffect(() => {
    if (draft?.stage !== 'publishing') return undefined;
    const t = setInterval(() => {
      api(`/api/builder/drafts/${draftId}`).then((d) => {
        setDraft(d);
        if (d.stage !== 'publishing') window.dispatchEvent(new Event('esteira:drafts-changed'));
      }, () => {});
    }, 1200);
    return () => clearInterval(t);
  }, [draft?.stage, draftId]);

  const setConfig = useCallback((next, name) => {
    dirty.current = true;
    setConfigState(next);
    if (name !== undefined) setAccountName(name);
    setValidation(null);
  }, []);

  const update = useCallback((mutator) => {
    dirty.current = true;
    setValidation(null);
    setConfigState((c) => {
      const next = structuredClone(c);
      mutator(next);
      return next;
    });
  }, []);

  const setStep = useCallback((next) => {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, next));
    setDir(clamped >= step ? 1 : -1);
    dirty.current = true;
    setStepState(clamped);
    document.querySelector('.wizard-main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !confirm && !document.querySelector('.modal-overlay')) close();
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') setStep(step + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const issues = useMemo(() => (config ? validateConfig(config, { minDailyBudget: assets?.account.minDailyBudget }) : {}), [config, assets]);

  async function close() {
    if (dirty.current && config) {
      await api(`/api/builder/drafts/${draftId}`, { method: 'PATCH', body: { config, step, accountName } }).catch(() => {});
    }
    window.dispatchEvent(new Event('esteira:drafts-changed'));
    navigate('/esteira');
  }

  async function validate() {
    setBusy(true);
    try {
      await api(`/api/builder/drafts/${draftId}`, { method: 'PATCH', body: { config, step, accountName } });
      dirty.current = false;
      const result = await api(`/api/builder/drafts/${draftId}/validate`, { method: 'POST', body: { minDailyBudget: assets?.account.minDailyBudget } });
      setValidation(result);
    } catch (err) {
      toast.error('Falha na validação', { description: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setConfirm(false);
    setBusy(true);
    try {
      await api(`/api/builder/drafts/${draftId}`, { method: 'PATCH', body: { config, step, accountName } });
      dirty.current = false;
      const d = await api(`/api/builder/drafts/${draftId}/publish`, { method: 'POST', body: { status: publishStatus, minDailyBudget: assets?.account.minDailyBudget } });
      setDraft(d);
      window.dispatchEvent(new Event('esteira:drafts-changed'));
    } catch (err) {
      toast.error('Não foi possível publicar', { description: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    try {
      const d = await api(`/api/builder/drafts/${draftId}/publish`, { method: 'POST', body: { status: publishStatus, minDailyBudget: assets?.account.minDailyBudget } });
      setDraft(d);
    } catch (err) {
      toast.error('Não foi possível retomar', { description: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function cleanup() {
    if (!window.confirm('Apagar da Meta a campanha criada parcialmente? Os conjuntos e anúncios dela também serão apagados.')) return;
    setBusy(true);
    try {
      const d = await api(`/api/builder/drafts/${draftId}/cleanup`, { method: 'POST' });
      setDraft(d);
      toast.success('O que foi criado na Meta foi apagado. Você pode editar e publicar de novo.');
    } catch (err) {
      toast.error('Não foi possível desfazer', { description: err.message });
    } finally {
      setBusy(false);
    }
  }

  const showPublish = draft && (draft.stage === 'publishing' || draft.stage === 'published' || draft.stage === 'failed') && draft.publish;
  const referenceCost = (templates?.find((t) => t.id === fromTemplate?.id) || null)?.performance?.costPerConversation || null;
  const stepProps = { config, update, setConfig, assets, templates, accounts, issues };

  return (
    <motion.div className="wizard-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="wizard" initial={{ y: 40, scale: 0.985, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ duration: 0.45, ease: EASE_OUT }}>
        <div className="wizard-top">
          <span className="kpi-icon" style={{ background: 'var(--accent-wash)', color: 'var(--accent-ink)' }}><RocketIcon /></span>
          <div className="wizard-title">
            <strong>{config ? campaignName(config) : 'Carregando…'}</strong>
            <span>{accountName || 'Escolha a conta'}{fromTemplate ? ` · a partir do modelo "${fromTemplate.name}"` : ''}</span>
          </div>
          <span className="save-state" aria-live="polite">
            <span className={`dot ${saveState === 'saved' ? 'good' : saveState === 'error' ? 'critical' : 'warning pulse'}`} />
            {saveState === 'saved' ? 'Salvo' : saveState === 'error' ? 'Erro ao salvar' : 'Salvando…'}
          </span>
          <button type="button" className="btn btn-ghost btn-icon" onClick={close} aria-label="Fechar"><XIcon /></button>
        </div>

        {config && <Rail step={step} issues={issues} onJump={setStep} />}

        <div className="wizard-body">
          <div className="wizard-main">
            {!config ? <div className="skeleton" style={{ height: 400 }} /> : (
              <AnimatePresence mode="wait" custom={dir}>
                <motion.div key={step} custom={dir} variants={slide} initial="enter" animate="center" exit="exit">
                  {step === 0 && <StepModelo {...stepProps} onTemplateApplied={(t) => setFromTemplate({ id: t.id, name: t.name })} />}
                  {step === 1 && <StepOferta {...stepProps} canvaVehicles={canvaVehicles} />}
                  {step === 2 && <StepDestino {...stepProps} />}
                  {step === 3 && <StepPublico {...stepProps} />}
                  {step === 4 && <StepOrcamento {...stepProps} referenceCost={referenceCost} />}
                  {step === 5 && <StepCriativos {...stepProps} retarget={draft?.retarget} />}
                  {step === 6 && (
                    <StepRevisao
                      {...stepProps}
                      onJump={setStep}
                      onValidate={validate}
                      validation={validation}
                      publishStatus={publishStatus}
                      setPublishStatus={setPublishStatus}
                      onPublish={() => setConfirm(true)}
                      busy={busy}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
          <aside className="wizard-side">{config && <PreviewPanel config={config} assets={assets} />}</aside>
        </div>

        <div className="wizard-foot">
          <button type="button" className="btn" onClick={() => setStep(step - 1)} disabled={step === 0}><ChevronLeft /> Voltar</button>
          <span className="hint" style={{ margin: 0 }}>{STEPS[step].label} · <kbd>Ctrl</kbd> + <kbd>Enter</kbd> avança</span>
          <span className="grow" />
          {issues[STEPS[step].key]?.length > 0 && <span className="tag warning">{issues[STEPS[step].key].length} pendência(s) nesta etapa</span>}
          {step < STEPS.length - 1 && (
            <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>Avançar <ChevronRight /></button>
          )}
        </div>

        <AnimatePresence>
          {showPublish && (
            <PublishOverlay
              draft={draft}
              busy={busy}
              onRetry={retry}
              onCleanup={cleanup}
              onClose={() => { window.dispatchEvent(new Event('esteira:drafts-changed')); navigate('/esteira'); }}
              onViewCampaign={() => navigate(`/campanha/${draft.publish.created.campaignId}`)}
            />
          )}
        </AnimatePresence>
      </motion.div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Publicar na Meta?"
        subtitle={`Conta ${accountName}`}
        footer={(
          <>
            <button type="button" className="btn" onClick={() => setConfirm(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={publish}><RocketIcon /> {publishStatus === 'ACTIVE' ? 'Publicar ativa' : 'Publicar pausada'}</button>
          </>
        )}
      >
        {config && (
          <p style={{ margin: 0 }}>
            Serão criados <strong>1 campanha</strong>, <strong>{config.adsets.length} conjunto(s)</strong>, <strong>{config.ads.length} criativo(s)</strong> e{' '}
            <strong>{totalAds(config)} anúncio(s)</strong>.{' '}
            {publishStatus === 'ACTIVE' ? 'A campanha será ativada e começará a gastar após a aprovação da Meta.' : 'A campanha ficará pausada até você ativá-la.'}
          </p>
        )}
      </Modal>
    </motion.div>
  );
}
