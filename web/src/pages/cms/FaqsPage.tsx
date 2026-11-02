import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, HelpCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button, IconButton } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Field, Input, Switch, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/apiClient';
import { humanize } from '../../lib/format';

interface Faq { id: string; category: string; question: string; answer: string; sort_order: number; is_active: boolean }

const blank = { category: 'general', question: '', answer: '', sortOrder: '0', isActive: true };

export function FaqsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Faq | 'new' | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const faqs = useQuery({ queryKey: ['admin-faqs'], queryFn: () => apiGet<Faq[]>('/admin/cms/faqs') });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-faqs'] });
  const save = useMutation({
    mutationFn: () => {
      const body = { category: form.category.trim() || 'general', question: form.question.trim(), answer: form.answer.trim(), sortOrder: Number(form.sortOrder) || 0, isActive: form.isActive };
      return editing === 'new' ? apiPost('/admin/cms/faqs', body) : apiPatch(`/admin/cms/faqs/${(editing as Faq).id}`, body);
    },
    onSuccess: () => { toast.success(editing === 'new' ? 'FAQ added' : 'FAQ saved'); setEditing(null); invalidate(); },
    onError: (e) => toast.fromError(e),
  });
  const toggle = useMutation({
    mutationFn: (f: Faq) => apiPatch(`/admin/cms/faqs/${f.id}`, { isActive: !f.is_active }),
    onSuccess: (_d, f) => { toast.success(f.is_active ? 'FAQ hidden' : 'FAQ visible'); invalidate(); },
    onError: (e) => toast.fromError(e),
  });

  const grouped = useMemo(() => {
    const term = q.toLowerCase();
    const rows = (faqs.data ?? []).filter((f) => !term || `${f.question} ${f.answer} ${f.category}`.toLowerCase().includes(term)).sort((a, b) => a.sort_order - b.sort_order);
    return rows.reduce<Record<string, Faq[]>>((acc, f) => { (acc[f.category || 'general'] ??= []).push(f); return acc; }, {});
  }, [faqs.data, q]);

  const open = (f: Faq | 'new') => {
    setEditing(f);
    setError(null);
    setForm(f === 'new' ? blank : { category: f.category, question: f.question, answer: f.answer, sortOrder: String(f.sort_order), isActive: f.is_active });
  };

  return (
    <div>
      <PageHeader title="FAQs" description="Answers customers see on help pages, grouped by topic." actions={<Button size="sm" className="h-9" onClick={() => open('new')}><Plus className="h-4 w-4" /> Add FAQ</Button>} />
      <div className="mb-4"><SearchInput value={q} onChange={setQ} placeholder="Search questions and answers…" delay={100} /></div>
      {faqs.isLoading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        : faqs.error ? <Card><ErrorState message="FAQs couldn’t load." error={faqs.error} onRetry={() => void faqs.refetch()} /></Card>
          : Object.keys(grouped).length === 0 ? <Card><EmptyState icon={HelpCircle} title={q ? 'No FAQs match' : 'No FAQs yet'} action={!q && <Button size="sm" onClick={() => open('new')}><Plus className="h-4 w-4" /> Add FAQ</Button>} /></Card>
            : (
              <div className="space-y-6">
                {Object.entries(grouped).map(([category, items]) => (
                  <section key={category}>
                    <h2 className="eyebrow mb-2">{humanize(category)} · {items.length}</h2>
                    <Card className="divide-y divide-line">
                      {items.map((f) => (
                        <details key={f.id} className="group">
                          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 hover:bg-surface-2/60">
                            <ChevronDown className="h-4 w-4 shrink-0 text-faint transition-transform group-open:rotate-180" />
                            <span className={`flex-1 text-sm font-medium ${f.is_active ? 'text-ink' : 'text-muted line-through'}`}>{f.question}</span>
                            <span onClick={(e) => e.preventDefault()} className="flex items-center gap-1">
                              <Switch label={f.is_active ? 'Hide FAQ' : 'Show FAQ'} checked={f.is_active} onChange={() => toggle.mutate(f)} />
                              <IconButton size="sm" label="Edit FAQ" onClick={() => open(f)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                              <IconButton size="sm" tone="danger" label="Delete FAQ" onClick={() => void confirm({ title: 'Delete this FAQ?', tone: 'danger', confirmLabel: 'Delete', onConfirm: async () => { await apiDelete(`/admin/cms/faqs/${f.id}`); toast.success('FAQ deleted'); invalidate(); } })}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                            </span>
                          </summary>
                          <p className="whitespace-pre-line px-12 pb-4 text-sm leading-relaxed text-ink-2">{f.answer}</p>
                        </details>
                      ))}
                    </Card>
                  </section>
                ))}
              </div>
            )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add FAQ' : 'Edit FAQ'}
        size="lg"
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button isLoading={save.isPending} onClick={() => { if (!form.question.trim() || !form.answer.trim()) { setError('Both a question and an answer are required.'); return; } save.mutate(); }}>Save FAQ</Button></>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Topic" hint="e.g. shipping, returns, payments"><Input value={form.category} maxLength={60} list="faq-categories" onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label="Order"><Input type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
            <datalist id="faq-categories">{[...new Set((faqs.data ?? []).map((f) => f.category))].map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <Field label="Question" required><Input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /></Field>
          <Field label="Answer" required><Textarea rows={6} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} /></Field>
          <div className="flex items-center justify-between rounded-lg border border-line p-3"><span className="text-sm font-medium">Visible to customers</span><Switch label="Visible" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} /></div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
