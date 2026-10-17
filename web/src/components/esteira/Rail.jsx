import { motion } from 'motion/react';
import { STEPS } from '../../../../shared/esteira.js';
import { EASE_OUT, spring } from '../../lib/motion.js';
import { CheckIcon } from '../Icons.jsx';

/** Trilho de estações: a esteira avança até a etapa atual e um "card" viaja junto. */
export function Rail({ step, issues, onJump }) {
  const progress = step / (STEPS.length - 1);
  return (
    <div className="rail" role="tablist" aria-label="Etapas da campanha">
      <div className="rail-line" aria-hidden="true">
        <motion.i initial={false} animate={{ scaleX: progress }} transition={{ duration: 0.6, ease: EASE_OUT }} />
      </div>
      {STEPS.map((s, i) => {
        const count = issues[s.key]?.length || 0;
        const state = i < step ? 'done' : i === step ? 'current' : '';
        return (
          <button key={s.key} type="button" role="tab" aria-selected={i === step} className={`station ${state}`} onClick={() => onJump(i)}>
            <span className="station-node">
              {i === step && <motion.span layoutId="rail-rider" className="rider" transition={spring} />}
              {i < step && count === 0 ? <CheckIcon /> : i + 1}
              {count > 0 && i !== step && <span className="issue" title={`${count} pendência(s)`}>{count}</span>}
            </span>
            {s.short}
          </button>
        );
      })}
    </div>
  );
}
