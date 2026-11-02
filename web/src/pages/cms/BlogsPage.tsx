import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Newspaper, Pencil, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { DataTable } from '../../components/ui/DataTable';
import { Dropdown, DropdownItem, DropdownSeparator } from '../../components/ui/Dropdown';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { usePagedQuery } from '../../hooks/useListState';
import { apiDelete, apiPatch, apiPost } from '../../lib/apiClient';
import { formatDate } from '../../lib/format';
import { ContentEditor, type ContentForm } from './ContentEditor';

interface Blog { id: string; title: string; slug: string; excerpt: string | null; body: string; cover_image_url: string | null; author_name?: string | null; is_published: boolean; published_at: string | null; created_at: string }

export function BlogsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | 'draft' | 'published'>('');
  const [editing, setEditing] = useState<Blog | 'new' | null>(null);
  const blogs = usePagedQuery<Blog>(['admin-blogs'], '/admin/cms/blogs', { page, limit: 100 });

  useEffect(() => {
    if (params.get('new')) { setEditing('new'); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-blogs'] });
  const save = useMutation({
    mutationFn: (f: ContentForm) => {
      const body = {
        title: f.title.trim(), body: f.body, excerpt: f.excerpt ?? '', isPublished: f.isPublished,
        ...(f.slug ? { slug: f.slug } : {}), ...(f.coverImageUrl ? { coverImageUrl: f.coverImageUrl.trim() } : {}),
      };
      return editing === 'new' ? apiPost('/admin/cms/blogs', body) : apiPatch(`/admin/cms/blogs/${(editing as Blog).id}`, body);
    },
    onSuccess: (_d, f) => { toast.success(f.isPublished ? 'Post published' : 'Draft saved'); setEditing(null); invalidate(); },
    onError: (e) => toast.fromError(e, 'The post couldn’t be saved.'),
  });
  const togglePublish = useMutation({
    mutationFn: (b: Blog) => apiPatch(`/admin/cms/blogs/${b.id}`, { isPublished: !b.is_published }),
    onSuccess: (_d, b) => { toast.success(b.is_published ? 'Moved back to drafts' : 'Post published'); invalidate(); },
    onError: (e) => toast.fromError(e),
  });

  const rows = blogs.items.filter((b) => !status || (status === 'published' ? b.is_published : !b.is_published));
  const drafts = blogs.items.filter((b) => !b.is_published).length;

  return (
    <div>
      <PageHeader title="Blog" description="Stories, guides and edits that bring products to life." actions={<Button size="sm" className="h-9" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New post</Button>} />
      <Tabs label="Post status" className="mb-4" value={status} onChange={setStatus} tabs={[{ key: '', label: 'All', count: blogs.items.length }, { key: 'published', label: 'Published', count: blogs.items.length - drafts }, { key: 'draft', label: 'Drafts', count: drafts }]} />
      <DataTable
        caption="Blog posts"
        rows={rows}
        rowKey={(b) => b.id}
        loading={blogs.isLoading}
        error={blogs.error}
        onRetry={() => void blogs.refetch()}
        onRowClick={setEditing}
        pagination={blogs.totalPages > 1 ? { page, totalPages: blogs.totalPages, total: blogs.total, onPageChange: setPage } : undefined}
        empty={{ icon: Newspaper, title: status === 'draft' ? 'No drafts' : 'No posts yet', action: <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Write a post</Button> }}
        columns={[
          { id: 'post', header: 'Post', mobile: 'primary', hideable: false, cell: (b) => <div className="flex items-center gap-3">{b.cover_image_url ? <img src={b.cover_image_url} alt="" className="h-10 w-16 rounded-md object-cover" /> : <span className="flex h-10 w-16 items-center justify-center rounded-md bg-surface-2"><Newspaper className="h-4 w-4 text-faint" /></span>}<div className="min-w-0"><p className="line-clamp-1 font-medium text-ink">{b.title}</p><p className="line-clamp-1 text-xs text-faint">{b.excerpt || `/${b.slug}`}</p></div></div> },
          { id: 'status', header: 'Status', cell: (b) => <Badge tone={b.is_published ? 'success' : 'neutral'} dot>{b.is_published ? 'Published' : 'Draft'}</Badge> },
          { id: 'published', header: 'Published', cell: (b) => (b.published_at ? formatDate(b.published_at) : '—') },
          { id: 'created', header: 'Created', defaultHidden: true, cell: (b) => formatDate(b.created_at) },
        ]}
        rowActions={(b) => (
          <Dropdown align="end" trigger={(props) => <IconButton {...props} size="sm" label={`Actions for ${b.title}`}><MoreHorizontal className="h-4 w-4" /></IconButton>}>
            <DropdownItem icon={Pencil} onSelect={() => setEditing(b)}>Edit</DropdownItem>
            <DropdownItem icon={b.is_published ? Undo2 : Send} onSelect={() => togglePublish.mutate(b)}>{b.is_published ? 'Move to drafts' : 'Publish'}</DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={Trash2} tone="danger" onSelect={() => void confirm({ title: `Delete “${b.title}”?`, tone: 'danger', confirmLabel: 'Delete', onConfirm: async () => { await apiDelete(`/admin/cms/blogs/${b.id}`); toast.success('Post deleted'); invalidate(); } })}>Delete</DropdownItem>
          </Dropdown>
        )}
      />
      {editing !== null && (
        <ContentEditor
          key={editing === 'new' ? 'new' : editing.id}
          open
          kind="blog"
          onClose={() => setEditing(null)}
          title={editing === 'new' ? 'New post' : `Edit ${editing.title}`}
          initial={editing === 'new'
            ? { title: '', slug: '', body: '', excerpt: '', coverImageUrl: '', isPublished: false }
            : { title: editing.title, slug: editing.slug, body: editing.body, excerpt: editing.excerpt ?? '', coverImageUrl: editing.cover_image_url ?? '', isPublished: editing.is_published }}
          saving={save.isPending}
          onSave={(f) => save.mutate(f)}
        />
      )}
    </div>
  );
}
