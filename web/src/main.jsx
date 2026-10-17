import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { api } from './lib/api.js';
import { Layout } from './components/Layout.jsx';
import { Logo } from './components/Icons.jsx';
import { Login } from './pages/Login.jsx';
import { Overview } from './pages/Overview.jsx';
import { Account } from './pages/Account.jsx';
import { Campaign } from './pages/Campaign.jsx';
import { Settings } from './pages/Settings.jsx';
import { AutoHub } from './pages/AutoHub.jsx';
import { AutoSources } from './pages/AutoSources.jsx';
import { AutoReview } from './pages/AutoReview.jsx';
import { EsteiraHub } from './pages/EsteiraHub.jsx';
import { EsteiraWizard } from './pages/EsteiraWizard.jsx';
import './styles.css';
import './esteira.css';
import './brand.css';
import './viz.css';
import './fx.css';

function readMotion() {
  try {
    return localStorage.getItem('esteira-motion') === 'reduced';
  } catch {
    return false;
  }
}

function App() {
  const [user, setUser] = useState(undefined);
  const [reduced, setReduced] = useState(readMotion);

  useEffect(() => {
    api('/api/auth/me').then((d) => setUser(d.user), () => setUser(null));
    const onUnauthorized = () => setUser(null);
    const onMotion = () => setReduced(readMotion());
    window.addEventListener('esteira:unauthorized', onUnauthorized);
    window.addEventListener('esteira:motion', onMotion);
    return () => {
      window.removeEventListener('esteira:unauthorized', onUnauthorized);
      window.removeEventListener('esteira:motion', onMotion);
    };
  }, []);

  useEffect(() => {
    if (reduced) document.documentElement.setAttribute('data-motion', 'reduced');
    else document.documentElement.removeAttribute('data-motion');
  }, [reduced]);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  if (user === undefined) return <div className="boot"><Logo className="" live /></div>;

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>
      {!user ? (
        <Login onLogin={setUser} />
      ) : (
        <Routes>
          <Route element={<Layout user={user} onLogout={logout} />}>
            <Route index element={<Overview />} />
            <Route path="conta/:accountId" element={<Account />} />
            <Route path="campanha/:campaignId" element={<Campaign />} />
            <Route path="esteira" element={<EsteiraHub />}>
              <Route path=":draftId" element={<EsteiraWizard />} />
            </Route>
            <Route path="automatica" element={<AutoHub />} />
            <Route path="automatica/fontes" element={<AutoSources user={user} />} />
            <Route path="automatica/revisao/:draftId" element={<AutoReview />} />
            <Route path="configuracoes" element={<Settings user={user} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
      <Toaster theme="dark" position="bottom-right" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font)' } }} />
    </MotionConfig>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
