import clsx from 'clsx';
import { useState } from 'react';

import { initials } from '../../lib/format';

const palette = ['bg-brand-soft text-sage', 'bg-info-soft text-info', 'bg-violet-soft text-violet', 'bg-warning-soft text-warning', 'bg-success-soft text-success'];

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name, src, size = 'md', square, className,
}: { name?: string | null; src?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg'; square?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  const sizes = { xs: 'h-6 w-6 text-[10px]', sm: 'h-8 w-8 text-xs', md: 'h-9 w-9 text-[13px]', lg: 'h-14 w-14 text-lg' };
  const shape = square ? 'rounded-lg' : 'rounded-full';
  if (src && !broken) {
    return <img src={src} alt="" onError={() => setBroken(true)} className={clsx('shrink-0 border border-line object-cover', sizes[size], shape, className)} />;
  }
  return (
    <span aria-hidden className={clsx('inline-flex shrink-0 items-center justify-center font-semibold', sizes[size], shape, palette[hash(name || '?') % palette.length], className)}>
      {initials(name)}
    </span>
  );
}
