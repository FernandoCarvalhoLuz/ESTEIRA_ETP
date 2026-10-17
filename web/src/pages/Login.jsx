import { useState } from 'react';
import { motion } from 'motion/react';
import { api } from '../lib/api.js';
import { EASE_OUT } from '../lib/motion.js';
import { Logo } from '../components/Icons.jsx';
import { SocialOrbit } from '../components/Decor.jsx';
import { PointerFX } from '../components/PointerFX.jsx';

/** Parallax: guarda a posição relativa do cursor (-0.5…0.5) em --px/--py para as camadas do fundo. */
function parallax(e) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
  e.currentTarget.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
}

// Rastros de luz (faróis na estrada): posição, comprimento, duração e atraso fixos para não "pular" a cada render.
const TRAILS = [
  [12, 180, 5.2, 0], [22, 260, 3.8, 1.4], [31, 140, 6.1, 2.6], [44, 320, 4.4, 0.7], [53, 200, 3.4, 3.1],
  [61, 240, 5.6, 1.9], [72, 160, 4.1, 0.3], [81, 300, 6.4, 2.2], [90, 190, 3.9, 4.0],
];

export function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: form });
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page" onMouseMove={parallax}>
      <PointerFX />
      <div className="login-grid" aria-hidden="true" />
      <div className="trails" aria-hidden="true">
        {TRAILS.map(([top, w, d, delay]) => <i key={top} className="trail" style={{ top: `${top}%`, '--w': `${w}px`, '--d': `${d}s`, '--delay': `${delay}s` }} />)}
      </div>
      <motion.div className="orb a" aria-hidden="true" animate={{ x: [0, 40, 0], y: [0, 30, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="orb b" aria-hidden="true" animate={{ x: [0, -30, 0], y: [0, -40, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} />
      <div className="login-stack ink">
      <motion.div
        initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 16, delay: 0.1 }}
      >
        <SocialOrbit size={230}><span className="login-orbit"><Logo className="" live /></span></SocialOrbit>
      </motion.div>
      <motion.div className="login-word" initial={{ opacity: 0, y: 10, letterSpacing: '0.4em' }} animate={{ opacity: 1, y: 0, letterSpacing: '0.08em' }} transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.25 }}>
        <strong>ETP</strong>
        <span>Esteira de Tráfego Pago</span>
      </motion.div>
      <motion.form
        className="card glass login-card"
        onSubmit={submit}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.45 }}
      >
        <p>Painel de campanhas e linha de montagem de anúncios.</p>
        {error && <motion.div className="form-error" role="alert" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [6, -4, 2, 0] }}>{error}</motion.div>}
        <div className="form-row">
          <label className="lbl" htmlFor="username">Usuário</label>
          <input id="username" className="field" autoComplete="username" autoFocus required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="form-row">
          <label className="lbl" htmlFor="password">Senha</label>
          <input id="password" type="password" className="field" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 6 }} disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </motion.form>
      </div>
    </div>
  );
}
