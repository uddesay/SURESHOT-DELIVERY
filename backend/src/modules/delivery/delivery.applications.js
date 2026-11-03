const { hashPassword } = require('../../utils/password');
const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { normalizePhone, phoneCandidates } = require('../../utils/phone');

const PUBLIC_COLUMNS = [
  'id', 'full_name', 'phone', 'email', 'city', 'vehicle_type', 'vehicle_number', 'license_number', 'about',
  'status', 'rejection_reason', 'reviewed_at', 'partner_id', 'created_at',
];

/** Public: someone applies to join the delivery fleet. Nothing is created until an admin approves. */
const apply = async (attrs, ip) => {
  const phone = normalizePhone(attrs.phone);
  if (!phone) throw ApiError.badRequest('Enter a valid mobile number');
  const email = attrs.email ? String(attrs.email).trim().toLowerCase() : null;

  const taken = await db('users').whereNull('deleted_at')
    .where((w) => { w.whereIn('phone', phoneCandidates(phone)); if (email) w.orWhere('email', email); }).first();
  if (taken) throw ApiError.conflict('This mobile number or email already has an account. Sign in at /rider, or contact support.');

  const password_hash = await hashPassword(attrs.password);
  try {
    const [row] = await db('delivery_applications').insert({
      id: uuid(), full_name: attrs.fullName.trim(), phone, email, city: attrs.city.trim(), vehicle_type: attrs.vehicleType,
      vehicle_number: attrs.vehicleNumber ? attrs.vehicleNumber.trim().toUpperCase() : null,
      license_number: attrs.licenseNumber ? attrs.licenseNumber.trim().toUpperCase() : null,
      about: attrs.about ? attrs.about.trim() : null, password_hash, ip_address: ip || null,
    }).returning(['id', 'status', 'created_at']);
    return row;
  } catch (err) {
    if (err.code === '23505') throw ApiError.conflict('An application for this mobile number is already being reviewed.');
    throw err;
  }
};

const list = async ({ status = 'pending', page = 1, limit = 30 }) => {
  const base = db('delivery_applications').modify((qb) => { if (status !== 'all') qb.where({ status }); });
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone().select(PUBLIC_COLUMNS).orderBy('created_at', 'desc').limit(limit).offset((page - 1) * limit);
  return { rows, total: Number(count) };
};

const pendingCount = async () => Number((await db('delivery_applications').where({ status: 'pending' }).count('* as n').first()).n);

/** Approve: creates the rider's login (their own chosen password) and delivery_partners profile. */
const approve = async (adminId, id) => db.transaction(async (trx) => {
  const app = await trx('delivery_applications').where({ id }).forUpdate().first();
  if (!app) throw ApiError.notFound('Application');
  if (app.status !== 'pending') throw ApiError.businessRule(`This application was already ${app.status}`);

  const clash = await trx('users').whereNull('deleted_at')
    .where((w) => { w.whereIn('phone', phoneCandidates(app.phone)); if (app.email) w.orWhere('email', app.email); }).first();
  if (clash) throw ApiError.conflict('A user with this phone or email already exists — reject this application or merge manually.');
  const role = await trx('roles').where({ name: 'delivery_partner' }).first();
  if (!role) throw ApiError.businessRule('The delivery_partner role is missing — run the platform bootstrap');

  const userId = uuid();
  await trx('users').insert({
    id: userId, email: app.email, phone: app.phone, full_name: app.full_name, password_hash: app.password_hash,
    status: 'active', is_email_verified: Boolean(app.email), is_phone_verified: true,
  });
  await trx('user_roles').insert({ user_id: userId, role_id: role.id });
  const partnerId = uuid();
  await trx('delivery_partners').insert({
    id: partnerId, user_id: userId, full_name: app.full_name, phone: app.phone, vehicle_type: app.vehicle_type,
    vehicle_number: app.vehicle_number, city: app.city,
  });
  await trx('delivery_applications').where({ id }).update({
    status: 'approved', reviewed_by: adminId, reviewed_at: trx.fn.now(), partner_id: partnerId, updated_at: trx.fn.now(),
  });
  return { applicationId: id, partnerId, phone: app.phone };
});

const reject = async (adminId, id, reason) => {
  const n = await db('delivery_applications').where({ id, status: 'pending' }).update({
    status: 'rejected', rejection_reason: reason, reviewed_by: adminId, reviewed_at: db.fn.now(), updated_at: db.fn.now(),
  });
  if (!n) {
    const exists = await db('delivery_applications').where({ id }).first();
    if (!exists) throw ApiError.notFound('Application');
    throw ApiError.businessRule(`This application was already ${exists.status}`);
  }
  return { applicationId: id, status: 'rejected' };
};

module.exports = { apply, list, pendingCount, approve, reject };
