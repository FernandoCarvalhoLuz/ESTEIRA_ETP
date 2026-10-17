// Linguagem de movimento da plataforma: entradas curtas com expo-out e molas com pouco "quique".
export const EASE_OUT = [0.16, 1, 0.3, 1];

export const spring = { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 };
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 };

export const page = {
  initial: { opacity: 0, y: 14, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.42, ease: EASE_OUT }, transitionEnd: { filter: 'none' } },
  exit: { opacity: 0, y: -6, filter: 'blur(4px)', transition: { duration: 0.16 } },
};

export const stagger = (step = 0.045, delay = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

export const rise = {
  hidden: { opacity: 0, y: 14, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: EASE_OUT }, transitionEnd: { filter: 'none' } },
};

export const pop = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: EASE_OUT } },
};

/** Atualiza --x/--y do card para o efeito de holofote que segue o cursor. */
export function trackSpotlight(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--x', `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty('--y', `${e.clientY - rect.top}px`);
}
