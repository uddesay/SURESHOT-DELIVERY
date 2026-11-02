const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Socket.IO gateway. Clients authenticate with the same JWT access token as
 * the REST API (`auth: { token }` in the handshake). Rooms:
 *   user:{userId}     — personal channel: order updates, notifications, chat
 *   vendor:{vendorId} — vendor channel: new-order alerts, return requests
 *   staff             — admin/support channel: new tickets, chat messages
 *
 * Kept as a singleton so services can emit without threading the io
 * instance through every call chain. Emitting before init (e.g. in unit
 * tests) is a silent no-op — realtime is always best-effort.
 */
let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: config.corsOrigins.length ? config.corsOrigins : !config.isProduction,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const payload = jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] });
      socket.data.userId = payload.sub;
      socket.data.roles = payload.roles || [];
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const { userId, roles } = socket.data;
    socket.join(`user:${userId}`);

    if (roles.includes('vendor')) {
      const vendor = await db('vendors')
        .where({ owner_user_id: userId })
        .whereNull('deleted_at')
        .first()
        .catch(() => null);
      if (vendor) socket.join(`vendor:${vendor.id}`);
    }
    if (roles.some((r) => ['admin', 'super_admin', 'support_agent'].includes(r))) {
      socket.join('staff');
    }

    logger.debug({ userId, roles }, 'Socket connected');

    socket.on('disconnect', () => {
      logger.debug({ userId }, 'Socket disconnected');
    });
  });

  logger.info('Socket.IO gateway initialized');
  return io;
};

const emitToUser = (userId, event, payload) => {
  if (io) io.to(`user:${userId}`).emit(event, payload);
};

const emitToVendor = (vendorId, event, payload) => {
  if (io) io.to(`vendor:${vendorId}`).emit(event, payload);
};

const emitToStaff = (event, payload) => {
  if (io) io.to('staff').emit(event, payload);
};

module.exports = { initSocket, emitToUser, emitToVendor, emitToStaff };
