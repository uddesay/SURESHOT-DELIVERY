const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { emitToUser, emitToStaff } = require('../../sockets');
const notificationService = require('../notifications/notification.service');

const generateTicketNumber = () => `TK${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

const STAFF_ROLES = ['admin', 'super_admin', 'support_agent'];

const isStaff = (roles = []) => roles.some((r) => STAFF_ROLES.includes(r));

// ---------------------------------------------------------------- tickets

const createTicket = async (userId, { subject, category, orderId, priority, message }) => {
  if (orderId) {
    const order = await db('orders').where({ id: orderId, user_id: userId }).first();
    if (!order) throw ApiError.businessRule('Order not found for this account');
  }

  return db.transaction(async (trx) => {
    const [ticket] = await trx('support_tickets')
      .insert({
        id: uuid(),
        ticket_number: generateTicketNumber(),
        user_id: userId,
        order_id: orderId || null,
        subject,
        category: category || 'general',
        priority: priority || 'medium',
      })
      .returning('*');

    const [firstMessage] = await trx('ticket_messages')
      .insert({ id: uuid(), ticket_id: ticket.id, sender_id: userId, body: message })
      .returning('*');

    emitToStaff('support:new_ticket', { ticketId: ticket.id, ticketNumber: ticket.ticket_number, subject });
    return { ...ticket, messages: [firstMessage] };
  });
};

const listMyTickets = async (userId, { page = 1, limit = 20, status }) => {
  const base = db('support_tickets').where({ user_id: userId }).modify((qb) => status && qb.where({ status }));
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone().orderBy('updated_at', 'desc').offset((page - 1) * limit).limit(limit);
  return { total: Number(count), rows };
};

const listAllTickets = async ({ page = 1, limit = 20, status, priority, assignedTo }) => {
  const base = db('support_tickets as t')
    .join('users as u', 'u.id', 't.user_id')
    .modify((qb) => {
      if (status) qb.where('t.status', status);
      if (priority) qb.where('t.priority', priority);
      if (assignedTo) qb.where('t.assigned_to', assignedTo);
    });
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone()
    .orderBy('t.updated_at', 'desc')
    .offset((page - 1) * limit)
    .limit(limit)
    .select('t.*', 'u.full_name as customer_name', 'u.email as customer_email');
  return { total: Number(count), rows };
};

const getTicketDetail = async (ticketId, requester) => {
  const ticket = await db('support_tickets').where({ id: ticketId }).first();
  if (!ticket) throw ApiError.notFound('Support ticket');
  if (!isStaff(requester.roles) && ticket.user_id !== requester.id) {
    throw ApiError.notFound('Support ticket');
  }
  const messages = await db('ticket_messages').where({ ticket_id: ticketId }).orderBy('created_at');
  return { ...ticket, messages };
};

const assign = async (ticketId, assigneeId) => {
  const updated = await db('support_tickets').where({ id: ticketId })
    .update({ assigned_to: assigneeId, status: 'in_progress' });
  if (!updated) throw ApiError.notFound('Support ticket');
};

const updateStatus = async (ticketId, status) => {
  const updated = await db('support_tickets').where({ id: ticketId }).update({ status });
  if (!updated) throw ApiError.notFound('Support ticket');
};

// ---------------------------------------------------------------- messages

const postMessage = async (ticketId, sender, body, attachments = []) => {
  const ticket = await db('support_tickets').where({ id: ticketId }).first();
  if (!ticket) throw ApiError.notFound('Support ticket');

  const senderIsStaff = isStaff(sender.roles);
  if (!senderIsStaff && ticket.user_id !== sender.id) throw ApiError.notFound('Support ticket');
  if (['resolved', 'closed'].includes(ticket.status)) {
    throw ApiError.businessRule('This ticket is closed. Start a new ticket if you need further help.');
  }

  const [message] = await db('ticket_messages')
    .insert({ id: uuid(), ticket_id: ticketId, sender_id: sender.id, body, attachments: JSON.stringify(attachments) })
    .returning('*');

  await db('support_tickets').where({ id: ticketId }).update({
    status: senderIsStaff ? 'waiting_on_customer' : 'in_progress',
    updated_at: db.fn.now(),
  });

  const payload = { ticketId, message };
  if (senderIsStaff) {
    emitToUser(ticket.user_id, 'support:message', payload);
    notificationService.notify(ticket.user_id, {
      title: `Update on ticket ${ticket.ticket_number}`,
      body: body.slice(0, 140),
      type: 'support_reply',
      data: { ticketId },
    });
  } else {
    emitToStaff('support:message', payload);
    if (ticket.assigned_to) emitToUser(ticket.assigned_to, 'support:message', payload);
  }

  return message;
};

module.exports = { createTicket, listMyTickets, listAllTickets, getTicketDetail, assign, updateStatus, postMessage };
