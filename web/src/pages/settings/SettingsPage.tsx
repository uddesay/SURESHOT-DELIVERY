import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save, Settings as SettingsIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Field, Input, Textarea } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { apiGet, apiPatch } from '../../lib/apiClient';
import { formatRelative, fromMinor, humanize, toMinor } from '../../lib/format';

interface Setting { key: string; value: unknown; description: string | null; updated_at: string }

type Kind = 'money' | 'percent' | 'days' | 'number' | 'text' | 'json';

function kindOf(s: Setting): Kind {
  if (s.key.endsWith('_minor')) return 'money';
  if (s.key.endsWith('_percent')) return 'percent';
  if (s.key.endsWith('_days')) return 'days';
  if (typeof s.value === 'number') return 'number';
  if (typeof s.value === 'string') return 'text';
  return 'json';
}

const toDraft = (s: Setting): string => {
  const k = kindOf(s);
  if (k === 'money') return fromMinor(Number(s.value));
  if (k === 'json') return JSON.stringify(s.value ?? null, null, 2);
  return String(s.value ?? '');
};

function parse(s: Setting, draft: string): { value: unknown; error?: string } {
  const k = kindOf(s);
  if (k === 'text') return draft.trim() ? { value: draft.trim() } : { value: null, error: 'Can’t be empty.' };
  if (k === 'json') { try { return { value: JSON.parse(draft) }; } catch { return { value: null, error: 'Must be valid JSON.' }; } }
  const n = Number(draft);
  if (draft.trim() === '' || !Number.isFinite(n) || n < 0) return { value: null, error: 'Enter a number of zero or more.' };
  if (k === 'percent' && n > 100) return { value: null, error: 'Percent can’t exceed 100.' };
  if ((k === 'days' || k === 'number') && !Number.isInteger(n)) return { value: null, error: 'Use a whole number.' };
  return { value: k === 'money' ? toMinor(n) : n };
}

const label = (key: string) => humanize(key.split('.').slice(1).join(' ').replace(/_minor$|_percent$|_days$/, ''));

export function SettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => apiGet<Setting[]>('/admin/settings') });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async (keys: string[]) => {
      const rows = settings.data ?? [];
      const parsed = keys.map((key) => { const s = rows.find((r) => r.key === key)!; return { key, ...parse(s, drafts[key]!) }; });
      const bad = Object.fromEntries(parsed.filter((p) => p.error).map((p) => [p.key, p.error!]));
      setErrors(bad);
      if (Object.keys(bad).length) throw new Error('Fix the highlighted settings.');
      for (const p of parsed) await apiPatch(`/admin/settings/${encodeURIComponent(p.key)}`, { value: p.value });
      return keys;
    },
    onSuccess: (keys) => {
      toast.success(keys.length === 1 ? 'Setting saved' : `${keys.length} settings saved`, 'Takes effect immediately.');
      setDrafts((d) => { const n = { ...d }; keys.forEach((k) => delete n[k]); return n; });
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Settings couldn’t be saved.'),
  });

  const groups = useMemo(() => (settings.data ?? []).reduce<Record<string, Setting[]>>((acc, s) => { (acc[s.key.split('.')[0]!] ??= []).push(s); return acc; }, {}), [settings.data]);
  const dirtyKeys = Object.keys(drafts).filter((k) => { const s = settings.data?.find((r) => r.key === k); return s && drafts[k] !== toDraft(s); });

  if (settings.isLoading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Platform-wide rules for checkout, wallet, referrals and vendor payouts. Changes are audited."
        actions={dirtyKeys.length > 0 && (
          <>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => { setDrafts({}); setErrors({}); }}><RotateCcw className="h-4 w-4" /> Discard</Button>
            <Button size="sm" className="h-9" isLoading={save.isPending} onClick={() => save.mutate(dirtyKeys)}><Save className="h-4 w-4" /> Save {dirtyKeys.length} change{dirtyKeys.length === 1 ? '' : 's'}</Button>
          </>
        )}
      />
      {settings.error ? <Card><ErrorState message="Settings couldn’t load." error={settings.error} onRetry={() => void settings.refetch()} /></Card>
        : !settings.data?.length ? <Card><EmptyState icon={SettingsIcon} title="No settings configured" /></Card>
          : (
            <div className="grid gap-5 lg:grid-cols-2">
              {Object.entries(groups).map(([group, rows]) => (
                <Card key={group}>
                  <CardHeader title={humanize(group)} />
                  <div className="space-y-5 p-5">
                    {rows.map((s) => {
                      const k = kindOf(s);
                      const value = drafts[s.key] ?? toDraft(s);
                      const dirty = drafts[s.key] !== undefined && drafts[s.key] !== toDraft(s);
                      const set = (v: string) => { setDrafts((d) => ({ ...d, [s.key]: v })); setErrors((e) => { const n = { ...e }; delete n[s.key]; return n; }); };
                      const suffix = { money: '₹', percent: '%', days: 'days', number: '', text: '', json: '' }[k];
                      return (
                        <div key={s.key}>
                          <div className="relative">
                            <Field
                              label={<span className="flex items-center gap-2">{label(s.key)}{dirty && <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-label="unsaved" />}</span>}
                              error={errors[s.key]}
                              hint={<>{s.description ?? s.key} · updated {formatRelative(s.updated_at)}</>}
                            >
                              {k === 'json'
                                ? <Textarea rows={4} className="font-mono text-xs" value={value} onChange={(e) => set(e.target.value)} />
                                : <Input type={k === 'text' ? 'text' : 'number'} min={0} step={k === 'money' ? '0.01' : '1'} value={value} onChange={(e) => set(e.target.value)} className={k === 'money' ? 'pl-7' : suffix ? 'pr-12' : ''} />}
                            </Field>
                            {k === 'money' && <span aria-hidden className="pointer-events-none absolute left-3 top-[31px] text-sm text-muted">₹</span>}
                            {suffix && k !== 'money' && k !== 'json' && <span aria-hidden className="pointer-events-none absolute right-3 top-[33px] text-xs text-muted">{suffix}</span>}
                          </div>
                          {dirty && <div className="mt-2 flex justify-end"><Button size="xs" isLoading={save.isPending && save.variables?.length === 1 && save.variables[0] === s.key} onClick={() => save.mutate([s.key])}>Save</Button></div>}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          )}
    </div>
  );
}
