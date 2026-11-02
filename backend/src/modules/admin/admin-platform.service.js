const db = require('../../config/database');

const listSettings = () => db('settings').orderBy('key');

const updateSetting = async (adminId, key, value) => {
  const [row] = await db('settings')
    .insert({ key, value: JSON.stringify(value), updated_by: adminId })
    .onConflict('key')
    .merge({ value: JSON.stringify(value), updated_by: adminId, updated_at: db.fn.now() })
    .returning('*');
  return row;
};

const listAuditLogs = async ({ page = 1, limit = 50, actorId, entityType, entityId, action, from, to }) => {
  const base = db('audit_logs as a')
    .leftJoin('users as u', 'u.id', 'a.actor_id')
    .modify((qb) => {
      if (actorId) qb.where('a.actor_id', actorId);
      if (entityType) qb.where('a.entity_type', entityType);
      if (entityId) qb.where('a.entity_id', entityId);
      if (action) qb.whereILike('a.action', `%${action}%`);
      if (from) qb.where('a.created_at', '>=', from);
      if (to) qb.where('a.created_at', '<', to);
    });
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone()
    .orderBy('a.created_at', 'desc')
    .offset((page - 1) * limit)
    .limit(limit)
    .select('a.*', 'u.full_name as actor_name', 'u.email as actor_email');
  return { total: Number(count), rows };
};

module.exports = { listSettings, updateSetting, listAuditLogs };
