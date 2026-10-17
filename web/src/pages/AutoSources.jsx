import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { OBJECTIVES } from '../../../shared/esteira.js';
import { BrandLogo } from '../components/Brands.jsx';
import { api, useApi } from '../lib/api.js';
import { fmtDate, fmtMoney } from '../lib/format.js';
import { rise, stagger } from '../lib/motion.js';
import { Segmented } from '../components/Common.jsx';
import { deviceSummary } from '../components/esteira/Steps.jsx';
import {
  AlertIcon, BrainIcon, CanvaIcon, CheckIcon, ChevronRight, CopyIcon, DriveIcon, GlobeIcon, RefreshIcon, SearchIcon, StarIcon,
} from '../components/Icons.jsx';

const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success('Copiado'), () => {});

function LlmCard({ data, onSaved, admin }) {
  const [provider, setProvider] = useState(data.provider);
  const [key, setKey] = useState('');
  const [claudeModel, setClaudeModel] = useState(data.claudeModel);
  const [ollamaModel, setOllamaModel] = useState(data.ollamaModel);
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api('/api/auto/settings/llm', { method: 'PUT', body: { provider, claudeKey: key, claudeModel, ollamaModel } });
      setKey('');
      toast.success('LLM salva');
      onSaved();
    } catch (err) {
      toast.error('Não foi possível salvar', { description: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function runTest() {
    setTest({ running: true });
    setTest(await api('/api/auto/settings/llm/test', { method: 'POST' }).catch((err) => ({ ok: false, error: err.message })));
  }

  return (
    <div className="card integ">
      <div className="integ-head"><span className="ic"><BrainIcon /></span><div><strong>LLM (textos e leitura)</strong><small>Escreve os anúncios no estilo do cliente e lê sites sem leitor próprio.</small></div></div>
      <Segmented options={[['off', 'Desligada'], ['ollama', 'Local (servidor)'], ['claude', 'Claude API']]} value={provider} onChange={setProvider} label="Provedor" size="sm" />
      <div className="integ-body">
        {provider === 'off' && <p className="hint">Sem LLM, os textos saem do texto-modelo do cliente com os dados do site (ano, KM, câmbio, opcionais, preço).</p>}
        {provider === 'ollama' && (
          <>
            <p className="hint">Roda no próprio servidor Oracle, sem custo. Mais lento (≈2 min por carro) e textos mais simples.</p>
            <label className="mini-label" htmlFor="ollama-model">Modelo</label>
            <select id="ollama-model" className="field" value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)}>
              <option value="gemma3:4b">gemma3:4b (melhor texto)</option>
              <option value="qwen2.5:3b">qwen2.5:3b (mais rápido)</option>
            </select>
          </>
        )}
        {provider === 'claude' && (
          <>
            <p className="hint">Melhor texto e leitura das artes do Canva por imagem. Pago por uso (centavos por campanha). Crie a chave em console.anthropic.com.</p>
            <label className="mini-label" htmlFor="claude-key">Chave da API {data.hasClaudeKey && <span className="tag good">salva {data.claudeKeyHint}</span>}</label>
            <input id="claude-key" type="password" className="field" autoComplete="off" placeholder={data.hasClaudeKey ? 'Deixe em branco para manter' : 'sk-ant-…'} value={key} onChange={(e) => setKey(e.target.value)} />
            <label className="mini-label" htmlFor="claude-model">Modelo</label>
            <select id="claude-model" className="field" value={claudeModel} onChange={(e) => setClaudeModel(e.target.value)}>
              <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (recomendado)</option>
              <option value="claude-opus-5-5">Claude Opus 5.5 (máxima qualidade)</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (mais barato)</option>
            </select>
          </>
        )}
      </div>
      <div className="integ-foot">
        {admin && <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>Salvar</button>}
        {data.provider !== 'off' && <button type="button" className="btn btn-sm" onClick={runTest} disabled={test?.running}>Testar</button>}
        {test && !test.running && <span className={`tag ${test.ok ? 'good' : 'critical'}`} title={test.sample || test.error}>{test.ok ? `OK em ${(test.ms / 1000).toFixed(1)}s` : test.error}</span>}
        {test?.running && <span className="tag">Testando…</span>}
      </div>
    </div>
  );
}

function DriveCard({ data, onSaved, admin }) {
  const [json, setJson] = useState('');
  const [advanced, setAdvanced] = useState(false);
  async function save(body) {
    try {
      await api('/api/auto/settings/google', { method: 'PUT', body });
      setJson('');
      toast.success(body.clear ? 'Conta de serviço removida' : 'Conta de serviço salva');
      onSaved();
    } catch (err) {
      toast.error('Não foi possível salvar', { description: err.message });
    }
  }
  async function readFile(e) {
    const file = e.target.files?.[0];
    if (file) setJson(await file.text());
  }
  return (
    <div className="card integ">
      <div className="integ-head"><span className="ic"><BrandLogo name="drive" size={20} /></span><div><strong>Google Drive (fotos e artes)</strong><small>Sem login: a esteira lê a pasta pelo link.</small></div></div>
      <div className="integ-body">
        <ol className="steps-list">
          <li>No Drive, abra a pasta do cliente › <strong>Compartilhar</strong>.</li>
          <li>Em <strong>Acesso geral</strong>, escolha <strong>“Qualquer pessoa com o link” · Leitor</strong>.</li>
          <li>Copie o link e cole no cliente, logo abaixo.</li>
        </ol>
        <p className="hint">Organização: uma subpasta por carro, com o nome do carro (ex.: “NIVUS 1.0 HIGHLINE 200 TSI - 2024”). Fotos viram a mídia do anúncio; artes do Canva salvas na mesma pasta (PNG ou com “feed”/“stories” no nome) entram como criativo.</p>
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAdvanced((a) => !a)}>{advanced ? 'Esconder' : 'Pastas privadas (avançado)'}</button>
        {advanced && (
          <div className="integ-advanced">
            <p className="hint">Só se a pasta não puder ficar aberta pelo link: envie o JSON de uma conta de serviço do Google Cloud (Drive API ativa) e compartilhe a pasta com o e-mail dela.</p>
            {data.configured && <button type="button" className="copy-line" onClick={() => copy(data.clientEmail)}><span className="mono">{data.clientEmail}</span><CopyIcon /></button>}
            {admin && <input type="file" accept="application/json,.json" onChange={readFile} style={{ fontSize: 12 }} />}
            {admin && json && <button type="button" className="btn btn-sm" onClick={() => save({ serviceAccount: json })}>Salvar conta de serviço</button>}
            {admin && data.configured && <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => save({ clear: true })}>Remover conta de serviço</button>}
          </div>
        )}
      </div>
      <div className="integ-foot"><span className="tag good"><CheckIcon /> Pronto para usar</span>{data.configured && <span className="tag">+ conta de serviço</span>}</div>
    </div>
  );
}

function CanvaCard({ data, onSaved, admin }) {
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [setup, setSetup] = useState(false);
  async function save(body) {
    try {
      await api('/api/auto/settings/canva', { method: 'PUT', body });
      setClientId('');
      setSecret('');
      toast.success(body.disconnect ? 'Canva desconectado' : 'Integração do Canva salva');
      onSaved();
    } catch (err) {
      toast.error('Não foi possível salvar', { description: err.message });
    }
  }
  return (
    <div className="card integ">
      <div className="integ-head"><span className="ic"><CanvaIcon /></span><div><strong>Canva (artes)</strong><small>Opcional.</small></div></div>
      <div className="integ-body">
        {data.connected ? (
          <>
            <p className="hint">Conectado{data.user ? ` como ${data.user}` : ''}. A esteira lê as páginas do design de cada cliente e exporta as artes.</p>
            <p className="hint"><strong>Carro sem arte pronta?</strong> A esteira cria uma arte nova a partir do <strong>modelo</strong> do cliente, com as fotos da pasta do carro no Drive.</p>
            <ol className="steps-list">
              <li>No modelo (1 página de feed e, se quiser, 1 de stories), abra <strong>Apps › Preenchimento automático de dados</strong> e crie os campos: <span className="mono">NOME, PRECO, KM, ANO</span> (texto) e <span className="mono">FOTO</span> (imagem; <span className="mono">FOTO2…</span> para mais fotos).</li>
              <li>Publique como <strong>modelo de marca</strong> (Compartilhar › Modelo de marca) e cole o link dele no cliente, em <strong>Modelo para artes novas</strong> (<span className="mono">canva.com/brand/brand-templates/…</span>).</li>
              {!data.canCreate && <li>Em <a href="https://www.canva.com/developers/integrations/connect-api" target="_blank" rel="noreferrer">canva.com/developers</a>, na integração, marque <span className="mono">design:content</span> e <span className="mono">asset</span> (leitura e escrita) e <span className="mono">brandtemplate:meta</span> e <span className="mono">brandtemplate:content</span> (leitura) e clique em <strong>Reconectar Canva</strong>.</li>}
            </ol>
            <p className="hint">O preenchimento automático exige Canva Pro, Teams ou Enterprise.</p>
          </>
        ) : (
          <>
            <p className="hint"><strong>Jeito mais simples (sem conectar):</strong> exporte do Canva a arte do carro (feed e stories) e salve na pasta do carro no Drive. A esteira pega sozinha.</p>
            {data.configured ? (
              <p className="hint"><strong>Ou conecte a conta:</strong> clique abaixo e entre com o e-mail e a senha do Canva, na página do próprio Canva.</p>
            ) : (
              <p className="hint"><strong>Ou conecte a conta:</strong> o Canva só libera acesso pelo login oficial dele. Para o botão “Entrar com Canva” funcionar, a plataforma precisa ser registrada uma única vez no Canva (5 min, feito pelo dono da conta).</p>
            )}
          </>
        )}
        {!data.connected && !data.configured && admin && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSetup((x) => !x)}>{setup ? 'Esconder registro' : 'Registrar a plataforma no Canva (uma vez)'}</button>
        )}
        {(setup || (data.configured && !data.connected && admin && (clientId || secret))) && (
          <div className="integ-advanced">
            <ol className="steps-list">
              <li>Entre em <a href="https://www.canva.com/developers/integrations/connect-api" target="_blank" rel="noreferrer">canva.com/developers</a> › <strong>Criar integração</strong> (privada para o time).</li>
              <li>Marque os escopos <span className="mono">design:meta:read, design:content:read, design:content:write, asset:read, asset:write, brandtemplate:meta:read, brandtemplate:content:read, folder:read, profile:read</span>.</li>
              <li>Em <strong>URL de redirecionamento</strong>, cole:</li>
            </ol>
            <button type="button" className="copy-line" onClick={() => copy(data.redirectUri)} title="URL de redirecionamento"><span className="mono">{data.redirectUri}</span><CopyIcon /></button>
            <input className="field" placeholder="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            <input className="field" type="password" autoComplete="off" placeholder="Client Secret" value={secret} onChange={(e) => setSecret(e.target.value)} />
            <button type="button" className="btn btn-sm" disabled={!clientId || !secret} onClick={() => save({ clientId, clientSecret: secret })}>Salvar registro</button>
          </div>
        )}
      </div>
      <div className="integ-foot">
        {admin && data.configured && !data.connected && <a className="btn btn-primary btn-sm" href="/api/auto/canva/connect"><CanvaIcon /> Entrar com Canva <ChevronRight /></a>}
        {admin && data.connected && !data.canCreate && <a className="btn btn-primary btn-sm" href="/api/auto/canva/connect" title="Libera a criação de artes novas (preenchimento automático e envio de fotos)"><CanvaIcon /> Reconectar Canva <ChevronRight /></a>}
        {admin && data.connected && <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => save({ disconnect: true })}>Desconectar</button>}
        <span className={`tag ${data.connected ? (data.canCreate ? 'good' : 'warning') : ''}`}>{data.connected ? (data.canCreate ? 'Conectado · cria artes' : 'Conectado · só leitura') : data.configured ? 'Falta entrar com o Canva' : 'Usando artes do Drive'}</span>
      </div>
    </div>
  );
}

function PatternView({ p }) {
  const objective = OBJECTIVES.find((o) => o.key === p.objective)?.label || p.objective;
  const base = p.preferredStructure === 'multi' ? p.multi || p.single : p.single || p.multi;
  return (
    <div className="pattern">
      <div className="pattern-stats">
        <div>Objetivo<strong>{objective}</strong></div>
        <div>Formato mais usado<strong>{p.preferredStructure === 'multi' ? 'Vários carros' : 'Um carro'}</strong></div>
        <div>Orçamento típico<strong>{p.medianBudget ? `${fmtMoney(p.medianBudget)}/dia` : '—'}</strong></div>
        <div>Campanhas lidas<strong>{p.campaignsAnalyzed} <small>({p.structures.single} de 1 carro · {p.structures.multi} de vários)</small></strong></div>
      </div>
      {[['single', 'Um carro'], ['multi', 'Vários carros']].map(([k, label]) => p[k] && (
        <div key={k} className={`pattern-base ${base === p[k] ? 'main' : ''}`}>
          <div className="pattern-base-head">
            <span className="tag accent">{label}</span>
            <strong title={p[k].campaignName}>{p[k].campaignName}</strong>
            {p[k].metrics?.costPerConversation != null && <span className="tag good">{fmtMoney(p[k].metrics.costPerConversation)}/conversa · {p[k].metrics.conversations} conv.</span>}
          </div>
          <div className="pattern-line"><span>Nome</span><span className="mono">{p[k].naming}</span></div>
          <div className="pattern-line"><span>Orçamento</span><span>{p[k].budget.level === 'campaign' ? `${fmtMoney(p[k].budget.amount)}/dia na campanha` : 'por conjunto'}</span></div>
          <div className="pattern-line"><span>Públicos</span><span className="aud-v">{p[k].adsets.map((a) => <span key={a.key} className="tag" title={deviceSummary(a.devices)}>{a.name}</span>)}</span></div>
        </div>
      ))}
      <div className="pattern-line"><span>Nome do anúncio</span><span className="mono">{p.adNamePattern}</span></div>
      <div className="pattern-line"><span>Estilo do texto</span><span>marcador {p.style.bullet} · {p.style.showPrice ? 'mostra preço' : 'sem preço'} · fecha com “{p.style.closing}”</span></div>
      <div className="hint">Lido em {fmtDate(p.analyzedAt.slice(0, 10))} a partir dos últimos 90 dias. A esteira usa a melhor campanha de cada formato como base.</div>
    </div>
  );
}

function ClientRow({ c, onChanged }) {
  const s = c.client || {};
  const [site, setSite] = useState(s.site?.url || '');
  const [drive, setDrive] = useState(s.drive?.folderUrl || '');
  const [canva, setCanva] = useState(s.canva?.designUrl || '');
  const [tpl, setTpl] = useState(s.canva?.templateUrl || '');
  const [busy, setBusy] = useState(null);
  const [checks, setChecks] = useState(null);
  const [open, setOpen] = useState(false);
  const [artOpen, setArtOpen] = useState(false);
  const dirty = site !== (s.site?.url || '') || drive !== (s.drive?.folderUrl || '') || canva !== (s.canva?.designUrl || '') || tpl !== (s.canva?.templateUrl || '');

  async function save() {
    setBusy('save');
    try {
      const r = await api(`/api/auto/clients/${c.id}`, { method: 'PUT', body: { siteUrl: site, driveFolder: drive, canvaDesign: canva, canvaTemplate: tpl } });
      setChecks(r.checks);
      setSite(r.site?.url || '');
      setDrive(r.drive?.folderUrl || '');
      setCanva(r.canva?.designUrl || '');
      setTpl(r.canva?.templateUrl || '');
      toast.success('Fontes salvas', { description: r.site ? `Site: ${r.site.platformLabel}` : undefined });
      onChanged();
    } catch (err) {
      toast.error('Não foi possível salvar', { description: err.message });
    } finally {
      setBusy(null);
    }
  }
  async function analyze() {
    setBusy('analyze');
    try {
      await api(`/api/auto/clients/${c.id}/analyze`, { method: 'POST' });
      toast.success('Padrão do cliente atualizado');
      setOpen(true);
      onChanged();
    } catch (err) {
      toast.error('Não foi possível analisar', { description: err.message });
    } finally {
      setBusy(null);
    }
  }
  async function readStock() {
    setBusy('stock');
    try {
      const r = await api(`/api/auto/clients/${c.id}/stock?fresh=1`);
      toast.success(`${r.items.length} carro(s) ${s.site ? 'no site' : 'nas pastas do Drive'}`);
      onChanged();
    } catch (err) {
      toast.error('Não consegui ler o estoque', { description: err.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.div variants={rise} className="card client-row">
      <div className="client-head">
        <span className="avatar" style={{ width: 34, height: 34 }}>{c.name.replace(/[^A-Za-zÀ-ú]/g, '').slice(0, 2).toUpperCase()}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong>{c.name}</strong>
          <small className="mono">{c.id}</small>
        </div>
        {s.site && <span className="tag accent"><GlobeIcon /> {s.site.platformLabel}{s.stockCount != null ? ` · ${s.stockCount} carros` : ''}</span>}
        {s.stockSource === 'drive' && <span className="tag accent" title="Sem site: cada pasta de carro no Drive é um carro e a descrição (.docx) traz os dados"><BrandLogo name="drive" size={12} /> Estoque pelas pastas do Drive{s.stockCount != null ? ` · ${s.stockCount} carros` : ''}</span>}
        {s.pattern && <span className="tag good"><StarIcon /> padrão lido</span>}
      </div>
      <div className="client-fields">
        <label><span><GlobeIcon /> Site <small className="muted">(sem site, o estoque vem das pastas do Drive)</small></span><input className="field" placeholder="https://www.loja.com.br" value={site} onChange={(e) => setSite(e.target.value)} /></label>
        <label><span><BrandLogo name="drive" size={14} /> Pasta do Drive <small className="muted">(compartilhada pelo link)</small></span><input className="field" placeholder="https://drive.google.com/drive/folders/…" value={drive} onChange={(e) => setDrive(e.target.value)} /></label>
        <label><span><CanvaIcon /> Design do Canva <small className="muted">(opcional)</small></span><input className="field" placeholder="https://www.canva.com/design/… ou https://canva.link/…" value={canva} onChange={(e) => setCanva(e.target.value)} /></label>
        <label title="Modelo de marca (ou design) com campos de dados: NOME, PRECO, KM, ANO, FOTO. Usado para criar a arte quando o carro não tem página pronta."><span><CanvaIcon /> Modelo para artes novas <small className="muted">(campos de dados)</small></span><input className="field" placeholder="https://www.canva.com/brand/brand-templates/…" value={tpl} onChange={(e) => setTpl(e.target.value)} /></label>
      </div>
      {checks && (
        <div className="client-checks">
          {checks.drive && <span className={`tag ${checks.drive.ok ? 'good' : 'critical'}`}>{checks.drive.ok ? <><CheckIcon /> Drive: “{checks.drive.name}” · {checks.drive.folders} pasta(s) de carro</> : <><AlertIcon /> Drive: {checks.drive.error}</>}</span>}
          {checks.template && (
            <span className={`tag ${checks.template.ok ? 'good' : 'warning'}`} title={checks.template.skipped?.map((x) => `${x.field}: ${x.reason}`).join('\n') || undefined}>
              {checks.template.ok
                ? <><CheckIcon /> Modelo: {checks.template.name} · {[...checks.template.text.map((t) => `${t.field}→${t.label}`), ...checks.template.images.map((i) => `${i}→foto do Drive`)].join(', ')}{checks.template.skipped?.length ? ` · ${checks.template.skipped.length} campo(s) ignorado(s)` : ''}</>
                : <><AlertIcon /> Modelo: {checks.template.error}</>}
            </span>
          )}
          {checks.canva && <span className={`tag ${checks.canva.ok ? 'good' : 'critical'}`}>{checks.canva.ok ? <><CheckIcon /> Canva: {checks.canva.name} ({checks.canva.pages} pág.)</> : <><AlertIcon /> Canva: {checks.canva.error}</>}</span>}
        </div>
      )}
      <div className="client-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || busy}>{busy === 'save' ? 'Salvando…' : 'Salvar fontes'}</button>
        {(s.site || s.drive) && <button type="button" className="btn btn-sm" onClick={readStock} disabled={Boolean(busy)}><RefreshIcon spinning={busy === 'stock'} /> Ler estoque</button>}
        <button type="button" className="btn btn-sm" onClick={analyze} disabled={Boolean(busy)}><StarIcon filled={false} /> {busy === 'analyze' ? 'Analisando histórico…' : s.pattern ? 'Atualizar padrão' : 'Analisar padrão do cliente'}</button>
        {s.pattern && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>{open ? 'Esconder padrão' : 'Ver padrão'}</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArtOpen((o) => !o)}><CanvaIcon /> {artOpen ? 'Esconder arte' : 'Arte nova do carro'}</button>
      </div>
      <AnimatePresence initial={false}>
        {open && s.pattern && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            <PatternView p={s.pattern} />
          </motion.div>
        )}
        {artOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            <ArtSettings c={c} onChanged={onChanged} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const asInput = (v) => (Array.isArray(v) ? v.join(' | ') : v ?? '');

/**
 * Prévia da arte com um carro do estoque: escolhe o carro e a foto e testa ajustes de texto (o mesmo caminho da
 * montagem — capa pelas regras ou pelo Claude, recorte, cenário ampliado por IA no layout Rodapé).
 */
function ArtPreview({ c, lay }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [stock, setStock] = useState(null);
  const [vehicleId, setVehicleId] = useState('');
  const [vals, setVals] = useState({});

  async function run(body) {
    setBusy(true);
    try {
      const r = await api(`/api/auto/clients/${c.id}/art/preview`, { method: 'POST', body });
      setPreview(r);
      setVehicleId(r.vehicle.id);
      setVals(Object.fromEntries((lay?.fields || []).map(([k]) => [k, asInput(r.values?.[k])])));
    } catch (err) {
      toast.error('Não foi possível gerar a prévia', { description: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function loadStock() {
    try {
      setStock((await api(`/api/auto/clients/${c.id}/stock`)).items);
    } catch (err) {
      toast.error('Não consegui ler o estoque', { description: err.message });
    }
  }
  const pickedBy = { claude: 'pelo Claude', revisão: 'por você', regras: 'pelas regras' }[preview?.pickedBy] || '';

  return (
    <div className="art-preview">
      <div className="art-actions">
        {stock ? (
          <select className="field" style={{ maxWidth: 360 }} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Primeiro carro com fotos no Drive</option>
            {stock.map((v) => <option key={v.id} value={v.id}>{v.title}{v.hasArts ? ' · já tem arte' : ''}</option>)}
          </select>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadStock}>Escolher o carro</button>
        )}
        <button type="button" className="btn btn-sm" onClick={() => run({ vehicleId: vehicleId || undefined })} disabled={busy}>
          <RefreshIcon spinning={busy} /> {busy ? 'Gerando prévia…' : 'Gerar prévia com um carro do estoque'}
        </button>
      </div>
      {busy && lay?.key === 'prime' && <div className="hint">A IA amplia o cenário da foto: a primeira prévia de cada foto leva cerca de 1 minuto (depois fica guardada).</div>}
      {preview && (
        <>
          <div className="hint" style={{ marginTop: 0 }}>
            {preview.vehicle.title} · foto “{preview.photo}”{pickedBy ? ` escolhida ${pickedBy}` : ''}
            {preview.cutout ? ' · carro medido pelo recorte' : ''}{preview.ai === true ? ' · cenário ampliado com IA' : preview.ai === false ? ' · cenário sem IA (preenchimento simples)' : ''}
          </div>
          <div className="art-preview-row">
            <a href={preview.feed} target="_blank" rel="noreferrer"><img src={preview.feed} alt="Prévia do feed" /><span className="tag">feed 4:5</span></a>
            <a href={preview.story} target="_blank" rel="noreferrer"><img src={preview.story} alt="Prévia dos stories" /><span className="tag">stories 9:16</span></a>
          </div>
          {preview.photos?.length > 1 && (
            <>
              <div className="q-label">Testar com outra foto</div>
              <div className={`mc-row ${busy ? 'loading-dim' : ''}`}>
                {preview.photos.map((p) => (
                  <button key={p.id} type="button" className={`lib-item ${p.id === preview.photoId ? 'on' : ''}`} title={p.name} disabled={busy} onClick={() => run({ vehicleId: preview.vehicle.id, photoId: p.id, overrides: vals })}>
                    {p.thumb ? <img src={p.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="ph" />}
                  </button>
                ))}
              </div>
            </>
          )}
          {lay?.fields?.length > 0 && (
            <div className="art-adjust">
              <div className="q-label">Textos da arte <small className="muted">(teste — na revisão de cada campanha os ajustes ficam guardados)</small></div>
              <div className="art-fields">
                {lay.fields.map(([k, label]) => (
                  <label key={k}>
                    <span>{label}</span>
                    <input className="field" value={vals[k] ?? ''} onChange={(e) => setVals((cur) => ({ ...cur, [k]: e.target.value }))} />
                  </label>
                ))}
              </div>
              <div><button type="button" className="btn btn-sm" disabled={busy} onClick={() => run({ vehicleId: preview.vehicle.id, photoId: preview.photoId, overrides: vals })}>Aplicar textos na prévia</button></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Arte nova do carro: gerador da esteira (layout + logo + cores) ou modelo do Canva, com prévia. */
function ArtSettings({ c, onChanged }) {
  const art = c.client?.art || { engine: 'etp', layout: 'vitrine', colors: {} };
  const layouts = useApi('/api/auto/art/layouts');
  const [busy, setBusy] = useState(null);
  const [logoKey, setLogoKey] = useState(0);
  const lay = (layouts.data || []).find((l) => l.key === (art.layout || 'vitrine'));
  const prime = (art.layout || 'vitrine') === 'prime';

  async function save(patch) {
    setBusy('save');
    try {
      await api(`/api/auto/clients/${c.id}/art`, { method: 'PUT', body: patch });
      onChanged();
    } catch (err) {
      toast.error('Não foi possível salvar', { description: err.message });
    } finally {
      setBusy(null);
    }
  }
  async function uploadLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy('logo');
    try {
      const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
      await api(`/api/auto/clients/${c.id}/art/logo`, { method: 'PUT', body: { dataUrl } });
      setLogoKey((k) => k + 1);
      toast.success('Logo salvo');
      onChanged();
    } catch (err) {
      toast.error('Não foi possível salvar o logo', { description: err.message });
    } finally {
      setBusy(null);
      e.target.value = '';
    }
  }

  const color = (k) => art.colors?.[k] || lay?.colors?.[k] || '#000000';
  return (
    <div className="art-settings">
      <div className="art-row">
        <div className="q-label">Quem cria a arte quando o carro não tem arte pronta</div>
        <Segmented
          options={[['etp', 'Gerador da esteira'], ['canva', 'Modelo do Canva']]}
          value={art.engine || 'etp'}
          onChange={(v) => save({ engine: v })}
          label="Motor da arte"
          size="sm"
        />
        <p className="hint">
          {art.engine === 'canva'
            ? 'O Canva preenche o modelo de marca (campos NOME, VERSAO, ANO, KM, PRECO, FOTO). Ele não ajusta tamanho de texto nem negrito misto.'
            : prime
              ? 'Padrão Rodapé (Auto Prime): a foto do Drive fica inteira e a IA amplia o teto, as paredes e o piso até o formato; logo, título numa linha (marca e modelo em negrito, versão em fino), detalhes e caixa de preço. Gera feed e stories em PNG.'
              : 'A esteira desenha a arte no layout do cliente: ajusta o tamanho do texto, mantém negrito misto e enquadra a foto do Drive. Gera feed e stories.'}
          {art.activeEngine === null && ' · Ainda não está pronto para criar artes.'}
        </p>
      </div>
      {art.engine !== 'canva' && (
        <div className="art-grid">
          <label>
            <span>Layout</span>
            <select className="field" value={art.layout || 'vitrine'} onChange={(e) => save({ layout: e.target.value, colors: { text: '', bar: '', barText: '' } })}>
              {(layouts.data || [{ key: 'vitrine', label: 'Vitrine' }]).map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
          </label>
          <label>
            <span>{prime ? 'Cor da caixa de preço' : 'Cor das faixas'}</span>
            <span className="color-pick"><input type="color" value={color('bar')} onChange={(e) => save({ colors: { bar: e.target.value } })} /><span className="mono">{color('bar')}</span></span>
          </label>
          <label>
            <span>Cor do texto</span>
            <span className="color-pick"><input type="color" value={color('text')} onChange={(e) => save({ colors: { text: e.target.value } })} /><span className="mono">{color('text')}</span></span>
          </label>
          <label>
            <span>Logo <small className="muted">(PNG sem fundo)</small></span>
            <span className="logo-pick">
              {art.hasLogo ? <img key={logoKey} src={`/api/auto/clients/${c.id}/art/logo?v=${logoKey}`} alt="Logo" /> : <span className="hint" style={{ margin: 0 }}>sem logo</span>}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={uploadLogo} disabled={busy === 'logo'} />
            </span>
          </label>
        </div>
      )}
      {busy === 'save' && <span className="hint" style={{ margin: 0 }}>Salvando…</span>}
      {art.engine !== 'canva' && <ArtPreview c={c} lay={lay} />}
    </div>
  );
}

export function AutoSources({ user }) {
  const [params, setParams] = useSearchParams();
  const settings = useApi('/api/auto/settings');
  const clients = useApi('/api/auto/clients');
  const [term, setTerm] = useState('');
  const admin = user?.role === 'admin';

  useEffect(() => {
    const status = params.get('canva');
    if (!status) return;
    if (status === 'ok') toast.success('Conta do Canva conectada');
    else toast.error('Não foi possível conectar o Canva', { description: params.get('msg') || '' });
    setParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const q = term.trim().toLowerCase();
    return [...(clients.data || [])]
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => Number(Boolean(b.client?.site || b.client?.drive)) - Number(Boolean(a.client?.site || a.client?.drive)) || a.name.localeCompare(b.name));
  }, [clients.data, term]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><Link to="/automatica">Esteira Automática</Link><span>›</span><span>Fontes e padrões</span></div>
          <h1>Fontes e padrões</h1>
          <div className="page-sub">De onde a esteira lê cada cliente: site (carros), Google Drive (fotos) e Canva (artes) — e o padrão aprendido das campanhas dele.</div>
        </div>
      </div>

      <section className="section" style={{ marginTop: 0 }}>
        <div className="section-head"><div><h2>Integrações</h2><p>Valem para todos os clientes.</p></div></div>
        {!settings.data ? <div className="skeleton" style={{ height: 260 }} /> : (
          <div className="integ-grid">
            <LlmCard data={settings.data.llm} onSaved={settings.refresh} admin={admin} />
            <DriveCard data={settings.data.google} onSaved={settings.refresh} admin={admin} />
            <CanvaCard data={settings.data.canva} onSaved={settings.refresh} admin={admin} />
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <div><h2>Clientes</h2><p>Cada conta de anúncio é um cliente, com as próprias fontes e o próprio padrão.</p></div>
          <div className="combo" style={{ width: 280 }}>
            <input className="field" style={{ width: '100%', paddingLeft: 34 }} placeholder="Buscar cliente" value={term} onChange={(e) => setTerm(e.target.value)} />
            <span style={{ position: 'absolute', left: 11, top: 10, color: 'var(--muted)', width: 15 }}><SearchIcon /></span>
          </div>
        </div>
        {!clients.data && <div className="skeleton" style={{ height: 300 }} />}
        <motion.div className="client-list" variants={stagger(0.03)} initial="hidden" animate={clients.data ? 'show' : 'hidden'}>
          {list.map((c) => <ClientRow key={c.id} c={c} onChanged={clients.refresh} />)}
        </motion.div>
      </section>
    </>
  );
}
