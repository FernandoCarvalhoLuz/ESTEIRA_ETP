import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { api } from '../../lib/api.js';
import { EASE_OUT, rise, stagger } from '../../lib/motion.js';
import { Modal, Segmented } from '../Common.jsx';
import { CanvaIcon, ImageIcon, TrashIcon, UploadIcon, VideoIcon, WandIcon } from '../Icons.jsx';

function uploadFile(file, accountId, scope, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('accountId', accountId);
    if (scope) form.append('scope', scope);
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/builder/media');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* sem JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body?.error?.message || `Erro ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Falha de rede no envio.'));
    xhr.send(form);
  });
}

const fromLocal = (m) => ({ kind: m.kind, source: 'upload', mediaId: m.id, name: m.canva?.vehicle || m.originalName, thumbUrl: m.url });

/**
 * Biblioteca de criativos da conta. `slot` = 'media' (feed/vídeo) ou 'storyMedia' (só imagem vertical).
 * onPick(media, storyPair?) — no Canva, escolher uma arte de feed oferece o par de stories do mesmo veículo.
 */
export function MediaLibrary({ open, onClose, accountId, slot, onPick }) {
  const [tab, setTab] = useState('canva');
  const [lib, setLib] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const storyOnly = slot === 'storyMedia';

  const load = () => api(`/api/builder/media?accountId=${accountId}`).then(setLib, (e) => toast.error('Não foi possível carregar a biblioteca', { description: e.message }));
  useEffect(() => {
    if (open && accountId) load();
  }, [open, accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lib && open) setTab(lib.canva.length ? 'canva' : 'enviados');
  }, [open, lib === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const canvaGroups = useMemo(() => {
    const groups = new Map();
    for (const m of lib?.canva || []) {
      const key = `${m.canva.vehicle} ${m.canva.year}`.trim();
      const g = groups.get(key) || { key, feed: [], story: [] };
      g[m.canva.format === 'story' ? 'story' : 'feed'].push(m);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [lib]);

  async function handleFiles(files, scope) {
    for (const file of files) {
      const id = `${file.name}-${Date.now()}`;
      setUploads((u) => [...u, { id, name: file.name, progress: 0 }]);
      try {
        await uploadFile(file, accountId, scope, (p) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))));
        toast.success('Arquivo enviado', { description: file.name });
      } catch (err) {
        toast.error(`Falha ao enviar ${file.name}`, { description: err.message });
      } finally {
        setUploads((u) => u.filter((x) => x.id !== id));
      }
    }
    load();
  }

  async function removeLocal(m, e) {
    e.stopPropagation();
    if (!window.confirm(`Remover "${m.originalName}" da biblioteca?`)) return;
    await api(`/api/builder/media/${m.id}`, { method: 'DELETE' });
    load();
  }

  // Par automático só quando não há ambiguidade: uma arte de feed e uma de stories com o mesmo nome.
  function pickCanva(m, group) {
    if (storyOnly) return onPick(fromLocal(m));
    const pair = m.canva.format === 'feed' && group.feed.length === 1 && group.story.length === 1 ? group.story[0] : null;
    onPick(fromLocal(m), pair ? fromLocal(pair) : null);
    if (pair) toast.success('Par feed + stories aplicado', { description: group.key });
  }

  async function rename(m, e) {
    e.stopPropagation();
    const label = window.prompt('Nome do veículo/oferta desta arte (usado para agrupar e montar o par feed + stories):', m.canva?.vehicle || m.originalName);
    if (!label?.trim()) return;
    await api(`/api/builder/media/${m.id}`, { method: 'PATCH', body: { label: label.trim() } });
    load();
  }

  const dropzone = (scope, label) => (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      onClick={() => { input.current.dataset.scope = scope || ''; input.current.click(); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handleFiles([...e.dataTransfer.files], scope); }}
      role="button"
      tabIndex={0}
    >
      <UploadIcon /> {label}
    </div>
  );

  const tile = (m, onClick, extra = {}) => (
    <motion.button variants={rise} type="button" key={m.id || m.hash} className={`lib-item ${extra.story ? 'story' : ''}`} onClick={onClick} title={extra.title}>
      {m.kind === 'video' && m.source !== 'meta' && !m.picture ? <video src={m.url} muted preload="metadata" /> : <img src={extra.src} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      {extra.tag && <span className="kind tag">{extra.tag}</span>}
      <div className="cap">{extra.caption}</div>
      {extra.onDelete && (
        <span role="button" tabIndex={0} className="btn btn-ghost btn-icon btn-sm btn-danger" style={{ position: 'absolute', top: 4, right: 4, background: 'var(--surface)' }} onClick={extra.onDelete} title="Remover"><TrashIcon /></span>
      )}
      {extra.onRename && (
        <span role="button" tabIndex={0} className="btn btn-ghost btn-icon btn-sm" style={{ position: 'absolute', top: 4, right: 4, background: 'var(--surface)' }} onClick={extra.onRename} title="Renomear"><WandIcon /></span>
      )}
      {extra.review && <span className="tag warning" style={{ position: 'absolute', bottom: 34, left: 6 }}>revisar nome</span>}
    </motion.button>
  );

  return (
    <Modal open={open} onClose={onClose} wide title={storyOnly ? 'Arte para stories (9:16)' : 'Biblioteca de criativos'} subtitle="Somente artes desta conta. Cada conta é um cliente diferente.">
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept={storyOnly ? 'image/png,image/jpeg' : 'image/png,image/jpeg,video/mp4,video/quicktime'}
        onChange={(e) => { handleFiles([...e.target.files], e.target.dataset.scope || undefined); e.target.value = ''; }}
      />
      <div className="lib-tabs">
        <Segmented
          value={tab}
          onChange={setTab}
          label="Origem"
          options={[['canva', `Canva${lib ? ` (${lib.canva.length})` : ''}`], ['enviados', `Enviados${lib ? ` (${lib.local.length})` : ''}`], ['meta', 'Já na Meta']]}
        />
      </div>
      {uploads.map((u) => (
        <div key={u.id} className="upload-row">
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{u.name}</span>
          <span className="bar"><motion.i animate={{ scaleX: u.progress }} transition={{ ease: EASE_OUT }} /></span>
          <span className="mono">{Math.round(u.progress * 100)}%</span>
        </div>
      ))}
      {!lib && <div className="skeleton" style={{ height: 280 }} />}

      {lib && tab === 'canva' && (
        <>
          {dropzone('canva', 'Importar artes exportadas do Canva para esta conta (arraste PNGs aqui)')}
          {canvaGroups.length === 0 && <div className="empty"><CanvaIcon /> Nenhuma arte do Canva nesta conta ainda.</div>}
          {canvaGroups.some((g) => g.feed.length > 1 || g.story.length > 1) && (
            <div className="notice warning" style={{ marginBottom: 14 }}>
              O Canva exportou algumas páginas com o mesmo nome de arquivo. Use o botão de renomear nas artes marcadas para agrupar cada veículo certo — o par feed + stories é montado automaticamente quando o nome bate.
            </div>
          )}
          {canvaGroups.map((g) => (
            <div key={g.key} className="lib-group">
              <h4>{g.key} <span className="tag">{g.feed.length} feed · {g.story.length} stories</span></h4>
              <motion.div className="lib-grid" variants={stagger(0.02)} initial="hidden" animate="show">
                {(storyOnly ? g.story : [...g.feed, ...g.story]).map((m) => tile(m, () => pickCanva(m, g), {
                  src: m.url,
                  story: m.canva.format === 'story',
                  tag: m.canva.isBase ? 'quadro base' : m.canva.format === 'story' ? 'stories' : 'feed',
                  caption: m.canva.renamed ? m.canva.vehicle : `${m.canva.template} · var. ${m.canva.variant}`,
                  title: m.originalName,
                  onRename: (e) => rename(m, e),
                  review: !m.canva.renamed && !m.canva.isBase && (m.canva.format === 'feed' ? g.feed.length > 1 : g.story.length > 1),
                }))}
              </motion.div>
            </div>
          ))}
        </>
      )}

      {lib && tab === 'enviados' && (
        <>
          {dropzone(undefined, storyOnly ? 'Enviar imagem vertical (PNG/JPG)' : 'Enviar imagem ou vídeo (JPG, PNG, MP4, MOV — até 1 GB)')}
          {lib.local.length === 0 && <div className="empty">Nenhum arquivo enviado nesta conta.</div>}
          <motion.div className="lib-grid" variants={stagger(0.02)} initial="hidden" animate="show">
            {lib.local.filter((m) => !storyOnly || m.kind === 'image').map((m) => tile(m, () => onPick(fromLocal(m)), {
              src: m.url,
              tag: m.kind === 'video' ? 'vídeo' : null,
              caption: m.originalName,
              onDelete: (e) => removeLocal(m, e),
            }))}
          </motion.div>
        </>
      )}

      {lib && tab === 'meta' && (
        <>
          <div className="lib-group">
            <h4><ImageIcon /> Imagens da conta</h4>
            <motion.div className="lib-grid" variants={stagger(0.015)} initial="hidden" animate="show">
              {lib.meta.images.map((m) => tile({ ...m, id: m.hash, kind: 'image', source: 'meta' }, () => onPick({ kind: 'image', source: 'meta', hash: m.hash, thumbUrl: m.url, name: m.name }), {
                src: m.url,
                story: m.height > m.width * 1.5,
                caption: m.name,
              }))}
            </motion.div>
          </div>
          {!storyOnly && (
            <div className="lib-group">
              <h4><VideoIcon /> Vídeos da conta</h4>
              <motion.div className="lib-grid" variants={stagger(0.015)} initial="hidden" animate="show">
                {lib.meta.videos.map((v) => tile({ ...v, kind: 'video', source: 'meta' }, () => onPick({ kind: 'video', source: 'meta', videoId: v.id, thumbUrl: v.picture, name: v.title }), {
                  src: v.picture,
                  tag: 'vídeo',
                  caption: v.title,
                }))}
              </motion.div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
