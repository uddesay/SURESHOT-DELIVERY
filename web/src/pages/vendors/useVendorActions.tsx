import { useMutation, useQueryClient } from '@tanstack/react-query';

import { peopleApi } from '../../api/people';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';

/** Approval-workflow actions shared by the vendor list, applications and profile screens. */
export function useVendorActions() {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const invalidate = () => {
    for (const k of ['admin-vendors', 'admin-vendor', 'shell-queues', 'admin-overview', 'admin-activity']) void queryClient.invalidateQueries({ queryKey: [k] });
  };
  const run = async (fn: () => Promise<unknown>, success: string) => { await fn(); toast.success(success); invalidate(); };

  const approve = useMutation({
    mutationFn: (id: string) => peopleApi.approveVendor(id),
    onSuccess: () => { toast.success('Vendor approved', 'They can start listing products right away.'); invalidate(); },
    onError: (e) => toast.fromError(e, 'The vendor couldn’t be approved.'),
  });

  return {
    invalidate,
    approving: approve.isPending,
    approve: (v: { id: string; store_name: string }) => confirm({
      title: `Approve ${v.store_name}?`,
      description: 'The store goes live on Sureshot and the owner is notified. All KYC documents must already be reviewed.',
      confirmLabel: 'Approve vendor',
      onConfirm: () => approve.mutateAsync(v.id),
    }),
    reject: (v: { id: string; store_name: string }) => confirm({
      title: `Reject ${v.store_name}?`,
      description: 'The applicant is notified with your reason. This closes the application.',
      tone: 'danger',
      confirmLabel: 'Reject application',
      reason: { label: 'Reason shared with the applicant', required: true, minLength: 5 },
      onConfirm: (reason) => run(() => peopleApi.rejectVendor(v.id, reason), 'Application rejected'),
    }),
    requestInfo: (v: { id: string; store_name: string }) => confirm({
      title: `Request information from ${v.store_name}`,
      description: 'The application moves to “In review” and the applicant receives your message as a notification.',
      confirmLabel: 'Send request',
      reason: { label: 'What do you need?', required: true, minLength: 5, placeholder: 'e.g. Please upload a clearer copy of your GST certificate.' },
      onConfirm: (message) => run(() => peopleApi.requestVendorInfo(v.id, message), 'Request sent to the applicant'),
    }),
    suspend: (v: { id: string; store_name: string }) => confirm({
      title: `Suspend ${v.store_name}?`,
      description: 'Their storefront is hidden and they can’t sell until reactivated. Existing orders continue.',
      tone: 'danger',
      confirmLabel: 'Suspend vendor',
      onConfirm: () => run(() => peopleApi.suspendVendor(v.id), 'Vendor suspended'),
    }),
    reactivate: (v: { id: string; store_name: string }) => confirm({
      title: `Reactivate ${v.store_name}?`,
      description: 'Their store becomes visible and they can sell again.',
      confirmLabel: 'Reactivate',
      onConfirm: () => run(() => peopleApi.reactivateVendor(v.id), 'Vendor reactivated'),
    }),
  };
}
