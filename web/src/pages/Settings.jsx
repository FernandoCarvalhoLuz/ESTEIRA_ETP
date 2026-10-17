import { useState } from 'react';
import { api, useApi } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';
import { ErrorState, Switch } from '../components/Common.jsx';
import { ConnectionBeam } from '../components/Decor.jsx';

function readMotion() {
  try {
    return localStorage.getItem('esteira-motion') === 'reduced';
  } catch {
    return false;
  }
}

function Preferences() {
  const [reduced, setReduced] = useState(readMotion);
  function toggle(next) {
    setReduced(next);
    try {
      localStorage.setItem('esteira-motion', next ? 'reduced' : 'full');
    } catch {
      /* armazenamento indisponível */
    }
    window.dispatchEvent(new Event('esteira:motion'));
  }
  return (
    <section className="card settings-card">
      <h2>Preferências</h2>
      <div className="switch-row">
        <div>
          <strong>Reduzir animações</strong>
          <span>Desliga transições, números animados e efeitos de movimento neste navegador.</span>
        </div>
        <Switch on={reduced} onChange={toggle} label="Reduzir animações" />
      </div>
    </section>
  );
}

const SOURCE = { interface: 'Salvo pela interface', env: 'Arquivo .env do servidor' };

function relative(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const hours = Math.round(abs / 3_600_000);
  const text = hours < 48 ? `${hours} hora(s)` : `${Math.round(hours / 24)} dia(s)`;
  return diff >= 0 ? `em ${text}` : `há ${text}`;
}

function TokenStatus({ status }) {
  const info = status.info;
  if (!status.configured) return <div className="notice critical">Nenhum token configurado.</div>;
  return (
    <>
      <div className={`notice ${info?.valid ? 'good' : 'critical'}`} style={{ marginBottom: 16 }}>
        {info?.valid ? 'Token válido — a plataforma consegue ler as campanhas.' : `Token inválido ou expirado. ${info?.error || ''}`}
      </div>
      {info?.valid && (
        <dl className="kv">
          <dt>Usuário Meta</dt><dd>{info.userName || info.userId}</dd>
          <dt>App</dt><dd>{info.appName} ({info.appId})</dd>
          <dt>Tipo</dt><dd>{info.type === 'SYSTEM_USER' ? 'Usuário do sistema' : info.type === 'USER' ? 'Usuário' : info.type}</dd>
          <dt>Expira</dt>
          <dd>{info.neverExpires || !info.expiresAt ? 'Não expira' : `${fmtDateTime(info.expiresAt)} (${relative(info.expiresAt)})`}</dd>
          <dt>Acesso aos dados até</dt>
          <dd>{info.dataAccessExpiresAt ? `${fmtDateTime(info.dataAccessExpiresAt)} (${relative(info.dataAccessExpiresAt)})` : '—'}</dd>
          <dt>Permissões</dt>
          <dd><div className="scopes">{info.scopes.map((s) => <span key={s} className="tag">{s}</span>)}</div></dd>
          <dt>Origem</dt><dd>{SOURCE[status.source] || '—'}{status.updatedAt ? ` · ${fmtDateTime(status.updatedAt)}` : ''}</dd>
          <dt>Versão da API</dt><dd>{status.apiVersion}</dd>
        </dl>
      )}
    </>
  );
}

export function Settings({ user }) {
  const { data, error, refresh } = useApi('/api/settings/meta?fresh=1');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const isAdmin = user.role === 'admin';

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await api('/api/settings/meta', { method: 'PUT', body: { token } });
      setToken('');
      setMessage({ tone: 'good', text: result.exchanged ? 'Token salvo e convertido para um token de longa duração.' : 'Token salvo com sucesso.' });
      window.dispatchEvent(new Event('esteira:token-updated'));
      refresh();
    } catch (err) {
      setMessage({ tone: 'critical', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Plataforma</div>
          <h1><span className="grad">Configurações</span></h1>
        </div>
      </div>
      <div className="settings-grid">
        <section className="card settings-card">
          <h2>Conexão com a Meta</h2>
          <ConnectionBeam ok={Boolean(data?.configured && data?.info?.valid)} />
          {error ? <ErrorState error={error} onRetry={refresh} /> : data ? <TokenStatus status={data} /> : <div className="skeleton" style={{ height: 200 }} />}
        </section>

        <section className="card settings-card">
          <h2>Trocar token de acesso</h2>
          {isAdmin ? (
            <form onSubmit={save}>
              <label className="lbl" htmlFor="token">Novo token</label>
              <textarea id="token" className="field" rows={5} value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAA…" autoComplete="off" spellCheck={false} />
              {message && <div className={`notice ${message.tone}`} style={{ margin: '12px 0' }}>{message.text}</div>}
              <button type="submit" className="btn btn-primary" disabled={busy || token.trim().length < 20} style={{ marginTop: 12 }}>
                {busy ? 'Validando…' : 'Validar e salvar'}
              </button>
              {data?.exchangeAvailable && (
                <p className="updated" style={{ marginTop: 10 }}>Tokens de curta duração são convertidos automaticamente para ~60 dias.</p>
              )}
            </form>
          ) : (
            <div className="notice">Apenas administradores podem trocar o token.</div>
          )}

          <h2 style={{ marginTop: 28 }}>Token permanente (recomendado)</h2>
          <ol className="steps">
            <li>No <strong>Gerenciador de Negócios</strong> da Meta, abra <strong>Configurações do negócio → Usuários do sistema</strong>.</li>
            <li>Crie um usuário do sistema (função <strong>Administrador</strong>) e, em <strong>Atribuir ativos</strong>, dê acesso às contas de anúncio.</li>
            <li>Clique em <strong>Gerar novo token</strong>, escolha o app, marque <strong>ads_read</strong> e <strong>business_management</strong> e selecione validade <strong>Nunca</strong>.</li>
            <li>Cole o token aqui. Ele não expira e não depende do login de uma pessoa.</li>
          </ol>
        </section>
        <Preferences />
      </div>
    </>
  );
}
