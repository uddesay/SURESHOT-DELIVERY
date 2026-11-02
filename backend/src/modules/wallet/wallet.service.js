const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');

/**
 * Wallet is a strict ledger: balance changes only through credit()/debit(),
 * each writing a wallet_transactions row with balance_after_minor.
 * Rows are serialized per-wallet with SELECT ... FOR UPDATE.
 */

const getByUserId = async (userId, trx = db) => {
  const wallet = await trx('wallets').where({ user_id: userId }).first();
  if (!wallet) throw ApiError.notFound('Wallet');
  return wallet;
};

const getBalance = async (userId) => {
  const wallet = await getByUserId(userId);
  return {
    balanceMinor: Number(wallet.balance_minor),
    rewardPoints: wallet.reward_points,
    currency: wallet.currency,
    isFrozen: wallet.is_frozen,
  };
};

const listTransactions = async (userId, { page = 1, limit = 20 }) => {
  const wallet = await getByUserId(userId);
  const base = db('wallet_transactions').where({ wallet_id: wallet.id });
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone()
    .orderBy('created_at', 'desc')
    .offset((page - 1) * limit)
    .limit(limit);
  return {
    total: Number(count),
    rows: rows.map((r) => ({
      ...r,
      amount_minor: Number(r.amount_minor),
      balance_after_minor: Number(r.balance_after_minor),
    })),
  };
};

/** Core ledger write. Must be called inside a transaction. */
const applyLedger = async (trx, userId, { type, amountMinor, source, referenceType, referenceId, description }) => {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw ApiError.businessRule('Amount must be a positive integer (minor units)');
  }

  const wallet = await trx('wallets').where({ user_id: userId }).forUpdate().first();
  if (!wallet) throw ApiError.notFound('Wallet');
  if (wallet.is_frozen) throw ApiError.businessRule('Wallet is frozen');

  const current = Number(wallet.balance_minor);
  const next = type === 'credit' ? current + amountMinor : current - amountMinor;
  if (next < 0) throw ApiError.businessRule('Insufficient wallet balance');

  await trx('wallets').where({ id: wallet.id }).update({ balance_minor: next });
  const [row] = await trx('wallet_transactions')
    .insert({
      id: uuid(),
      wallet_id: wallet.id,
      txn_type: type,
      amount_minor: amountMinor,
      balance_after_minor: next,
      source,
      reference_type: referenceType || null,
      reference_id: referenceId || null,
      description: description || null,
    })
    .returning('*');
  return { transaction: row, balanceMinor: next };
};

const credit = (trx, userId, opts) => applyLedger(trx, userId, { ...opts, type: 'credit' });
const debit = (trx, userId, opts) => applyLedger(trx, userId, { ...opts, type: 'debit' });

module.exports = { getByUserId, getBalance, listTransactions, credit, debit };
