import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import { api, useApi } from '../lib/api.js';
import { fmtDate, fmtMoney, fmtInt } from '../lib/format.js';
import { useLinkWithRange, useRange } from '../lib/range.js';
import { page, spring, stagger, rise, EASE_OUT } from '../lib/motion.js';
import { CommandPalette } from './CommandPalette.jsx';
import { BrandLogo } from './Brands.jsx';
import { PointerFX } from './PointerFX.jsx';
import {
  BoltIcon, BrandLockup, ConveyorIcon, HomeIcon, LogoutIcon, PanelIcon, SearchIcon, SettingsIcon, ThemeIcon,
} from './Icons.jsx';

const THEMES = ['dark', 'light', 'auto'];
const THEME_LABEL = { auto: 'Tema automático', light: 'Tema claro', dark: 'Tema escuro' };

function readPref(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* armazenamento indisponível */
  }
}

const DAY = 86_400_000;

function withParam(href, key, value) {
  return `${href}${href.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
}

function TokenBanner() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    const load = () => api('/api/settings/meta').then(setStatus, () => {});
    load();
    window.addEventListener('esteira:token-updated', load);
    return () => window.removeEventListener('esteira:token-updated', load);
  }, []);
  if (!status) return null;
  const info = status.info;
  const now = Date.now();
  let tone = null;
  let message = null;
  if (!status.configured) {
    tone = 'critical';
    message = 'Nenhum token da Meta configurado — os dados não podem ser carregados.';
  } else if (!info?.valid) {
    tone = 'critical';
    message = 'O token da Meta está inválido ou expirou — os dados não podem ser carregados.';
  } else if (info.expiresAt && new Date(info.expiresAt).getTime() - now < 7 * DAY) {
    tone = 'warning';
    message = `O token da Meta expira em ${fmtDate(info.expiresAt.slice(0, 10))}.`;
  } else if (info.dataAccessExpiresAt && new Date(info.dataAccessExpiresAt).getTime() - now < 14 * DAY) {
    tone = 'warning';
    message = `O acesso aos dados da Meta expira em ${fmtDate(info.dataAccessExpiresAt.slice(0, 10))}. Reautorize o app ou gere um novo token.`;
  }
  if (!tone) return null;
  return (
    <div className={`banner ${tone}`} role="status">
      <span>{message}</span>
      <Link to="/configuracoes">Atualizar token</Link>
    </div>
  );
}

/** Pílula na topbar: conexão com a Meta (API) ativa ou com problema. */
function MetaPill() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    const load = () => api('/api/settings/meta').then(setStatus, () => {});
    load();
    window.addEventListener('esteira:token-updated', load);
    return () => window.removeEventListener('esteira:token-updated', load);
  }, []);
  if (!status) return null;
  const ok = status.configured && status.info?.valid;
  return (
    <Link to="/configuracoes" className="meta-pill" title={ok ? 'Conectado à API de Marketing da Meta' : 'Conexão com a Meta precisa de atenção'}>
      <BrandLogo name="meta" size={16} />
      {ok ? 'Meta conectada' : 'Meta desconectada'}
      <span className={`dot ${ok ? 'good pulse' : 'critical'}`} />
    </Link>
  );
}

function TopAdsets() {
  const { query } = useRange();
  const withRange = useLinkWithRange();
  const { data, loading } = useApi(`/api/meta/top-adsets?${query}`);
  const items = data?.items || [];
  const best = items[0]?.metrics.costPerConversation;

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-head">
        <h3>Top conjuntos</h3>
        <span title={`Mínimo de ${data?.minConversations ?? '…'} conversas no período`}>menor custo/conversa</span>
      </div>
      <div className="top-list">
        {loading && !data && [0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 78, borderRadius: 12 }} />)}
        {data && items.length === 0 && <div className="top-empty">Nenhum conjunto com conversas suficientes no período.</div>}
        <motion.div variants={stagger(0.05, 0.1)} initial="hidden" animate="show" key={query} style={{ display: 'contents' }}>
          {items.map((a, i) => (
            <motion.div key={a.id} variants={rise}>
              <Link
                to={withParam(withRange(`/campanha/${a.campaignId}`), 'conjunto', a.id)}
                className={`top-item ${i === 0 ? 'beam' : ''}`}
                title={`${a.name}\n${a.campaignName}`}
              >
                <span className={`top-rank ${i < 3 ? `r${i + 1}` : ''}`}>{i + 1}</span>
                <div className="top-name">{a.name}</div>
                <div className="top-meta">{a.accountName}</div>
                <div className="top-figures">
                  <strong>{fmtMoney(a.metrics.costPerConversation, a.currency)}</strong>
                  <span>{fmtInt(a.metrics.conversations)} conv.</span>
                </div>
                <div className="top-bar">
                  <motion.i
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: best ? best / a.metrics.costPerConversation : 0 }}
                    transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.15 + i * 0.05 }}
                  />
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

/** Linha dourada sob a topbar que acompanha a rolagem da página. */
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 260, damping: 40, mass: 0.4 });
  return <motion.span className="scroll-progress" style={{ scaleX }} aria-hidden="true" />;
}

const NAV = [
  { to: '/', label: 'Visão geral', icon: HomeIcon, end: true, keepRange: true },
  { to: '/esteira', label: 'Esteira de Campanha', icon: ConveyorIcon },
  { to: '/automatica', label: 'Esteira Automática', icon: BoltIcon, badge: 'news' },
  { to: '/configuracoes', label: 'Configurações', icon: SettingsIcon },
];

export function Layout({ user, onLogout }) {
  const [theme, setTheme] = useState(() => readPref('esteira-theme', 'dark'));
  const [collapsed, setCollapsed] = useState(() => readPref('esteira-sidebar', 'open') === 'collapsed');
  const [newsCount, setNewsCount] = useState(0);
  useEffect(() => {
    const load = () => api('/api/auto/news').then((n) => setNewsCount(n.length), () => {});
    load();
    const t = setInterval(load, 5 * 60_000);
    window.addEventListener('esteira:news-changed', load);
    return () => { clearInterval(t); window.removeEventListener('esteira:news-changed', load); };
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navHover, setNavHover] = useState(null);
  const withRange = useLinkWithRange();
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();

  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    writePref('esteira-theme', theme);
  }, [theme]);

  useEffect(() => writePref('esteira-sidebar', collapsed ? 'collapsed' : 'open'), [collapsed]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Transição por "seção": dentro da Esteira o overlay do assistente não troca a página de fundo.
  const sectionKey = location.pathname.startsWith('/esteira') ? '/esteira' : location.pathname.startsWith('/automatica') ? '/automatica' : location.pathname;
  const initials = (user.name || user.username).split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar ink">
        <div className="sidebar-head">
          <Link to={withRange('/')} className="brand">
            <BrandLockup />
          </Link>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
            <PanelIcon />
          </button>
        </div>
        <nav className="side-nav" onMouseLeave={() => setNavHover(null)}>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.keepRange ? withRange(item.to) : item.to} end={item.end} title={collapsed ? item.label : undefined} onMouseEnter={() => setNavHover(item.to)}>
              {({ isActive }) => (
                <>
                  {navHover === item.to && !isActive && <motion.span layoutId="nav-hover" className="nav-hover" transition={spring} />}
                  {isActive && <motion.span layoutId="nav-pill" className="nav-pill" transition={spring} />}
                  <item.icon />
                  <span className="nav-label">{item.label}</span>
                  {item.badge === 'news' && newsCount > 0 && <span className="nav-badge" title={`${newsCount} carro(s) novo(s) nos sites`}>{newsCount}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        {!collapsed && <TopAdsets />}
        {collapsed && <div style={{ flex: 1 }} />}
        <div className="sidebar-foot">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <span className="uname">{user.name}<small>{user.role === 'admin' ? 'Administrador' : 'Visualizador'}</small></span>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" title={THEME_LABEL[theme]} aria-label={THEME_LABEL[theme]} onClick={() => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length])}>
            <ThemeIcon />
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onLogout} aria-label="Sair" title="Sair"><LogoutIcon /></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)}>
            <SearchIcon />
            <span>Buscar conta, página ou ação…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-spacer" />
          <MetaPill />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/esteira?nova=1')}>
            <ConveyorIcon /> Nova campanha
          </button>
          <ScrollProgress />
        </header>
        <TokenBanner />
        <AnimatePresence mode="wait" initial={false}>
          <motion.main key={sectionKey} className="container" variants={page} initial="initial" animate="animate" exit="exit">
            {outlet}
          </motion.main>
        </AnimatePresence>
      </div>
      <PointerFX />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
