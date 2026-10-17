import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { fmtPrice } from '../../../../shared/esteira.js';
import { api } from '../../lib/api.js';
import { EASE_OUT, rise, stagger } from '../../lib/motion.js';
import { Segmented } from '../Common.jsx';
import {
  AlertIcon, BoltIcon, CheckIcon, ChevronLeft, ChevronRight, GlobeIcon, LayersIcon, SearchIcon, XIcon,
} from '../Icons.jsx';

const STAGES = ['Formato', 'Cliente', 'Carro', 'Montagem'];

function Stages({ stage }) {
  return (
    <div className="ai-stages">
      {STAGES.map((s, i) => (
        <div key={s} className={`ai-stage ${i < stage ? 'done' : ''} ${i === stage ? 'on' : ''}`}>
          <span className="n">{i < stage ? <CheckIcon /> : i + 1}</span>
          <span>{s}</span>
          {i < STAGES.length - 1 && <span className="bar"><motion.i animate={{ scaleX: i < stage ? 1 : 0 }} transition={{ duration: 0.5, ease: EASE_OUT }} /></span>}
        </div>
      ))}
    </div>
  );
}

const slide = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE_OUT } },
  exit: { opacity: 0, x: -30, transition: { duration: 0.15 } },
};

/** Entrevista curta: um carro ou vários → cliente → carro(s) do site → montagem automática com progresso. */
export function AutoInterview({ open, onClose, preset }) {
  const navigate = useNavigate();
  const [stage, setStage] = useState(0);
  const [mode, setMode] = useState(null);
  const [clients, setClients] = useState(null);
  const [account, setAccount] = useState(null);
  const [stock, setStock] = useState(null);
  const [stockError, setStockError] = useState(null);
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [structure, setStructure] = useState('audiences');
  const [manualTitle, setManualTitle] = useState('');
  const [job, setJob] = useState(null);

  useEffect(() => {
    if (!open) return;
    setStage(preset ? 3 : 0);
    setMode(preset ? 'single' : null);
    setAccount(null);
    setStock(null);
    setPicked([]);
    setTerm('');
    setGroupName('');
    setStructure('audiences');
    setManualTitle('');
    setJob(null);
    api('/api/auto/clients').then(setClients, () => setClients([]));
    if (preset) build({ accountId: preset.accountId, accountName: preset.accountName, mode: 'single', vehicleIds: [preset.vehicleId] });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!account) return;
    setStock(null);
    setStockError(null);
    if (!account.client?.site) return;
    api(`/api/auto/clients/${account.id}/stock`).then(setStock, setStockError);
  }, [account]);

  // Acompanha a montagem.
  useEffect(() => {
    if (!job || job.status !== 'running') return undefined;
    const t = setInterval(() => {
      api(`/api/auto/jobs/${job.id}`).then((j) => {
        setJob(j);
        if (j.status === 'done') {
          window.dispatchEvent(new Event('esteira:news-changed'));
          setTimeout(() => { onClose(); navigate(`/automatica/revisao/${j.result.draftId}`); }, 1100);
        }
      }, () => {});
    }, 900);
    return () => clearInterval(t);
  }, [job, navigate, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && job?.status !== 'running') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, job, onClose]);

  async function build(body) {
    setStage(3);
    try {
      setJob(await api('/api/auto/build', { method: 'POST', body }));
    } catch (err) {
      toast.error('Não foi possível iniciar a montagem', { description: err.message });
      setStage(preset ? 0 : 2);
    }
  }

  const items = useMemo(() => {
    const q = term.trim().toLowerCase();
    return (stock?.items || []).filter((v) => !q || v.title.toLowerCase().includes(q));
  }, [stock, term]);

  const sortedClients = useMemo(() => [...(clients || [])].sort((a, b) => Number(Boolean(b.client?.site)) - Number(Boolean(a.client?.site)) || a.name.localeCompare(b.name)), [clients]);

  function toggle(v) {
    if (mode === 'single') return setPicked([v.id]);
    setPicked((p) => (p.includes(v.id) ? p.filter((x) => x !== v.id) : [...p, v.id].slice(0, 12)));
  }

  const canBuild = mode === 'single' ? (picked.length === 1 || (!account?.client?.site && manualTitle.trim())) : picked.length >= 2 && groupName.trim();

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="wizard-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="wizard ai" initial={{ y: 40, scale: 0.985, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ duration: 0.45, ease: EASE_OUT }}>
            <div className="wizard-top">
              <span className="kpi-icon ai-bolt"><BoltIcon /></span>
              <div className="wizard-title">
                <strong>Nova campanha automática</strong>
                <span>{account ? account.name : 'Responda 3 perguntas — a esteira monta o resto com o padrão do cliente'}</span>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar" disabled={job?.status === 'running'}><XIcon /></button>
            </div>
            <Stages stage={stage} />
            <div className="ai-body">
              <AnimatePresence mode="wait">
                {stage === 0 && (
                  <motion.div key="s0" {...slide} className="ai-q">
                    <h2>Uma campanha por carro ou vários carros na mesma campanha?</h2>
                    <p>A esteira usa a estrutura que mais deu certo para o cliente em cada formato.</p>
                    <div className="ai-big-choices">
                      {[
                        ['single', 'Um carro', 'Campanha dedicada a um veículo, com os públicos de teste do cliente.', <BoltIcon key="i" />],
                        ['multi', 'Vários carros', 'Uma campanha com vários veículos (ex.: “SUVs até 150 mil”).', <LayersIcon key="i" />],
                      ].map(([v, title, sub, icon]) => (
                        <motion.button key={v} type="button" className={`ai-big ${mode === v ? 'on' : ''}`} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} onClick={() => { setMode(v); setPicked([]); setStage(1); }}>
                          <span className="ai-big-icon">{icon}</span>
                          <strong>{title}</strong>
                          <span>{sub}</span>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {stage === 1 && (
                  <motion.div key="s1" {...slide} className="ai-q">
                    <h2>Para qual cliente?</h2>
                    <p>Clientes com site configurado mostram o estoque. <a href="/automatica/fontes" onClick={(e) => { e.preventDefault(); onClose(); navigate('/automatica/fontes'); }}>Configurar fontes</a></p>
                    {!clients && <div className="skeleton" style={{ height: 220 }} />}
                    <motion.div className="choice-grid" variants={stagger(0.02)} initial="hidden" animate="show">
                      {sortedClients.map((c) => (
                        <motion.button variants={rise} key={c.id} type="button" className={`choice ${account?.id === c.id ? 'on' : ''}`} onClick={() => { setAccount(c); setPicked([]); setStage(2); }}>
                          <span className="avatar" style={{ width: 32, height: 32 }}>{c.name.replace(/[^A-Za-zÀ-ú]/g, '').slice(0, 2).toUpperCase()}</span>
                          <span style={{ minWidth: 0 }}>
                            <div className="choice-title">{c.name}</div>
                            <div className="choice-sub">
                              {c.client?.site ? <><GlobeIcon width={11} height={11} /> {new URL(c.client.site.url).host.replace('www.', '')}{c.client.stockCount != null ? ` · ${c.client.stockCount} carros` : ''}</> : c.client?.stockSource === 'drive' ? <>pastas do Drive{c.client.stockCount != null ? ` · ${c.client.stockCount} carros` : ''}</> : 'sem site configurado'}
                              {c.client?.news?.length > 0 && <span className="tag accent" style={{ marginLeft: 6 }}>{c.client.news.length} novo(s)</span>}
                            </div>
                          </span>
                        </motion.button>
                      ))}
                    </motion.div>
                  </motion.div>
                )}

                {stage === 2 && account && (
                  <motion.div key="s2" {...slide} className="ai-q">
                    <h2>{mode === 'single' ? 'Qual carro?' : 'Quais carros?'}</h2>
                    <p>{account.client?.site ? `Estoque de ${new URL(account.client.site.url).host.replace('www.', '')}${stock?.checkedAt ? ` · lido às ${new Date(stock.checkedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Este cliente ainda não tem o site configurado — digite o carro.'}</p>
                    {mode === 'multi' && (
                      <div className="row-2" style={{ marginBottom: 14 }}>
                        <div className="q" style={{ marginBottom: 0 }}>
                          <label htmlFor="ai-group">Nome do grupo (vira o nome da campanha)</label>
                          <input id="ai-group" className="field" style={{ width: '100%' }} placeholder="Ex.: SUVS ATÉ 150K" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
                        </div>
                        <div className="q" style={{ marginBottom: 0 }}>
                          <div className="q-label">Estrutura</div>
                          <Segmented options={[['audiences', 'Públicos × anúncios'], ['adsetPerCar', '1 conjunto por carro']]} value={structure} onChange={setStructure} label="Estrutura" />
                          <div className="hint">{structure === 'audiences' ? 'Os públicos do cliente, cada um com um anúncio de cada carro.' : 'Um conjunto para cada carro, com o público padrão do cliente.'}</div>
                        </div>
                      </div>
                    )}
                    {!account.client?.site ? (
                      <input className="field field-lg" style={{ width: '100%' }} autoFocus placeholder="Ex.: Volkswagen Nivus Highline 2024" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} />
                    ) : (
                      <>
                        <div className="combo" style={{ marginBottom: 12 }}>
                          <input className="field" style={{ width: '100%', paddingLeft: 36 }} placeholder="Buscar no estoque (modelo, versão, ano)" value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
                          <span style={{ position: 'absolute', left: 12, top: 10, color: 'var(--muted)', width: 16 }}><SearchIcon /></span>
                        </div>
                        {stockError && <div className="notice critical"><AlertIcon width={13} /> Não consegui ler o site: {stockError.message}</div>}
                        {!stock && !stockError && <div className="stock-grid">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" style={{ height: 190 }} />)}</div>}
                        <motion.div className="stock-grid" variants={stagger(0.015)} initial="hidden" animate="show">
                          {items.map((v) => {
                            const on = picked.includes(v.id);
                            const isNew = account.client?.news?.some((n) => n.id === v.id);
                            return (
                              <motion.button variants={rise} layout key={v.id} type="button" className={`stock-card tilt ${on ? 'on' : ''}`} onClick={() => toggle(v)}>
                                <div className="stock-img">
                                  {v.thumb ? <img src={v.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span />}
                                  {isNew && <span className="tag accent stock-new">{v.source === 'drive' ? 'pasta nova' : 'novo no site'}</span>}
                                  {!isNew && v.hasArts && <span className="tag good stock-new" title="A pasta do carro já tem [FEED] e [STORIES]: a esteira usa essas artes">arte pronta</span>}
                                  {on && <span className="stock-check"><CheckIcon /></span>}
                                </div>
                                <div className="stock-info">
                                  <strong>{v.title}</strong>
                                  <span>{[v.price ? fmtPrice(v.price) : 'sem preço', v.km ? `${v.km} km` : null, v.source === 'drive' && !v.hasDescription ? 'sem descrição (.docx)' : null].filter(Boolean).join(' · ')}</span>
                                </div>
                              </motion.button>
                            );
                          })}
                        </motion.div>
                        {stock && items.length === 0 && <div className="empty">Nenhum carro encontrado com esse termo.</div>}
                      </>
                    )}
                  </motion.div>
                )}

                {stage === 3 && (
                  <motion.div key="s3" {...slide} className="ai-q ai-building">
                    <div className={`belt ${job?.status === 'running' || !job ? 'moving' : ''}`} aria-hidden="true" />
                    <h2>{job?.status === 'done' ? 'Campanha montada!' : job?.status === 'failed' ? 'A montagem parou' : 'Montando a campanha…'}</h2>
                    <p>{job?.status === 'failed' ? job.error : 'A esteira está lendo o site, aplicando o padrão do cliente e preparando os anúncios.'}</p>
                    <div className="pub-steps" style={{ maxWidth: 560, margin: '0 auto 18px' }}>
                      {(job?.steps || STAGES.map((s) => ({ key: s, label: '…', state: 'pending' }))).map((s, i) => (
                        <motion.div key={s.key} className={`pub-step ${s.state}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                          <span className="node">
                            {s.state === 'done' && (
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><motion.path d="M20 6 9 17l-5-5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }} /></svg>
                            )}
                            {s.state === 'error' && <XIcon />}
                          </span>
                          <span className="tx"><strong>{s.label}</strong>{s.detail && <span>{s.detail}</span>}</span>
                        </motion.div>
                      ))}
                    </div>
                    {job?.status === 'failed' && <button type="button" className="btn" onClick={() => setStage(2)}><ChevronLeft /> Voltar e tentar de novo</button>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {stage > 0 && stage < 3 && (
              <div className="wizard-foot">
                <button type="button" className="btn" onClick={() => setStage(stage - 1)}><ChevronLeft /> Voltar</button>
                <span className="grow" />
                {stage === 2 && (
                  <>
                    {mode === 'multi' && <span className="hint" style={{ margin: 0 }}>{picked.length} carro(s) escolhido(s)</span>}
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!canBuild}
                      onClick={() => build({ accountId: account.id, accountName: account.name, mode, structure, groupName, vehicleIds: picked, manualTitle: account.client?.site ? null : manualTitle })}
                    >
                      <BoltIcon /> Montar campanha <ChevronRight />
                    </button>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
