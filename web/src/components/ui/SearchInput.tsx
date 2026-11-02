import clsx from 'clsx';
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Debounced search box; emits after the user pauses typing. */
export function SearchInput({
  value, onChange, placeholder = 'Search…', className, delay = 300, label,
}: { value: string; onChange: (value: string) => void; placeholder?: string; className?: string; delay?: number; label?: string }) {
  const [draft, setDraft] = useState(value);
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = window.setTimeout(() => latest.current(draft.trim()), delay);
    return () => window.clearTimeout(t);
  }, [draft, value, delay]);

  return (
    <div className={clsx('relative w-full sm:w-72', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
      <input
        type="search"
        aria-label={label ?? placeholder}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') latest.current(draft.trim()); }}
        className="field h-9 pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button aria-label="Clear search" onClick={() => { setDraft(''); latest.current(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
