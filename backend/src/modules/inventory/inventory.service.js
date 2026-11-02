const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');

const assertOwnedVariant = async (vendorId, variantId, trx = db) => {
  const variant = await trx('product_variants as v')
    .join('products as p', 'p.id', 'v.product_id')
    .where('v.id', variantId)
    .modify((qb) => vendorId && qb.where('p.vendor_id', vendorId))
    .select('v.id', 'v.sku', 'v.product_id', 'p.vendor_id')
    .first();
  if (!variant) throw ApiError.notFound('Variant');
  return variant;
};

const assertOwnedWarehouse = async (vendorId, warehouseId, trx = db) => {
  // vendorId null = platform staff, who may use any warehouse.
  const warehouse = await trx('warehouses').where({ id: warehouseId })
    .modify((qb) => vendorId && qb.where({ vendor_id: vendorId })).first();
  if (!warehouse) throw ApiError.notFound('Warehouse');
  return warehouse;
};

const stockBase = (vendorId, { warehouseId, lowStockOnly, stock, q }) => db('inventory_stocks as s')
  .join('product_variants as v', 'v.id', 's.variant_id')
  .join('products as p', 'p.id', 'v.product_id')
  .join('warehouses as w', 'w.id', 's.warehouse_id')
  .whereNull('v.deleted_at')
  .whereNull('p.deleted_at')
  .modify((qb) => {
    if (vendorId) qb.where('p.vendor_id', vendorId);
    if (warehouseId) qb.where('s.warehouse_id', warehouseId);
    if (lowStockOnly) qb.whereRaw('(s.quantity - s.reserved) <= s.low_stock_threshold');
    if (stock === 'low') qb.whereRaw('(s.quantity - s.reserved) <= s.low_stock_threshold').whereRaw('(s.quantity - s.reserved) > 0');
    if (stock === 'out') qb.whereRaw('(s.quantity - s.reserved) <= 0');
    if (stock === 'in') qb.whereRaw('(s.quantity - s.reserved) > s.low_stock_threshold');
    if (q) qb.where((qb2) => qb2.whereILike('p.title', `%${q}%`).orWhereILike('v.sku', `%${q}%`));
  });

/** vendorId null lists every vendor's stock (platform staff). */
const list = async (vendorId, { page = 1, limit = 20, ...filters }) => {
  const base = stockBase(vendorId, filters);
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone()
    .orderByRaw('(s.quantity - s.reserved) ASC')
    .offset((page - 1) * limit)
    .limit(limit)
    .select(
      's.variant_id', 's.warehouse_id', 's.quantity', 's.reserved', 's.low_stock_threshold', 's.updated_at',
      'v.sku', 'p.id as product_id', 'p.title as product_title', 'w.name as warehouse_name',
      'p.vendor_id', db.raw('(SELECT store_name FROM vendors WHERE id = p.vendor_id) as vendor_name'),
      db.raw('v.sale_price_minor::bigint as unit_price_minor'),
    );

  return {
    total: Number(count),
    rows: rows.map((r) => ({ ...r, unit_price_minor: Number(r.unit_price_minor), available: r.quantity - r.reserved, isLowStock: r.quantity - r.reserved <= r.low_stock_threshold })),
  };
};

const getMovements = async (vendorId, variantId, { page = 1, limit = 30 }) => {
  await assertOwnedVariant(vendorId, variantId);
  const base = db('inventory_movements as m').where({ 'm.variant_id': variantId });
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone()
    .leftJoin('warehouses as w', 'w.id', 'm.warehouse_id')
    .leftJoin('users as u', 'u.id', 'm.actor_id')
    .select('m.*', 'w.name as warehouse_name', 'u.full_name as actor_name')
    .orderBy('m.created_at', 'desc').offset((page - 1) * limit).limit(limit);
  return { total: Number(count), rows };
};

/**
 * Adjusts on-hand quantity for a variant/warehouse (creates the stock row if
 * absent). Positive delta = stock-in (restock, correction found extra units);
 * negative delta = stock-out (damage, loss, manual correction). Cannot be
 * used to go below currently reserved (in-cart/in-checkout) units.
 */
const adjustStock = async (vendorId, variantId, warehouseId, { delta, reason, actorId = null }) => {
  await assertOwnedVariant(vendorId, variantId);
  await assertOwnedWarehouse(vendorId, warehouseId);
  if (delta === 0) throw ApiError.badRequest('delta must be non-zero');

  return db.transaction(async (trx) => {
    const existing = await trx('inventory_stocks').where({ variant_id: variantId, warehouse_id: warehouseId }).forUpdate().first();
    const currentQty = existing ? existing.quantity : 0;
    const reserved = existing ? existing.reserved : 0;
    const nextQty = currentQty + delta;
    if (nextQty < reserved) {
      throw ApiError.businessRule(`Cannot reduce below ${reserved} reserved unit(s) currently in carts/checkout`);
    }

    if (existing) {
      await trx('inventory_stocks').where({ variant_id: variantId, warehouse_id: warehouseId }).update({ quantity: nextQty });
    } else {
      await trx('inventory_stocks').insert({ variant_id: variantId, warehouse_id: warehouseId, quantity: nextQty });
    }

    await trx('inventory_movements').insert({
      id: uuid(),
      variant_id: variantId,
      warehouse_id: warehouseId,
      movement_type: 'adjustment',
      quantity_delta: delta,
      reference_type: 'manual',
      note: reason,
      actor_id: actorId,
    });

    return { variantId, warehouseId, quantity: nextQty, reserved, available: nextQty - reserved };
  });
};

const setLowStockThreshold = async (vendorId, variantId, warehouseId, threshold) => {
  await assertOwnedVariant(vendorId, variantId);
  await assertOwnedWarehouse(vendorId, warehouseId);
  const updated = await db('inventory_stocks')
    .insert({ variant_id: variantId, warehouse_id: warehouseId, low_stock_threshold: threshold, quantity: 0 })
    .onConflict(['variant_id', 'warehouse_id'])
    .merge({ low_stock_threshold: threshold });
  return updated;
};

/** Platform-wide stock position, counted per variant across all warehouses. */
const summary = async (vendorId = null) => {
  const perVariant = stockBase(vendorId, {})
    .groupBy('s.variant_id', 'v.sale_price_minor')
    .select(
      's.variant_id',
      db.raw('SUM(s.quantity)::int as quantity'),
      db.raw('SUM(s.reserved)::int as reserved'),
      db.raw('SUM(s.low_stock_threshold)::int as threshold'),
      db.raw('v.sale_price_minor::bigint as price'),
    )
    .as('t');
  const row = await db.from(perVariant).select(
    db.raw('COALESCE(SUM(t.quantity), 0)::int as total_units'),
    db.raw('COALESCE(SUM(t.reserved), 0)::int as reserved_units'),
    db.raw('COUNT(*) FILTER (WHERE t.quantity - t.reserved <= 0)::int as out_of_stock'),
    db.raw('COUNT(*) FILTER (WHERE t.quantity - t.reserved > 0 AND t.quantity - t.reserved <= t.threshold)::int as low_stock'),
    db.raw('COUNT(*)::int as tracked_variants'),
    db.raw('COALESCE(SUM(t.quantity * t.price), 0)::bigint as value_minor'),
  ).first();
  return {
    totalUnits: row.total_units,
    reservedUnits: row.reserved_units,
    availableUnits: row.total_units - row.reserved_units,
    outOfStock: row.out_of_stock,
    lowStock: row.low_stock,
    trackedVariants: row.tracked_variants,
    inventoryValueMinor: Number(row.value_minor),
  };
};

/**
 * Moves available units between two warehouses of the same vendor as a pair of
 * adjustment movements inside one transaction.
 */
const transferStock = async (vendorId, variantId, { fromWarehouseId, toWarehouseId, quantity, reason, actorId = null }) => {
  if (fromWarehouseId === toWarehouseId) throw ApiError.badRequest('Choose two different warehouses');
  const variant = await assertOwnedVariant(vendorId, variantId);
  const [from, to] = await Promise.all([
    assertOwnedWarehouse(vendorId, fromWarehouseId),
    assertOwnedWarehouse(vendorId, toWarehouseId),
  ]);
  if (from.vendor_id !== to.vendor_id || (from.vendor_id && from.vendor_id !== variant.vendor_id)) {
    throw ApiError.businessRule('Stock can only move between warehouses of the product vendor');
  }
  return db.transaction(async (trx) => {
    const source = await trx('inventory_stocks').where({ variant_id: variantId, warehouse_id: fromWarehouseId }).forUpdate().first();
    if (!source || source.quantity - source.reserved < quantity) {
      throw ApiError.businessRule('Not enough available units in the source warehouse');
    }
    await trx('inventory_stocks').where({ variant_id: variantId, warehouse_id: fromWarehouseId }).update({ quantity: source.quantity - quantity });
    await trx('inventory_stocks')
      .insert({ variant_id: variantId, warehouse_id: toWarehouseId, quantity })
      .onConflict(['variant_id', 'warehouse_id'])
      .merge({ quantity: trx.raw('inventory_stocks.quantity + ?', [quantity]) });
    const note = reason || 'Warehouse transfer';
    await trx('inventory_movements').insert([
      { id: uuid(), variant_id: variantId, warehouse_id: fromWarehouseId, movement_type: 'adjustment', quantity_delta: -quantity, reference_type: 'transfer', note, actor_id: actorId },
      { id: uuid(), variant_id: variantId, warehouse_id: toWarehouseId, movement_type: 'adjustment', quantity_delta: quantity, reference_type: 'transfer', note, actor_id: actorId },
    ]);
    return { variantId, fromWarehouseId, toWarehouseId, quantity };
  });
};

module.exports = { list, getMovements, adjustStock, setLowStockThreshold, summary, transferStock };
