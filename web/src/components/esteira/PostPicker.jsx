import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { api } from '../../lib/api.js';
import { fmtDate } from '../../lib/format.js';
import { rise, stagger } from '../../lib/motion.js';
import { Modal, Segmented } from '../Common.jsx';

/** "Usar publicação existente" → Selecionar publicação (abas Facebook e Instagram, como no Gerenciador). */
export function PostPicker({ open, onClose, pageId, instagramId, onPick }) {
  const [tab, setTab] = useState('facebook');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !pageId) return;
    setData(null);
    setError(null);
    api(`/api/builder/posts?pageId=${pageId}${instagramId ? `&instagramId=${instagramId}` : ''}`).then(setData, setError);
  }, [open, pageId, instagramId]);

  const list = data?.[tab] || [];

  return (
    <Modal open={open} onClose={onClose} wide title="Selecionar publicação" subtitle="Publicações recentes da página. O anúncio usa o post como está, com o botão Enviar mensagem pelo WhatsApp.">
      <div className="lib-tabs">
        <Segmented
          value={tab}
          onChange={setTab}
          label="Origem da publicação"
          options={[['facebook', `Facebook${data ? ` (${data.facebook.length})` : ''}`], ['instagram', `Instagram${data ? ` (${data.instagram.length})` : ''}`]]}
        />
      </div>
      {error && <div className="notice critical">{error.message}</div>}
      {data?.notices?.filter((n) => n.toLowerCase().startsWith(tab) || !/^(facebook|instagram):/i.test(n)).map((n) => (
        <div key={n} className="notice warning" style={{ marginBottom: 12 }}>{n}</div>
      ))}
      {!data && !error && <div className="skeleton" style={{ height: 300 }} />}
      {data && list.length === 0 && <div className="empty">Nenhuma publicação encontrada aqui.</div>}
      <motion.div className="post-grid" variants={stagger(0.02)} initial="hidden" animate="show">
        {list.map((p) => (
          <motion.button variants={rise} key={p.id} type="button" className="post-item" onClick={() => onPick(p)}>
            <img src={p.picture} alt="" loading="lazy" referrerPolicy="no-referrer" />
            <span className="post-text">{p.message || 'Sem legenda'}</span>
            <span className="post-date">{p.createdAt ? fmtDate(p.createdAt.slice(0, 10)) : ''}{p.mediaType === 'VIDEO' ? ' · vídeo' : ''}</span>
          </motion.button>
        ))}
      </motion.div>
    </Modal>
  );
}
