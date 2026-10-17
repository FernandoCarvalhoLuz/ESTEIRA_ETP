import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../lib/api.js';
import { useLinkWithRange } from '../lib/range.js';
import { EASE_OUT } from '../lib/motion.js';
import { ConveyorIcon, HomeIcon, LayersIcon, PlusIcon, SettingsIcon } from './Icons.jsx';

export function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const withRange = useLinkWithRange();
  const [accounts, setAccounts] = useState(null);

  useEffect(() => {
    if (open && !accounts) api('/api/meta/account-list').then(setAccounts, () => setAccounts([]));
  }, [open, accounts]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function go(to) {
    onClose();
    navigate(to);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="cmdk-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
          >
            <Command className="cmdk" label="Paleta de comandos" loop>
              <Command.Input autoFocus placeholder="Buscar conta ou ação…" />
              <Command.List>
                <Command.Empty>Nada encontrado.</Command.Empty>
                <Command.Group heading="Ações">
                  <Command.Item onSelect={() => go('/esteira?nova=1')}><PlusIcon /> Nova campanha na Esteira</Command.Item>
                  <Command.Item onSelect={() => go(withRange('/'))}><HomeIcon /> Visão geral</Command.Item>
                  <Command.Item onSelect={() => go('/esteira')}><ConveyorIcon /> Esteira de Campanha</Command.Item>
                  <Command.Item onSelect={() => go('/esteira#modelos')}><LayersIcon /> Modelos de campanha</Command.Item>
                  <Command.Item onSelect={() => go('/configuracoes')}><SettingsIcon /> Configurações</Command.Item>
                </Command.Group>
                <Command.Group heading="Contas de anúncio">
                  {!accounts && <Command.Loading>Carregando contas…</Command.Loading>}
                  {accounts?.map((a) => (
                    <Command.Item key={a.id} value={`${a.name} ${a.id}`} onSelect={() => go(withRange(`/conta/${a.id}`))}>
                      <span className={`dot ${a.status === 1 ? 'good' : ''}`} aria-hidden="true" />
                      {a.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
              <div className="cmdk-foot"><span><kbd>↑↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
