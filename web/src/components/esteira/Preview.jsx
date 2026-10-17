import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  adsForAdset, adsetPayload, applyPlaceholders, campaignName, campaignPayload, creativePayload, objectiveOf,
} from '../../../../shared/esteira.js';
import { fmtBudget } from '../../lib/format.js';
import { EASE_OUT } from '../../lib/motion.js';
import { Segmented } from '../Common.jsx';
import { ConveyorIcon, ImageIcon, LayersIcon, PinIcon, VideoIcon, WhatsappIcon } from '../Icons.jsx';
import { mediaThumb } from './kit.jsx';
import { BrandLogo } from '../Brands.jsx';

const nodeAnim = {
  initial: { opacity: 0, x: -10, scale: 0.98 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.35, ease: EASE_OUT } },
  exit: { opacity: 0, x: 10, transition: { duration: 0.15 } },
};

function geoSummary(adset) {
  const locs = (adset.geo?.locations || []).filter((l) => !l.excluded);
  if (!locs.length) return 'sem localização';
  return `${locs[0].name}${locs[0].radius ? ` +${locs[0].radius} km` : ''}${locs.length > 1 ? ` +${locs.length - 1}` : ''}`;
}

export function AdMock({ config, ad, page }) {
  const existing = ad?.source === 'existing';
  const thumb = existing ? ad.post?.picture : mediaThumb(ad?.media);
  const text = existing ? (ad.post?.message || 'Escolha a publicação existente.') : applyPlaceholders(ad?.primaryText, config, ad) || 'O texto principal do anúncio aparece aqui.';
  const headline = existing ? (config.destination.pageName || 'WhatsApp') : applyPlaceholders(ad?.headline, config, ad) || applyPlaceholders('{oferta}', config, ad) || 'Título do anúncio';
  return (
    <div className="ad-mock">
      <div className="ad-mock-head">
        <span className="av">{page?.picture && <img src={page.picture} alt="" referrerPolicy="no-referrer" />}</span>
        <div>
          <strong>{config.destination.pageName || 'Sua página'}</strong>
          <span>Patrocinado</span>
        </div>
        <span className="ad-mock-plats" title="Aparece no Facebook e no Instagram"><BrandLogo name="facebook" size={14} /><BrandLogo name="instagram" size={14} /></span>
      </div>
      <div className="ad-mock-text">{text}</div>
      <div className="ad-mock-media">
        {thumb ? (!existing && ad.media.kind === 'video' && ad.media.source === 'upload'
          ? <video src={thumb} muted playsInline />
          : <img src={thumb} alt="" referrerPolicy="no-referrer" />)
          : (ad?.media?.kind === 'video' ? <VideoIcon /> : <ImageIcon />)}
      </div>
      <div className="ad-mock-cta">
        <div>
          <small>WhatsApp</small>
          <strong>{headline}</strong>
        </div>
        <span className="wa-btn"><WhatsappIcon /> Enviar mensagem</span>
      </div>
    </div>
  );
}

export function WhatsAppMock({ config, page }) {
  const greeting = applyPlaceholders(config.destination.greeting, config);
  const autofill = applyPlaceholders(config.destination.autofill, config);
  return (
    <div className="wa-phone">
      <div className="wa-phone-head">
        <span className="av">{page?.picture && <img src={page.picture} alt="" referrerPolicy="no-referrer" />}</span>
        <strong>{config.destination.pageName || 'Sua empresa'}</strong>
      </div>
      <div className="wa-chat">
        <AnimatePresence mode="popLayout">
          {greeting && (
            <motion.div key={`g-${greeting}`} className="bubble in" initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
              {greeting}<small>agora</small>
            </motion.div>
          )}
          {autofill && (
            <motion.div key={`a-${autofill}`} className="bubble out" initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: 0.25 } }} exit={{ opacity: 0 }}>
              {autofill}<small>mensagem pronta do cliente</small>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function payloadPreview(config) {
  const fakeMedia = { imageHash: '<hash da imagem>', videoId: '<id do vídeo>', thumbnailUrl: '<miniatura>' };
  const ad = config.ads[0];
  return {
    campanha: campaignPayload(config),
    conjunto: config.adsets[0] ? adsetPayload(config, config.adsets[0], '<id da campanha>') : null,
    criativo: ad?.media || ad?.post ? creativePayload(config, ad, 0, fakeMedia, ad.storyMedia ? { imageHash: '<hash do stories>' } : null) : null,
  };
}

/** Painel lateral: estrutura sendo montada ao vivo, prévia do anúncio e payload que irá para a Meta. */
export function PreviewPanel({ config, assets }) {
  const [view, setView] = useState('estrutura');
  const page = assets?.pages?.find((p) => p.id === config.destination.pageId);
  return (
    <>
      <Segmented options={[['estrutura', 'Estrutura'], ['anuncio', 'Anúncio'], ['api', 'API']]} value={view} onChange={setView} label="Prévia" size="sm" />
      <div style={{ height: 14 }} />
      <AnimatePresence mode="wait">
        {view === 'estrutura' && (
          <motion.div key="e" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="side-title">Montagem ao vivo</div>
            <div className="card tree">
              <div className="tree-node">
                <span className="ic"><ConveyorIcon /></span>
                <span className="tx">
                  <strong>{campaignName(config)}</strong>
                  <span>{objectiveOf(config).label} → WhatsApp · {config.budget.level === 'campaign' ? fmtBudget({ [config.budget.type === 'lifetime' ? 'lifetime' : 'daily']: config.budget.amount }, 'BRL') : 'orçamento nos conjuntos'}</span>
                </span>
              </div>
              <div className="tree-children">
                <AnimatePresence initial={false}>
                  {config.adsets.map((a) => (
                    <motion.div key={a.key} layout {...nodeAnim}>
                      <div className="tree-node">
                        <span className="ic"><PinIcon /></span>
                        <span className="tx">
                          <strong>{applyPlaceholders(a.name, config) || 'Conjunto sem nome'}</strong>
                          <span>{geoSummary(a)} · {a.ageMin}–{a.ageMax} anos{a.interests.length ? ` · ${a.interests.length} interesse(s)` : ''}</span>
                        </span>
                      </div>
                      <div className="tree-children">
                        <AnimatePresence initial={false}>
                          {adsForAdset(config, a).map((ad, i) => {
                            const pic = ad.source === 'existing' ? ad.post?.picture : mediaThumb(ad.media);
                            return (
                            <motion.div key={ad.key} layout {...nodeAnim} className={`tree-node ${pic ? '' : 'empty'}`}>
                              {pic
                                ? <img src={pic} alt="" style={{ width: 26, height: 26, borderRadius: 7, objectFit: 'cover' }} referrerPolicy="no-referrer" />
                                : <span className="ic"><LayersIcon /></span>}
                              <span className="tx">
                                <strong>{applyPlaceholders(ad.name, config, ad) || `Anúncio ${i + 1}`}</strong>
                                <span>{ad.source === 'existing' ? (ad.post ? 'Publicação existente' : 'escolha a publicação') : ad.media ? `${ad.media.kind === 'video' ? 'Vídeo' : 'Imagem'}${ad.storyMedia ? ' + stories' : ''}` : 'sem mídia'}</span>
                              </span>
                            </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
            <div className="side-title">Mensagem no WhatsApp</div>
            <WhatsAppMock config={config} page={page} />
          </motion.div>
        )}
        {view === 'anuncio' && (
          <motion.div key="a" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="side-title">Prévia no feed</div>
            {config.ads.map((ad) => <AdMock key={ad.key} config={config} ad={ad} page={page} />)}
          </motion.div>
        )}
        {view === 'api' && (
          <motion.div key="p" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="side-title">O que será enviado à Meta</div>
            <pre className="json-box">{JSON.stringify(payloadPreview(config), null, 2)}</pre>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
