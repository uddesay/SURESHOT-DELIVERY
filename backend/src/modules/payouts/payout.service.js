const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const notificationService = require('../notifications/notification.service');

const HOLD_DAYS_KEY = 'vendor.payout_hold_days';

/** Order items delivered within the period, past the return-hold window, with no active return blocking settlement, not yet paid out. */
const findEligibleItems = async (trx, vendorId, periodStart, periodEnd, holdDays) => {
  return trx('order_items as oi')
    .join('order_shipments as s', 's.id', 'oi.shipment_id')
    .where('oi.vendor_id', vendorId)
    .where('s.status', 'delivered')
    .whereNotNull('s.delivered_at')
    .where('s.delivered_at', '>=', periodStart)
    .where('s.delivered_at', '<', periodEnd)
    .where('s.delivered_at', '<=', trx.raw(`now() - interval '${Number(holdDays)} days'`))
    .whereNotExists(
      trx('payout_transactions').whereRaw('payout_transactions.order_item_id = oi.id').andWhere('txn_type', 'sale'),
    )
    .whereNotExists(
      trx('return_requests')
        .whereRaw('return_requests.order_item_id = oi.id')
        .whereNotIn('status', ['rejected']),
    )
    .select('oi.id', 'oi.line_total_minor', 'oi.commission_minor');
};

const getHoldDays = async () => {
  const setting = await db('settings').where({ key: HOLD_DAYS_KEY }).first();
  return setting ? Number(setting.value) : 7;
};

/** Inserts the payout batch + its line-level transaction ledger for a set of already-eligible items. */
const insertPayoutBatch = async (trx, vendorId, periodStart, periodEnd, items) => {
  const gross = items.reduce((sum, i) => sum + Number(i.line_total_minor), 0);
  const commission = items.reduce((sum, i) => sum + Number(i.commission_minor), 0);
  const net = gross - commission;

  const [payout] = await trx('vendor_payouts')
    .insert({
      id: uuid(),
      vendor_id: vendorId,
      period_start: periodStart,
      period_end: periodEnd,
      gross_minor: gross,
      commission_minor: commission,
      adjustments_minor: 0,
      net_minor: net,
      status: 'pending',
    })
    .returning('*');

  const transactionRows = items.flatMap((i) => [
    { id: uuid(), payout_id: payout.id, order_item_id: i.id, amount_minor: Number(i.line_total_minor), txn_type: 'sale' },
    { id: uuid(), payout_id: payout.id, order_item_id: i.id, amount_minor: Number(i.commission_minor), txn_type: 'commission' },
  ]);
  await trx('payout_transactions').insert(transactionRows);

  return { ...payout, itemCount: items.length };
};

/** Batches all eligible, unpaid order items for a vendor into a new payout — admin-driven, explicit period. */
const generatePayout = async (adminId, vendorId, { periodStart, periodEnd }) => {
  const vendor = await db('vendors').where({ id: vendorId }).whereNull('deleted_at').first();
  if (!vendor) throw ApiError.notFound('Vendor');

  const holdDays = await getHoldDays();

  return db.transaction(async (trx) => {
    const items = await findEligibleItems(trx, vendorId, periodStart, periodEnd, holdDays);
    if (!items.length) throw ApiError.businessRule('No eligible order items found for this period');
    return insertPayoutBatch(trx, vendorId, periodStart, periodEnd, items);
  });
};

/**
 * Self-service payout request — a vendor pulls together everything eligible
 * since their last payout (or since approval, if they've never had one)
 * instead of waiting for an admin to proactively run `generatePayout`.
 * Lands in the same 'pending' status either way, so admin review/approval
 * (approvePayout/markPaid) is unchanged regardless of who triggered it.
 */
const requestPayout = async (vendorId) => {
  const vendor = await db('vendors').where({ id: vendorId }).whereNull('deleted_at').first();
  if (!vendor) throw ApiError.notFound('Vendor');

  const holdDays = await getHoldDays();
  const periodEnd = new Date();

  return db.transaction(async (trx) => {
    const lastPayout = await trx('vendor_payouts')
      .where({ vendor_id: vendorId })
      .orderBy('period_end', 'desc')
      .first();
    const periodStart = lastPayout ? lastPayout.period_end : (vendor.approved_at || vendor.created_at);
    if (new Date(periodStart) >= periodEnd) {
      throw ApiError.businessRule('No new eligible earnings since your last payout');
    }

    const items = await findEligibleItems(trx, vendorId, periodStart, periodEnd, holdDays);
    if (!items.length) {
      throw ApiError.businessRule(
        'No eligible earnings to pay out yet — delivered orders clear the return-hold window before they qualify',
      );
    }
    return insertPayoutBatch(trx, vendorId, periodStart, periodEnd, items);
  });
};

const approvePayout = async (adminId, payoutId) => {
  const updated = await db('vendor_payouts').where({ id: payoutId, status: 'pending' })
    .update({ status: 'approved', approved_by: adminId });
  if (!updated) throw ApiError.businessRule('Payout must be in pending state to approve');
  return db('vendor_payouts').where({ id: payoutId }).first();
};

const markPaid = async (adminId, payoutId, { utrNumber }) => {
  const updated = await db('vendor_payouts').where({ id: payoutId, status: 'approved' })
    .update({ status: 'paid', utr_number: utrNumber, paid_at: db.fn.now() });
  if (!updated) throw ApiError.businessRule('Payout must be approved before it can be marked paid');

  const payout = await db('vendor_payouts').where({ id: payoutId }).first();
  const vendor = await db('vendors').where({ id: payout.vendor_id }).first();
  if (vendor) {
    notificationService.notify(vendor.owner_user_id, {
      title: 'Payout sent',
      body: `₹${(Number(payout.net_minor) / 100).toFixed(2)} has been paid out (UTR: ${utrNumber}).`,
      type: 'payout_paid',
      data: { payoutId, utrNumber },
    });
  }
  return payout;
};

const holdPayout = async (adminId, payoutId, reason) => {
  const updated = await db('vendor_payouts').where({ id: payoutId })
    .whereIn('status', ['pending', 'approved'])
    .update({ status: 'on_hold' });
  if (!updated) throw ApiError.businessRule('Only a pending or approved payout can be put on hold');
  return { reason };
};

const listForVendor = async (vendorId, { page = 1, limit = 20, status }) => {
  const base = db('vendor_payouts').where({ vendor_id: vendorId }).modify((qb) => status && qb.where({ status }));
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone().orderBy('created_at', 'desc').offset((page - 1) * limit).limit(limit);
  return { total: Number(count), rows };
};

const listForAdmin = async ({ page = 1, limit = 20, status, vendorId }) => {
  const base = db('vendor_payouts as vp')
    .join('vendors as v', 'v.id', 'vp.vendor_id')
    .modify((qb) => {
      if (status) qb.where('vp.status', status);
      if (vendorId) qb.where('vp.vendor_id', vendorId);
    });
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone()
    .orderBy('vp.created_at', 'desc')
    .offset((page - 1) * limit)
    .limit(limit)
    .select('vp.*', 'v.store_name as vendor_name');
  return { total: Number(count), rows };
};

const getDetail = async (payoutId, vendorId) => {
  const payout = await db('vendor_payouts')
    .where({ id: payoutId })
    .modify((qb) => vendorId && qb.where({ vendor_id: vendorId }))
    .first();
  if (!payout) throw ApiError.notFound('Payout');

  const transactions = await db('payout_transactions as pt')
    .join('order_items as oi', 'oi.id', 'pt.order_item_id')
    .where('pt.payout_id', payoutId)
    .select('pt.*', 'oi.title', 'oi.sku', 'oi.order_id');

  return { ...payout, transactions };
};

module.exports = {
  generatePayout, requestPayout, approvePayout, markPaid, holdPayout, listForVendor, listForAdmin, getDetail,
};
