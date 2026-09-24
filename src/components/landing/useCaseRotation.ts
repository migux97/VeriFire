import { useEffect, useRef, useState } from 'react';

export const ROTATION_MS = 4000;

/** One clock drives the slide and its progress bar; pauses preserve the remaining time. */
export function useCaseRotation(count: number, inspecting: boolean, duration = ROTATION_MS) {
  const [slide, setSlide] = useState<{ active: number; previous: number | null }>({ active: 0, previous: null });
  const { active } = slide;
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const progressRef = useRef<HTMLSpanElement>(null);
  const remaining = useRef(duration);
  const previous = useRef(0);
  const playback = useRef<{ index: number; element: HTMLSpanElement; animation: Animation } | null>(null);

  useEffect(() => () => {
    playback.current?.animation.cancel();
    playback.current = null;
  }, []);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    media.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      media.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  // Reduced motion removes animation, not automatic product changes.
  const paused = inspecting || !visible;
  useEffect(() => {
    if (previous.current !== active) {
      remaining.current = duration;
      previous.current = active;
    }
    const progress = progressRef.current;
    const fraction = 1 - remaining.current / duration;
    const previousPlayback = playback.current;
    if (previousPlayback && (previousPlayback.index !== active || previousPlayback.element !== progress || reducedMotion)) {
      // Freeze the departing fill so it can fade out instead of snapping back to zero.
      const elapsed = Number(previousPlayback.animation.currentTime ?? 0);
      previousPlayback.element.style.transform = `scaleX(${Math.min(1, elapsed / duration)})`;
      previousPlayback.animation.cancel();
      playback.current = null;
    }
    if (progress && !playback.current) {
      progress.style.transform = `scaleX(${reducedMotion ? 1 : fraction})`;
      if (!reducedMotion && typeof progress.animate === 'function') {
        const animation = progress.animate([
          { transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }
        ], { duration, easing: 'linear', fill: 'both' });
        animation.pause();
        animation.currentTime = duration - remaining.current;
        playback.current = { index: active, element: progress, animation };
      }
    }
    const animation = playback.current?.animation;
    if (paused || count < 2) {
      animation?.pause();
      return;
    }
    animation?.play();
    const started = performance.now();
    // The timer must work even when the decorative bar cannot animate.
    const timer = window.setTimeout(() => setSlide((current) => ({
      active: (current.active + 1) % count, previous: current.active
    })), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
      animation?.pause();
    };
  }, [active, count, paused, reducedMotion, duration]);

  const select = (index: number) => {
    if (count < 1) return;
    const next = ((index % count) + count) % count;
    setSlide((current) => next === current.active ? current : { active: next, previous: current.active });
  };
  return { active, previous: slide.previous, select, progressRef, paused };
}
