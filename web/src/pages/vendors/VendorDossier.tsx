import { useMutation } from '@tanstack/react-query';
import { Building2, CheckCircle2, ExternalLink, FileText, Landmark, Mail, Phone, ShieldCheck, UserRound, Warehouse, XCircle } from 'lucide-react';

import { peopleApi, type VendorDetail } from '../../api/people';
import { useAuth } from '../../auth/AuthContext';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, DescriptionList } from '../../components/ui/Card';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { formatDate, humanize } from '../../lib/format';
import { commissionLabel } from './vendorFormat';

export function VendorBusinessCard({ vendor }: { vendor: VendorDetail }) {
  return (
    <Card>
      <CardHeader title="Business" action={<Building2 className="h-4 w-4 text-faint" />} />
      <div className="px-5 pb-3">
        <DescriptionList items={[
          { label: 'Store name', value: vendor.store_name },
          { label: 'Business type', value: humanize(vendor.business_type) },
          { label: 'GSTIN', value: vendor.gstin ? <span className="font-mono">{vendor.gstin}</span> : '—' },
          { label: 'PAN', value: vendor.pan ? <span className="font-mono">{vendor.pan}</span> : '—' },
          { label: 'Support email', value: vendor.support_email },
          { label: 'Support phone', value: vendor.support_phone },
          { label: 'Commission', value: commissionLabel(vendor.commission_rate_bp) },
          { label: 'Applied', value: formatDate(vendor.created_at) },
          { label: 'Approved', value: vendor.approved_at ? formatDate(vendor.approved_at) : '—' },
        ]} />
        {vendor.description && <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-muted">{vendor.description}</p>}
      </div>
    </Card>
  );
}

export function VendorOwnerCard({ vendor }: { vendor: VendorDetail }) {
  const o = vendor.owner;
  return (
    <Card>
      <CardHeader title="Owner" action={<UserRound className="h-4 w-4 text-faint" />} />
      <div className="space-y-2 p-5 text-sm">
        <p className="font-medium text-ink">{o?.full_name ?? '—'}</p>
        {o?.email && <a href={`mailto:${o.email}`} className="flex items-center gap-2 text-ink-2 hover:text-ink"><Mail className="h-4 w-4 text-faint" /> {o.email}</a>}
        {o?.phone && <a href={`tel:${o.phone}`} className="flex items-center gap-2 text-ink-2 hover:text-ink"><Phone className="h-4 w-4 text-faint" /> {o.phone}</a>}
      </div>
    </Card>
  );
}

export function VendorDocumentsCard({ vendor, onChanged }: { vendor: VendorDetail; onChanged: () => void }) {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canReview = hasPermission('vendors:approve');
  const approveDoc = useMutation({
    mutationFn: (docId: string) => peopleApi.reviewKyc(docId, 'approved'),
    onSuccess: () => { toast.success('Document approved'); onChanged(); },
    onError: (e) => toast.fromError(e),
  });
  const verify = useMutation({
    mutationFn: (id: string) => peopleApi.verifyBank(id),
    onSuccess: () => { toast.success('Bank account verified'); onChanged(); },
    onError: (e) => toast.fromError(e),
  });
  const pendingDocs = vendor.kycDocuments.filter((d) => d.status === 'pending').length;

  return (
    <>
      <Card>
        <CardHeader
          title="KYC documents"
          description={vendor.kycDocuments.length ? `${pendingDocs} awaiting review` : undefined}
          action={pendingDocs ? <Badge tone="warning" dot>Review needed</Badge> : vendor.kycDocuments.length ? <Badge tone="success" dot>Reviewed</Badge> : null}
        />
        {vendor.kycDocuments.length === 0 ? (
          <EmptyState compact icon={FileText} title="No documents uploaded" message="The vendor uploads KYC documents from the seller app." />
        ) : (
          <ul className="divide-y divide-line">
            {vendor.kycDocuments.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <FileText className="h-4 w-4 text-faint" />
                <div className="min-w-0 flex-1">
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-ink hover:underline">{humanize(d.doc_type)} <ExternalLink className="h-3 w-3" /></a>
                  <p className="text-xs text-faint">Uploaded {formatDate(d.created_at)}{d.rejection_reason ? ` · ${d.rejection_reason}` : ''}</p>
                </div>
                <StatusBadge status={d.status} />
                {canReview && d.status === 'pending' && (
                  <div className="flex gap-1.5">
                    <Button size="xs" isLoading={approveDoc.isPending && approveDoc.variables === d.id} onClick={() => approveDoc.mutate(d.id)}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</Button>
                    <Button size="xs" variant="outline" onClick={() => void confirm({
                      title: `Reject ${humanize(d.doc_type)}?`, tone: 'danger', confirmLabel: 'Reject document',
                      reason: { label: 'Reason shared with the vendor', required: true, minLength: 3 },
                      onConfirm: async (reason) => { await peopleApi.reviewKyc(d.id, 'rejected', reason); toast.success('Document rejected'); onChanged(); },
                    })}><XCircle className="h-3.5 w-3.5" /> Reject</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Bank accounts" action={<Landmark className="h-4 w-4 text-faint" />} />
        {vendor.bankAccounts.length === 0 ? (
          <EmptyState compact icon={Landmark} title="No bank account added" message="Payouts need a verified bank account." />
        ) : (
          <ul className="divide-y divide-line">
            {vendor.bankAccounts.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{b.bankName} · <span className="font-mono">{b.accountNumberMasked}</span></p>
                  <p className="text-xs text-faint">{b.accountHolder} · IFSC <span className="font-mono">{b.ifsc}</span>{b.isPrimary ? ' · Primary' : ''}</p>
                </div>
                {b.isVerified ? <Badge tone="success" dot><ShieldCheck className="h-3 w-3" /> Verified</Badge> : canReview ? (
                  <Button size="xs" variant="outline" isLoading={verify.isPending && verify.variables === b.id} onClick={() => verify.mutate(b.id)}>Mark verified</Button>
                ) : <Badge tone="warning">Unverified</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Warehouses" action={<Warehouse className="h-4 w-4 text-faint" />} />
        {vendor.warehouses.length === 0 ? (
          <EmptyState compact icon={Warehouse} title="No warehouse yet" message="Stock is held per warehouse; the vendor adds one from the seller app." />
        ) : (
          <ul className="divide-y divide-line">
            {vendor.warehouses.map((w) => (
              <li key={w.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-ink">{w.name}<span className="text-muted"> · {w.city}, {w.state}</span></span>
                {!w.is_active && <Badge>Inactive</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
