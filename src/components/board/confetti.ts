import confetti from 'canvas-confetti';

const PALETTE = ['#FF2E88', '#FFD84D', '#2FE0C0', '#6B4EFF', '#FF8A3D'];

/** Fires the celebration burst. No-ops if the visitor asked for reduced motion. */
export function celebrate(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const defaults = {
    colors: PALETTE,
    disableForReducedMotion: true,
    scalar: 1.1,
    ticks: 220,
  };

  confetti({ ...defaults, particleCount: 70, spread: 62, origin: { y: 0.7 } });
  setTimeout(
    () => confetti({ ...defaults, particleCount: 45, spread: 100, origin: { x: 0.1, y: 0.75 } }),
    140,
  );
  setTimeout(
    () => confetti({ ...defaults, particleCount: 45, spread: 100, origin: { x: 0.9, y: 0.75 } }),
    240,
  );
}
