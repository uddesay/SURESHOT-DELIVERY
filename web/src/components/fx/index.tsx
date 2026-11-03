/**
 * Motion components adapted from the Magic UI and Aceternity UI registries (both listed on 21st.dev):
 * BlurFade, NumberTicker, ShimmerButton, Marquee, AnimatedShinyText (magicui.design/r/*),
 * TextGenerateEffect, FocusCards, 3D card (ui.aceternity.com/registry/*).
 * Changes for Sureshot: no Next.js/`cn` dependency, router-aware links, project palette via CSS
 * classes in fx.css, and every effect falls back to a static render under prefers-reduced-motion.
 */
import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { motion, stagger, useAnimate, useInView, useMotionValue, useReducedMotion, useSpring, type UseInViewOptions } from 'motion/react';

import './fx.css';

/* ---------------------------------------------------------------- BlurFade (Magic UI) */
export function BlurFade({ children, className, delay = 0, duration = 0.45, offset = 10, inView = true, as = 'div', style }: {
  children: ReactNode; className?: string; delay?: number; duration?: number; offset?: number; inView?: boolean; as?: 'div' | 'li' | 'section' | 'article'; style?: CSSProperties;
}) {
  const ref = useRef(null);
  const seen = useInView(ref, { once: true, margin: '-40px' as UseInViewOptions['margin'] });
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) { const Plain = as; return <Plain className={className} style={style}>{children}</Plain>; }
  return (
    <Tag ref={ref} className={className} style={style}
      initial={{ opacity: 0, y: offset, filter: 'blur(6px)' }}
      animate={!inView || seen ? { opacity: 1, y: 0, filter: 'blur(0px)' } : undefined}
      transition={{ delay: 0.04 + delay, duration, ease: 'easeOut' }}>
      {children}
    </Tag>
  );
}

/* ---------------------------------------------------------------- NumberTicker (Magic UI) */
export function NumberTicker({ value, format = (n) => Math.round(n).toLocaleString('en-IN'), delay = 0, className, ...props }: {
  value: number; format?: (n: number) => string; delay?: number; className?: string;
} & Omit<ComponentPropsWithoutRef<'span'>, 'children'>) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const seen = useInView(ref, { once: true });
  useEffect(() => {
    if (!seen) return;
    if (reduce) { motionValue.jump(value); spring.jump(value); return; }
    const t = window.setTimeout(() => motionValue.set(value), delay * 1000);
    return () => window.clearTimeout(t);
  }, [seen, value, delay, reduce, motionValue, spring]);
  useEffect(() => spring.on('change', (v) => { if (ref.current) ref.current.textContent = format(v); }), [spring, format]);
  return <span ref={ref} className={clsx('tabular-nums', className)} {...props}>{format(reduce ? value : 0)}</span>;
}

/* ---------------------------------------------------------------- TextGenerateEffect (Aceternity) */
export function TextGenerateEffect({ words, className, duration = 0.5, as: Tag = 'span' }: { words: string; className?: string; duration?: number; as?: 'span' | 'p' }) {
  const [scope, animate] = useAnimate();
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || !scope.current) return;
    void animate('span', { opacity: 1, filter: 'blur(0px)' }, { duration, delay: stagger(0.08) });
  }, [animate, scope, duration, reduce, words]);
  return (
    <Tag ref={scope} className={className} aria-label={words}>
      {words.split(' ').map((w, i) => <motion.span key={w + i} aria-hidden="true" style={reduce ? undefined : { opacity: 0, filter: 'blur(10px)', display: 'inline-block' }}>{w}{' '}</motion.span>)}
    </Tag>
  );
}

/* ---------------------------------------------------------------- ShimmerButton (Magic UI) */
export function ShimmerButton({ children, className, ...props }: ComponentPropsWithoutRef<'button'>) {
  return (
    <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={clsx('fx-shimmer', className)} {...(props as ComponentPropsWithoutRef<typeof motion.button>)}>
      <span className="fx-shimmer-spark" aria-hidden="true"><span /></span>
      <span className="fx-shimmer-label">{children}</span>
    </motion.button>
  );
}

/* ---------------------------------------------------------------- Marquee (Magic UI) */
export function Marquee({ children, className, reverse, duration = 40, pauseOnHover = true }: { children: ReactNode; className?: string; reverse?: boolean; duration?: number; pauseOnHover?: boolean }) {
  return (
    <div className={clsx('fx-marquee', pauseOnHover && 'pause', reverse && 'reverse', className)} style={{ '--fx-duration': `${duration}s` } as CSSProperties}>
      {[0, 1].map((k) => <div key={k} className="fx-marquee-track" aria-hidden={k === 1 || undefined}>{children}</div>)}
    </div>
  );
}

/* ---------------------------------------------------------------- AnimatedShinyText (Magic UI) */
export function ShinyText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('fx-shiny', className)}>{children}</span>;
}

/* ---------------------------------------------------------------- FocusCards (Aceternity) */
export function FocusCards({ cards }: { cards: { title: string; src: string; to: string; meta?: string }[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div className="fx-focus">
      {cards.map((c, i) => (
        <BlurFade key={c.to} delay={i * 0.08} className={clsx('fx-focus-card', hovered !== null && hovered !== i && 'dim')}>
          <Link to={c.to} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(i)} onBlur={() => setHovered(null)}>
            <img src={c.src} alt="" loading="lazy" />
            <span className={clsx('fx-focus-overlay', hovered === i && 'on')}><b>{c.title}</b>{c.meta && <small>{c.meta}</small>}</span>
          </Link>
        </BlurFade>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- 3D card tilt (Aceternity) */
export function TiltCard({ children, className, strength = 25 }: { children: ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const fine = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (reduce || !fine) return <div className={className}>{children}</div>;
  return (
    <div className="fx-tilt-wrap" style={{ perspective: '1000px' }}>
      <div ref={ref} className={clsx('fx-tilt', className)}
        onMouseMove={(e) => { const el = ref.current; if (!el) return; const r = el.getBoundingClientRect(); el.style.transform = `rotateY(${(e.clientX - r.left - r.width / 2) / strength}deg) rotateX(${-(e.clientY - r.top - r.height / 2) / strength}deg)`; }}
        onMouseLeave={() => { if (ref.current) ref.current.style.transform = 'rotateY(0deg) rotateX(0deg)'; }}>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Progress ring (Reel 3 dashboard) */
export function ProgressRing({ value, size = 64, stroke = 6, label, tone = 'violet' }: { value: number; size?: number; stroke?: number; label?: string; tone?: 'violet' | 'coral' | 'mint' }) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span className={clsx('fx-ring', `tone-${tone}`)} style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(pct)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="track" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="bar" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - pct / 100) : c }} whileInView={{ strokeDashoffset: c * (1 - pct / 100) }} viewport={{ once: true }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <b>{Math.round(pct)}%</b>
    </span>
  );
}
