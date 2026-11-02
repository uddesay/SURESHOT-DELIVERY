import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Mail, MoreHorizontal, Printer, Truck, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { CANCELLABLE, availableFulfillment, FULFILLMENT_LABELS, ordersApi, type FulfillmentAction, type OrderRow } from '../../api/commerce';
import { useAuth } from '../../auth/AuthContext';
import { IconButton } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '../../components/ui/Dropdown';
import { useToast } from '../../components/ui/Toast';

/** Invalidate everything that summarises orders after a mutation. */
export function useOrderInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['admin-orders', 'admin-order', 'admin-overview', 'admin-activity', 'shell-queues', 'admin-breakdown']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useCancelOrder() {
  const confirm = useConfirm();
  const toast = useToast();
  const invalidate = useOrderInvalidation();
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => ordersApi.cancel(id, reason),
    onSuccess: () => { toast.success('Order cancelled', 'Stock was released and any captured online payment refunded to the customer wallet.'); invalidate(); },
  });
  return (order: { id: string; order_number: string }) => confirm({
    title: `Cancel ${order.order_number}?`,
    description: 'Reserved stock is released and online payments already captured are refunded to the customer’s Sureshot wallet. Cash-on-delivery orders have nothing to refund. This can’t be undone.',
    confirmLabel: 'Cancel order',
    tone: 'danger',
    reason: { label: 'Reason (saved to the order history)', required: true, minLength: 3, placeholder: 'e.g. Customer requested cancellation' },
    onConfirm: (reason) => cancel.mutateAsync({ id: order.id, reason }),
  });
}

export function useFulfill() {
  const toast = useToast();
  const invalidate = useOrderInvalidation();
  return useMutation({
    mutationFn: ({ id, action, courier, awbNumber }: { id: string; action: FulfillmentAction; courier?: string; awbNumber?: string }) =>
      ordersApi.fulfill(id, { action, ...(courier ? { courier } : {}), ...(awbNumber ? { awbNumber } : {}) }),
    onSuccess: (_d, v) => { toast.success(FULFILLMENT_LABELS[v.action].replace(/^Mark /, 'Marked '), 'Customer notifications follow the order status.'); invalidate(); },
    onError: (e) => toast.fromError(e, 'The order couldn’t be updated.'),
  });
}

export function OrderRowActions({ order }: { order: OrderRow }) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const cancel = useCancelOrder();
  const fulfill = useFulfill();
  const next = hasPermission('orders:fulfill') ? availableFulfillment(order.status).filter((a) => a !== 'ship') : [];
  return (
    <Dropdown align="end" trigger={(props) => <IconButton {...props} size="sm" label={`Actions for ${order.order_number}`}><MoreHorizontal className="h-4 w-4" /></IconButton>}>
      <DropdownItem icon={Eye} onSelect={() => navigate(`/orders/${order.id}`)}>View order</DropdownItem>
      <DropdownItem icon={Printer} onSelect={() => navigate(`/orders/${order.id}?print=1`)}>Print invoice</DropdownItem>
      {order.customer_email && (
        <DropdownItem icon={Mail} onSelect={() => { window.location.href = `mailto:${order.customer_email}?subject=${encodeURIComponent(`Your Sureshot order ${order.order_number}`)}`; }}>Contact customer</DropdownItem>
      )}
      {(next.length > 0 || availableFulfillment(order.status).includes('ship')) && hasPermission('orders:fulfill') && (
        <>
          <DropdownSeparator />
          <DropdownLabel>Fulfilment</DropdownLabel>
          {next.map((a) => <DropdownItem key={a} icon={Truck} onSelect={() => fulfill.mutate({ id: order.id, action: a })}>{FULFILLMENT_LABELS[a]}</DropdownItem>)}
          {availableFulfillment(order.status).includes('ship') && <DropdownItem icon={Truck} onSelect={() => navigate(`/orders/${order.id}#fulfillment`)}>Mark shipped…</DropdownItem>}
        </>
      )}
      {hasPermission('orders:cancel') && CANCELLABLE.includes(order.status) && (
        <>
          <DropdownSeparator />
          <DropdownItem icon={XCircle} tone="danger" onSelect={() => void cancel(order)}>Cancel & refund…</DropdownItem>
        </>
      )}
    </Dropdown>
  );
}
