import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { applyPlaceholders, campaignName, fmtPrice, retargetConfig } from '../../../../shared/esteira.js';
import { api } from '../../lib/api.js';
import { Modal } from '../Common.jsx';
import { AlertIcon, ConveyorIcon, StarIcon } from '../Icons.jsx';
import { IntInput, MoneyInput, useCanvaVehicles } from './kit.jsx';

/**
 * Antes de usar um modelo: qual é o novo item? Os textos do modelo são reaproveitados trocando o item antigo
 * pelo novo, e a prévia mostra como fica (e o que ainda cita o carro antigo).
 */
export function NewItemModal({ open, template, onClose, onConfirm, confirmLabel = 'Montar campanha', busy }) {
  const [offer, setOffer] = useState({ title: '', priceValue: null, km: '', year: '' });
  const [stock, setStock] = useState([]);
  const canva = useCanvaVehicles(open ? template?.accountId : null);

  useEffect(() => {
    if (!open) return;
    setOffer({ title: '', priceValue: null, km: '', year: '' });
    setStock([]);
    if (template?.accountId) {
      // Estoque do site do cliente (Esteira Automática), quando a fonte estiver configurada.
      api(`/api/auto/clients/${template.accountId}/stock`).then((r) => setStock(r.items || []), () => {});
    }
  }, [open, template?.accountId]);

  const full = { ...offer, title: offer.title.trim(), price: fmtPrice(offer.priceValue) };
  const preview = useMemo(() => (template && full.title ? retargetConfig(template.config, full) : null), [template, full.title, full.price, full.km, full.year]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstAd = preview?.config.ads[0];
  const oldTitle = template?.config.offer?.title;

  function pickStock(v) {
    setOffer({ title: v.title, priceValue: v.price ?? null, km: v.km ? Number(String(v.km).replace(/\D/g, '')).toLocaleString('pt-BR') : '', year: v.year ? String(v.year) : '' });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Qual é o novo item?"
      subtitle={template ? `Modelo “${template.name}” — os textos e o padrão são reaproveitados para o novo carro.` : ''}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!full.title || busy} onClick={() => onConfirm(full)}><ConveyorIcon /> {confirmLabel}</button>
        </>
      )}
    >
      {template && (
        <div className="newitem">
          <div>
            <div className="q">
              <label htmlFor="ni-title">Novo veículo / oferta</label>
              <input id="ni-title" className="field field-lg" style={{ width: '100%' }} placeholder="Ex.: Volkswagen Nivus Highline 2024" value={offer.title} onChange={(e) => setOffer((o) => ({ ...o, title: e.target.value }))} autoFocus />
              {oldTitle && <div className="hint">Item do modelo: <strong>{oldTitle}</strong> — será trocado em nomes, textos e mensagens.</div>}
            </div>
            {stock.length > 0 && (
              <div className="q">
                <div className="q-label">Estoque do site <small>{stock.length} veículo(s)</small></div>
                <div className="stock-mini">
                  {stock.slice(0, 12).map((v) => (
                    <button key={v.id} type="button" className={`stock-chip ${offer.title === v.title ? 'on' : ''}`} onClick={() => pickStock(v)}>
                      {v.thumb && <img src={v.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" />}
                      <span><strong>{v.title}</strong><small>{[v.price ? fmtPrice(v.price) : null, v.km ? `${v.km} km` : null].filter(Boolean).join(' · ')}</small></span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {canva.length > 0 && (
              <div className="q">
                <div className="q-label">Com arte do Canva nesta conta</div>
                <div className="token-chips" style={{ marginTop: 0 }}>
                  {canva.map((v) => <button key={v} type="button" className="token-chip" style={{ fontFamily: 'var(--font)' }} onClick={() => setOffer((o) => ({ ...o, title: v }))}>{v}</button>)}
                </div>
              </div>
            )}
            <div className="row-3">
              <div className="q">
                <label htmlFor="ni-price">Preço</label>
                <MoneyInput id="ni-price" cents={false} style={{ width: '100%' }} value={offer.priceValue} onChange={(v) => setOffer((o) => ({ ...o, priceValue: v }))} />
              </div>
              <div className="q">
                <label htmlFor="ni-km">KM</label>
                <IntInput id="ni-km" style={{ width: '100%' }} placeholder="45.000" value={offer.km} onChange={(v) => setOffer((o) => ({ ...o, km: v }))} />
              </div>
              <div className="q">
                <label htmlFor="ni-year">Ano</label>
                <input id="ni-year" className="field mono-field" style={{ width: '100%' }} placeholder="2024" maxLength={9} value={offer.year} onChange={(e) => setOffer((o) => ({ ...o, year: e.target.value.replace(/[^\d/]/g, '') }))} />
              </div>
            </div>
          </div>
          <div className="newitem-preview">
            <div className="side-title"><StarIcon /> Como fica</div>
            <AnimatePresence mode="wait">
              {!preview ? (
                <motion.div key="empty" className="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Digite o novo item para ver a campanha adaptada.</motion.div>
              ) : (
                <motion.div key="p" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="name-preview">{campaignName(preview.config)}</div>
                  <dl className="mini-dl">
                    <dt>Conjuntos</dt><dd>{preview.config.adsets.map((a) => applyPlaceholders(a.name, preview.config)).join(' · ')}</dd>
                    <dt>Anúncio</dt><dd>{applyPlaceholders(firstAd?.name, preview.config, firstAd)}</dd>
                    {firstAd?.primaryText && <><dt>Texto</dt><dd className="pre">{applyPlaceholders(firstAd.primaryText, preview.config, firstAd)}</dd></>}
                    <dt>Mensagem</dt><dd>{applyPlaceholders(preview.config.destination.autofill, preview.config)}</dd>
                  </dl>
                  {preview.leftovers.length > 0 && (
                    <div className="notice warning" style={{ marginTop: 10 }}><AlertIcon width={13} /> Os textos ainda citam <strong>{preview.leftovers.join(', ')}</strong> do carro antigo. Revise na etapa Criativos.</div>
                  )}
                  {preview.collapsedAds > 1 && <div className="notice accent" style={{ marginTop: 10 }}>O modelo tinha {preview.collapsedAds} anúncios de carros diferentes: a nova campanha começa com um anúncio para este item.</div>}
                  <div className="hint">As mídias do modelo eram do carro antigo e não serão usadas. Você escolhe as artes do novo item na etapa Criativos (com sugestões do Canva).</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </Modal>
  );
}
