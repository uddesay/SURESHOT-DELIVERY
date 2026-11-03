import { type Socket, io } from 'socket.io-client';

import { sessionEvents } from './apiClient';
import { tokenStorage } from './tokenStorage';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin + '/api/v1';
const socketUrl = import.meta.env.VITE_SOCKET_URL || apiBaseUrl.replace(/\/api(\/.*)?$/, '');

let socket: Socket | null = null;

/**
 * Lazily-created singleton so every consumer (notification bell, support
 * console) shares one connection instead of opening a socket per component.
 * The token is re-read from storage on every (re)connect attempt via the
 * `auth` callback form, so a silent axios token refresh is picked up on the
 * socket's own reconnect rather than requiring us to track refreshes here.
 */
export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(socketUrl, {
    path: '/socket.io',
    // WebSocket only: long-polling needs sticky routing once the API runs as several processes.
    transports: ['websocket'],
    autoConnect: false,
    auth: (cb) => cb({ token: tokenStorage.getAccessToken() }),
  });

  sessionEvents.addEventListener('unauthorized', () => {
    socket?.disconnect();
  });

  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
}
