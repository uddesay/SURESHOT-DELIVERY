import { useState } from 'react';

import { Button } from '../../components/ui/Button';
import { Field, Input, Switch, Textarea } from '../../components/ui/Input';
import { Drawer } from '../../components/ui/Modal';
import { Tabs } from '../../components/ui/Tabs';

export interface ContentForm { title: string; slug: string; body: string; isPublished: boolean; excerpt?: string; coverImageUrl?: string }

/** Shared editor for CMS pages and blog posts: write/preview, slug, publish toggle and validation. */
export function ContentEditor({
  open, onClose, title, initial, kind, saving, onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  initial: ContentForm;
  kind: 'page' | 'blog';
  saving: boolean;
  onSave: (form: ContentForm) => void;
}) {
  const [form, setForm] = useState(initial);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [errors, setErrors] = useState<Partial<Record<keyof ContentForm, string>>>({});

  const submit = (publish?: boolean) => {
    const next = publish === undefined ? form : { ...form, isPublished: publish };
    const e: typeof errors = {};
    if (!next.title.trim()) e.title = 'Add a title.';
    if (next.slug && !/^[a-z0-9-]+$/.test(next.slug)) e.slug = 'Use lowercase letters, numbers and dashes.';
    if (!next.body.trim()) e.body = 'Write something before saving.';
    if (next.coverImageUrl && !/^https?:\/\//.test(next.coverImageUrl)) e.coverImageUrl = 'Use a full http(s) URL.';
    setErrors(e);
    if (Object.keys(e).length) { setMode('write'); return; }
    onSave(next);
  };

  const words = form.body.trim() ? form.body.trim().split(/\s+/).length : 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-3xl"
      description={`${words} words · ~${Math.max(1, Math.round(words / 220))} min read`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {!form.isPublished && <Button variant="outline" isLoading={saving} onClick={() => submit(false)}>Save draft</Button>}
          <Button isLoading={saving} onClick={() => submit(true)}>{form.isPublished ? 'Save & keep published' : 'Publish'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" required error={errors.title}><Input value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="URL slug" error={errors.slug} hint={`/${kind === 'blog' ? 'blog/' : ''}${form.slug || 'generated-from-title'}`}>
          <Input className="font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} />
        </Field>
        {kind === 'blog' && (
          <>
            <Field label="Excerpt" hint={`${form.excerpt?.length ?? 0}/400 · shown on blog listings`}><Textarea rows={2} maxLength={400} value={form.excerpt ?? ''} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} /></Field>
            <Field label="Cover image URL" error={errors.coverImageUrl}><Input value={form.coverImageUrl ?? ''} placeholder="https://" onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })} /></Field>
            {form.coverImageUrl && /^https?:\/\//.test(form.coverImageUrl) && <img src={form.coverImageUrl} alt="Cover preview" className="aspect-[2/1] w-full rounded-xl object-cover" />}
          </>
        )}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-2">Content<span className="ml-0.5 text-danger">*</span></span>
            <Tabs label="Editor mode" variant="pill" value={mode} onChange={setMode} tabs={[{ key: 'write', label: 'Write' }, { key: 'preview', label: 'Preview' }]} />
          </div>
          {mode === 'write' ? (
            <>
              <Textarea aria-label="Content" aria-invalid={Boolean(errors.body)} rows={16} className="font-mono text-[13px]" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write in plain text. Leave a blank line between paragraphs." />
              {errors.body && <p className="mt-1.5 text-xs text-danger">{errors.body}</p>}
            </>
          ) : (
            <article className="min-h-[300px] rounded-xl border border-line bg-surface-2/40 p-6">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{form.title || 'Untitled'}</h1>
              {form.excerpt && <p className="mt-2 text-muted">{form.excerpt}</p>}
              <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ink-2">
                {form.body.split(/\n{2,}/).filter(Boolean).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
              </div>
            </article>
          )}
        </div>
        <div className="flex items-center justify-between rounded-lg border border-line p-3">
          <div><p className="text-sm font-medium">Published</p><p className="text-xs text-muted">Visible to customers on the storefront.</p></div>
          <Switch label="Published" checked={form.isPublished} onChange={(v) => setForm({ ...form, isPublished: v })} />
        </div>
      </div>
    </Drawer>
  );
}
