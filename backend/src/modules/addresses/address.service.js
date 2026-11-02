const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');

const toRow = (userId, a) => ({
  user_id: userId,
  label: a.label,
  recipient_name: a.recipientName,
  recipient_phone: a.recipientPhone,
  line1: a.line1,
  line2: a.line2 || null,
  landmark: a.landmark || null,
  city: a.city,
  state: a.state,
  postal_code: a.postalCode,
  country: a.country || 'IN',
  latitude: a.latitude ?? null,
  longitude: a.longitude ?? null,
});

const list = (userId) =>
  db('addresses')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .orderBy([{ column: 'is_default', order: 'desc' }, { column: 'created_at', order: 'desc' }]);

const getOwned = async (userId, id) => {
  const address = await db('addresses')
    .where({ id, user_id: userId })
    .whereNull('deleted_at')
    .first();
  if (!address) throw ApiError.notFound('Address');
  return address;
};

const create = async (userId, attrs) => {
  return db.transaction(async (trx) => {
    const count = await trx('addresses')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .count('* as c')
      .first();
    const isFirst = Number(count.c) === 0;

    if (attrs.isDefault && !isFirst) {
      await trx('addresses').where({ user_id: userId, is_default: true }).update({ is_default: false });
    }

    const [row] = await trx('addresses')
      .insert({ id: uuid(), ...toRow(userId, attrs), is_default: isFirst || Boolean(attrs.isDefault) })
      .returning('*');
    return row;
  });
};

const update = async (userId, id, attrs) => {
  await getOwned(userId, id);
  return db.transaction(async (trx) => {
    if (attrs.isDefault) {
      await trx('addresses').where({ user_id: userId, is_default: true }).update({ is_default: false });
    }
    const patch = { ...toRow(userId, { ...attrs }) };
    // Only overwrite provided fields
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
    const [row] = await trx('addresses')
      .where({ id })
      .update({ ...patch, ...(attrs.isDefault !== undefined ? { is_default: attrs.isDefault } : {}) })
      .returning('*');
    return row;
  });
};

const setDefault = async (userId, id) => {
  await getOwned(userId, id);
  await db.transaction(async (trx) => {
    await trx('addresses').where({ user_id: userId, is_default: true }).update({ is_default: false });
    await trx('addresses').where({ id }).update({ is_default: true });
  });
};

const remove = async (userId, id) => {
  const address = await getOwned(userId, id);
  await db('addresses').where({ id }).update({ deleted_at: db.fn.now(), is_default: false });

  if (address.is_default) {
    const next = await db('addresses')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .first();
    if (next) await db('addresses').where({ id: next.id }).update({ is_default: true });
  }
};

module.exports = { list, getOwned, create, update, setDefault, remove };
