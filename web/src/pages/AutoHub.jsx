import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { fmtPrice } from '../../../shared/esteira.js';
import { api, useApi } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { rise, stagger, trackSpotlight } from '../lib/motion.js';
import { AutoInterview } from '../components/auto/AutoInterview.jsx';
import { BrandLogo } from '../components/Brands.jsx';
import { BeltRiders, PlatformStrip } from '../components/Decor.jsx';
import {
  AlertIcon, BoltIcon, BrainIcon, CanvaIcon, CheckIcon, DriveIcon, GlobeIcon, RefreshIcon, SettingsIcon, XIcon,
} from '../components/Icons.jsx';

const STAGE = { draft: 'Pronta para aprovar', publishing: 'Publicando', published: 'Publicada', failed: 'Falhou' };

function SourceStatus({ settings, clients }) {
  const configured = (clients || []).filter((c) => c.client?.site).length;
  const drives = (clients || []).filter((c) => c.client?.drive).length;
  const items = [
    { icon: <GlobeIcon />, label: 'Sites', ok: configured > 0, text: configured ? `${configured} cliente(s) com site` : 'nenhum site configurado' },
    { icon: <BrandLogo name="drive" size={18} />, label: 'Google Drive', ok: drives > 0, text: drives ? `${drives} cliente(s) com pasta (fotos e artes)` : 'cole o link da pasta do cliente' },
    { icon: <CanvaIcon />, label: 'Canva', ok: settings?.canva.connected || drives > 0, text: settings?.canva.connected ? `conectado${settings.canva.user ? ` · ${settings.canva.user}` : ''}` : 'artes pela pasta do Drive' },
    { icon: <BrainIcon />, label: 'LLM', ok: settings?.llm.provider !== 'off', text: settings?.llm.provider === 'claude' ? `Claude (${settings.llm.claudeModel})` : settings?.llm.provider === 'ollama' ? `Local · ${settings.llm.ollamaModel}` : 'desligada (texto-modelo)' },
  ];
  return (
    <div className="auto-sources">
      {items.map((i) => (
        <Link key={i.label} to="/automatica/fontes" className={`auto-source ${i.ok ? 'ok' : ''}`}>
          <span className="ic">{i.icon}</span>
          <span><strong>{i.label}</strong><small>{i.text}</small></span>
          <span className={`dot ${i.ok ? 'good' : 'idle'}`} />
        </Link>
      ))}
    </div>
  );
}

export function AutoHub() {
  const navigate = useNavigate();
  const settings = useApi('/api/auto/settings');
  const clients = useApi('/api/auto/clients');
  const news = useApi('/api/auto/news');
  const autoDrafts = useApi('/api/auto/drafts');
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState(null);
  const [checking, setChecking] = useState(false);

  const nameOf = useMemo(() => new Map((clients.data || []).map((c) => [c.id, c.name])), [clients.data]);

  async function checkNow() {
    setChecking(true);
    try {
      const r = await api('/api/auto/news/check', { method: 'POST' });
      const failed = r.filter((x) => !x.ok);
      if (failed.length) toast.warning('Alguns sites não responderam', { description: failed.map((f) => `${nameOf.get(f.accountId) || f.accountId}: ${f.error}`).join(' · ') });
      else toast.success('Sites conferidos', { description: `${r.length} site(s) lido(s).` });
      news.refresh();
      clients.refresh();
      window.dispatchEvent(new Event('esteira:news-changed'));
    } finally {
      setChecking(false);
    }
  }

  async function dismiss(n) {
    await api(`/api/auto/news/${n.accountId}/${n.id}/dismiss`, { method: 'POST' }).catch(() => {});
    news.refresh();
    window.dispatchEvent(new Event('esteira:news-changed'));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Piloto automático</div>
          <h1><span className="grad">Esteira Automática</span></h1>
          <div className="page-sub">Escolha o carro no site do cliente e receba a campanha pronta, montada com o padrão que já funciona naquela conta. <PlatformStrip /></div>
        </div>
        <div className="controls">
          <Link className="btn" to="/automatica/fontes"><SettingsIcon /> Fontes e padrões</Link>
          <motion.button type="button" className="btn btn-primary" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setPreset(null); setOpen(true); }}>
            <BoltIcon /> Nova campanha automática
          </motion.button>
        </div>
      </div>

      <motion.div className="card auto-hero spotlight" onMouseMove={trackSpotlight} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <span className="gold-ring" aria-hidden="true" />
        <div className="auto-flow">
          {[['Entrevista', '1 carro ou vários · cliente · carro', <BoltIcon />], ['Site', 'descrição, KM, preço, opcionais', <GlobeIcon />], ['Drive + Canva', 'fotos e artes do carro', <BrandLogo name="drive" size={16} />], ['Padrão do cliente', 'públicos, orçamento, objetivo', <BrandLogo name="meta" size={16} />], ['Textos', 'no estilo dos anúncios do cliente', <BrainIcon />], ['Você aprova', 'ajusta o que quiser e publica', <BrandLogo name="whatsapp" size={16} />]].map(([t, s, ic], i) => (
            <motion.div key={t} className="auto-flow-step tilt" data-tilt="8" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}>
              <span className="step-ic">{ic}</span>
              <strong>{t}</strong>
              <small>{s}</small>
            </motion.div>
          ))}
        </div>
        <div style={{ marginTop: 6 }}><BeltRiders moving /></div>
        <SourceStatus settings={settings.data} clients={clients.data} />
      </motion.div>

      <section className="section">
        <div className="section-head">
          <div>
            <h2><BoltIcon /> Carros novos nos sites</h2>
            <p>A esteira confere o estoque dos sites a cada 6 horas e avisa quando entra um carro novo.</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={checkNow} disabled={checking}><RefreshIcon spinning={checking} /> Verificar agora</button>
        </div>
        {!news.data && <div className="strip">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 230 }} />)}</div>}
        {news.data?.length === 0 && <div className="empty">Nenhum carro novo por enquanto. Assim que um cliente cadastrar um veículo no site, ele aparece aqui.</div>}
        <motion.div className="strip" variants={stagger(0.04)} initial="hidden" animate={news.data ? 'show' : 'hidden'}>
          <AnimatePresence>
            {(news.data || []).map((n) => (
              <motion.div key={`${n.accountId}-${n.id}`} variants={rise} exit={{ opacity: 0, scale: 0.96 }} className="card news-card tilt">
                <div className="news-img">{n.thumb ? <img src={n.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span />}<span className="tag accent">novo · {fmtDate(n.detectedAt.slice(0, 10))}</span></div>
                <div className="news-body">
                  <strong>{n.title}</strong>
                  <span>{nameOf.get(n.accountId) || n.accountId}</span>
                  <span className="mono">{[n.price ? fmtPrice(n.price) : null, n.km ? `${n.km} km` : null].filter(Boolean).join(' · ')}</span>
                </div>
                <div className="news-actions">
                  <button type="button" className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => { setPreset({ accountId: n.accountId, accountName: nameOf.get(n.accountId), vehicleId: n.id }); setOpen(true); }}><BoltIcon /> Montar campanha</button>
                  <button type="button" className="btn btn-ghost btn-sm" title="Dispensar" onClick={() => dismiss(n)}><XIcon /></button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2><CheckIcon /> Montadas automaticamente</h2>
            <p>Campanhas que a esteira montou. Abra para revisar, ajustar e publicar.</p>
          </div>
        </div>
        {!autoDrafts.data && <div className="skeleton" style={{ height: 120 }} />}
        {autoDrafts.data?.length === 0 && <div className="empty">Nenhuma campanha automática ainda. Clique em “Nova campanha automática”.</div>}
        <motion.div className="auto-list" variants={stagger(0.03)} initial="hidden" animate={autoDrafts.data ? 'show' : 'hidden'}>
          {(autoDrafts.data || []).map((d) => (
            <motion.button variants={rise} key={d.id} type="button" className="card auto-row" onClick={() => navigate(d.stage === 'published' && d.campaignId ? `/campanha/${d.campaignId}` : `/automatica/revisao/${d.id}`)}>
              <span className="auto-thumbs">{(d.origin.vehicles || []).slice(0, 3).map((v) => (v.thumb ? <img key={v.id} src={v.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span key={v.id} />))}</span>
              <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                <strong>{d.title}</strong>
                <small>{d.accountName} · {d.origin.mode === 'multi' ? `${d.origin.vehicles.length} carros` : 'um carro'} · {fmtDate(d.createdAt.slice(0, 10))}</small>
              </span>
              {d.origin.warnings?.length > 0 && <span className="tag warning"><AlertIcon /> {d.origin.warnings.length} aviso(s)</span>}
              {d.issues > 0 && d.stage === 'draft' && <span className="tag warning">{d.issues} pendência(s)</span>}
              <span className={`tag ${d.stage === 'published' ? 'good' : d.stage === 'failed' ? 'critical' : 'accent'}`}>{STAGE[d.stage] || d.stage}</span>
            </motion.button>
          ))}
        </motion.div>
      </section>

      <AutoInterview open={open} preset={preset} onClose={() => { setOpen(false); setPreset(null); autoDrafts.refresh(); news.refresh(); }} />
    </>
  );
}
