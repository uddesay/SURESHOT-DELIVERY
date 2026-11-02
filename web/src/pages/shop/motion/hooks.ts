/** Motion hooks and utilities for the storefront (components live in motion.tsx). */
import { useEffect, useRef, useState, type RefObject } from 'react';

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const finePointer = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;


// ---------------------------------------------------------------- reveal

let observer: IntersectionObserver | null = null;
const callbacks = new Map<Element, () => void>();

/** Calls `onEnter` once when the element scrolls into view (shared observer). */
function observeOnce(el: Element, onEnter: () => void) {
  if (typeof IntersectionObserver === 'undefined') { onEnter(); return () => undefined; }
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      callbacks.get(entry.target)?.();
      callbacks.delete(entry.target);
      observer?.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  callbacks.set(el, onEnter);
  observer.observe(el);
  return () => { callbacks.delete(el); observer?.unobserve(el); };
}

/** Adds `is-in` to the element the first time it enters the viewport. */
export function useInViewClass<T extends Element>(): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) { el.classList.add('is-in'); return; }
    return observeOnce(el, () => el.classList.add('is-in'));
  }, []);
  return ref;
}

// ---------------------------------------------------------------- scroll engine

const parallaxItems = new Map<HTMLElement, { speed: number; scale: number }>();

/**
 * Registers an element for scroll parallax. The element is moved relative to
 * its parent (which is what gets measured), so transforms never feed back.
 */
export function useParallax<T extends HTMLElement>(speed = 0.12, scale = 1.08) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !finePointer()) return;
    parallaxItems.set(el, { speed, scale });
    el.style.willChange = 'transform';
    return () => { parallaxItems.delete(el); el.style.transform = ''; el.style.willChange = ''; };
  }, [speed, scale]);
  return ref;
}

/** One passive, rAF-throttled scroll loop: progress bar, scrolled state and parallax. */
export function useScrollEngine(progressRef: RefObject<HTMLElement>, onScrolled: (scrolled: boolean) => void) {
  const latest = useRef(onScrolled);
  latest.current = onScrolled;
  useEffect(() => {
    let frame = 0;
    let wasScrolled: boolean | null = null;
    const tick = () => {
      frame = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      const scrolled = y > 24;
      if (scrolled !== wasScrolled) { wasScrolled = scrolled; latest.current(scrolled); }
      const vh = window.innerHeight;
      for (const [el, { speed, scale }] of parallaxItems) {
        const box = (el.parentElement ?? el).getBoundingClientRect();
        if (box.bottom < -100 || box.top > vh + 100) continue;
        // Never travel further than the scale headroom, so edges are never exposed.
        const limit = (box.height * (scale - 1)) / 2;
        const offset = Math.max(-limit, Math.min(limit, (box.top + box.height / 2 - vh / 2) * -speed));
        el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0) scale(${scale})`;
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(tick); };
    tick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [progressRef]);
}

/** Re-keys a child whenever `value` changes so its CSS animation replays (cart badge bump). */
export function useBumpKey(value: unknown) {
  const [key, setKey] = useState(0);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current !== value) setKey((k) => k + 1);
    previous.current = value;
  }, [value]);
  return key;
}

