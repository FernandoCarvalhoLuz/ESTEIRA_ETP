// Reações ao passar o mouse sobre elementos-chave, por delegação (um único listener para a página toda):
// - --x/--y em qualquer .card (holofote e borda que acende perto do cursor);
// - inclinação 3D em .tilt e atração magnética em .btn-primary/.magnetic;
// - ripple no clique de .btn.
// Não há cursor customizado: o ponteiro do sistema continua normal; só os elementos reagem.
// Usa as propriedades CSS independentes `rotate`/`translate`, que não brigam com o `transform` do motion.
// Desligado em telas de toque e quando o usuário pede menos movimento.
import { useEffect } from 'react';

function motionAllowed() {
  return !window.matchMedia('(pointer: coarse)').matches
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    && document.documentElement.getAttribute('data-motion') !== 'reduced';
}

export function PointerFX() {
  useEffect(() => {
    let enabled = motionAllowed();
    let tilted = null;
    let magnet = null;
    const reset = (el, prop) => { if (el) el.style[prop] = ''; };

    const onMove = (e) => {
      if (!enabled) return;
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;

      // Holofote e borda viva: coordenadas locais no card sob o cursor.
      const card = t.closest('.card, .spotlight');
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--x', `${e.clientX - r.left}px`);
        card.style.setProperty('--y', `${e.clientY - r.top}px`);
      }

      // Inclinação 3D (no máximo ~6°, ou data-tilt) na direção do cursor.
      const tilt = t.closest('.tilt');
      if (tilt !== tilted) { reset(tilted, 'rotate'); tilted = tilt; }
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const dx = (e.clientX - r.left) / r.width - 0.5;
        const dy = (e.clientY - r.top) / r.height - 0.5;
        const max = Number(tilt.dataset.tilt || 6);
        tilt.style.rotate = `${-dy} ${dx} 0 ${Math.hypot(dx, dy) * 2 * max}deg`;
      }

      // Botões magnéticos: deslocam alguns pixels em direção ao cursor.
      const mag = t.closest('.btn-primary:not(:disabled), .magnetic');
      if (mag !== magnet) { reset(magnet, 'translate'); magnet = mag; }
      if (mag) {
        const r = mag.getBoundingClientRect();
        mag.style.translate = `${(e.clientX - (r.left + r.width / 2)) * 0.18}px ${(e.clientY - (r.top + r.height / 2)) * 0.28}px`;
      }
    };

    const onDown = (e) => {
      const btn = e.target instanceof Element ? e.target.closest('.btn') : null;
      if (!btn || !enabled) return;
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2;
      const span = document.createElement('span');
      span.className = 'ripple';
      span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      btn.appendChild(span);
      span.addEventListener('animationend', () => span.remove());
    };
    const onLeave = () => {
      reset(tilted, 'rotate'); tilted = null;
      reset(magnet, 'translate'); magnet = null;
    };
    const onPref = () => { enabled = motionAllowed(); if (!enabled) onLeave(); };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('esteira:motion', onPref);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerdown', onDown);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('esteira:motion', onPref);
      onLeave();
    };
  }, []);

  return null;
}
