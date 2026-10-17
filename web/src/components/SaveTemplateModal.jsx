import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../lib/api.js';
import { fmtInt, fmtMoney } from '../lib/format.js';
import { Modal } from './Common.jsx';
import { StarIcon } from './Icons.jsx';

/** Confirma e salva uma campanha da Meta como modelo da conta (captura público, orçamento, criativos e textos). */
export function SaveTemplateModal({ campaign, onClose, onSaved }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!campaign) return;
    const offer = [...campaign.name.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]).find((s) => !/^(DOM|ENGAJAMENTO|MENSAGEM|WHATSAPP|CBO|ABO|REMARKETING|ESTOQUE)$/i.test(s.trim()));
    setName(offer || campaign.name);
  }, [campaign]);

  async function save() {
    setBusy(true);
    try {
      const { template, existed } = await api('/api/builder/templates/from-campaign', {
        method: 'POST',
        body: { campaignId: campaign.id, name, since: campaign.range?.since, until: campaign.range?.until },
      });
      toast.success(existed ? 'Esta campanha já era um modelo.' : 'Modelo salvo na conta.', {
        description: template.name,
        action: { label: 'Usar agora', onClick: () => navigate(`/esteira?modelo=${template.id}`) },
      });
      onSaved?.(template);
      onClose();
    } catch (err) {
      toast.error('Não foi possível salvar o modelo', { description: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(campaign)}
      onClose={onClose}
      title="Salvar como modelo"
      subtitle={campaign?.accountName ? `Fica disponível só para a conta ${campaign.accountName}.` : 'Fica disponível só para esta conta.'}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !name.trim()}>
            <StarIcon /> {busy ? 'Capturando configuração…' : 'Salvar modelo'}
          </button>
        </>
      )}
    >
      {campaign && (
        <>
          <div className="notice accent" style={{ marginBottom: 16 }}>
            <strong>{campaign.name}</strong>
            {campaign.metrics && (
              <div style={{ marginTop: 4 }}>
                {fmtMoney(campaign.metrics.costPerConversation, campaign.currency)} por conversa · {fmtInt(campaign.metrics.conversations)} conversas no período
              </div>
            )}
          </div>
          <label className="lbl" htmlFor="tpl-name">Nome do modelo</label>
          <input id="tpl-name" className="field" style={{ width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && save()} />
          <p className="hint">Vamos guardar público, raio, orçamento, página, número de WhatsApp, mensagem de boas-vindas, textos e criativos dessa campanha.</p>
        </>
      )}
    </Modal>
  );
}
