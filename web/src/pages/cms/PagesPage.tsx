import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { DataTable } from '../../components/ui/DataTable';
import { Dropdown, DropdownItem, DropdownSeparator } from '../../components/ui/Dropdown';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { useToast } from '../../components/ui/Toast';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/apiClient';
import { formatDate } from '../../lib/format';
import { ContentEditor, type ContentForm } from './ContentEditor';

interface Page { id: string; slug: string; title: string; body: string; is_published: boolean; created_at: string; updated_at: string }

export function PagesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Page | 'new' | null>(null);
  const pages = useQuery({ queryKey: ['admin-pages'], queryFn: () => apiGet<Page[]>('/admin/cms/pages') });

  useEffect(() => {
    if (params.get('new')) { setEditing('new'); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-pages'] });
  const save = useMutation({
    mutationFn: (f: ContentForm) => {
      const body = { title: f.title.trim(), body: f.body, isPublished: f.isPublished, ...(f.slug ? { slug: f.slug } : {}) };
      return editing === 'new' ? apiPost('/admin/cms/pages', body) : apiPatch(`/admin/cms/pages/${(editing as Page).id}`, body);
    },
    onSuccess: (_d, f) => { toast.success(f.isPublished ? 'Page published' : 'Draft saved'); setEditing(null); invalidate(); },
    onError: (e) => toast.fromError(e, 'The page couldn’t be saved.'),
  });
  const togglePublish = useMutation({
    mutationFn: (p: Page) => apiPatch(`/admin/cms/pages/${p.id}`, { isPublished: !p.is_published }),
    onSuccess: (_d, p) => { toast.success(p.is_published ? 'Page unpublished' : 'Page published'); invalidate(); },
    onError: (e) => toast.fromError(e),
  });

  const rows = (pages.data ?? []).filter((p) => !q || `${p.title} ${p.slug}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title="Pages" description="About, policies, help — the evergreen pages of your store." actions={<Button size="sm" className="h-9" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New page</Button>} />
      <DataTable
        caption="Pages"
        rows={rows}
        rowKey={(p) => p.id}
        loading={pages.isLoading}
        error={pages.error}
        onRetry={() => void pages.refetch()}
        onRowClick={setEditing}
        toolbar={<SearchInput value={q} onChange={setQ} placeholder="Search pages…" delay={100} />}
        empty={{ icon: FileText, title: q ? 'No pages match' : 'No pages yet', message: 'Start with About, Shipping, Returns and Privacy.', action: !q && <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New page</Button> }}
        columns={[
          { id: 'title', header: 'Title', mobile: 'primary', hideable: false, cell: (p) => <div><p className="font-medium text-ink">{p.title}</p><p className="font-mono text-2xs text-faint">/{p.slug}</p></div> },
          { id: 'status', header: 'Status', cell: (p) => <Badge tone={p.is_published ? 'success' : 'neutral'} dot>{p.is_published ? 'Published' : 'Draft'}</Badge> },
          { id: 'updated', header: 'Updated', cell: (p) => formatDate(p.updated_at ?? p.created_at) },
        ]}
        rowActions={(p) => (
          <Dropdown align="end" trigger={(props) => <IconButton {...props} size="sm" label={`Actions for ${p.title}`}><MoreHorizontal className="h-4 w-4" /></IconButton>}>
            <DropdownItem icon={Pencil} onSelect={() => setEditing(p)}>Edit</DropdownItem>
            <DropdownItem icon={FileText} onSelect={() => togglePublish.mutate(p)}>{p.is_published ? 'Unpublish' : 'Publish'}</DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={Trash2} tone="danger" onSelect={() => void confirm({ title: `Delete “${p.title}”?`, description: 'Links to this page will stop working.', tone: 'danger', confirmLabel: 'Delete', onConfirm: async () => { await apiDelete(`/admin/cms/pages/${p.id}`); toast.success('Page deleted'); invalidate(); } })}>Delete</DropdownItem>
          </Dropdown>
        )}
      />
      {editing !== null && (
        <ContentEditor
          key={editing === 'new' ? 'new' : editing.id}
          open
          kind="page"
          onClose={() => setEditing(null)}
          title={editing === 'new' ? 'New page' : `Edit ${editing.title}`}
          initial={editing === 'new' ? { title: '', slug: '', body: '', isPublished: false } : { title: editing.title, slug: editing.slug, body: editing.body, isPublished: editing.is_published }}
          saving={save.isPending}
          onSave={(f) => save.mutate(f)}
        />
      )}
    </div>
  );
}
