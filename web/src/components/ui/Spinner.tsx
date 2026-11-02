import { Loader2 } from 'lucide-react';

export function Spinner({ className = 'h-6 w-6', label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex items-center justify-center p-8">
      <Loader2 className={`${className} animate-spin text-sage`} aria-hidden />
    </div>
  );
}
