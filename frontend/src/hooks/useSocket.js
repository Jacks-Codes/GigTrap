'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

function getNextPublicBackendUrl() {
  return globalThis.process?.env?.NEXT_PUBLIC_BACKEND_URL;
}

function getDefaultBackendUrl() {
  if (typeof window === 'undefined') return 'http://localhost:3001';
  if (globalThis.process?.env?.NODE_ENV !== 'production') {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return getNextPublicBackendUrl() || window.location.origin;
}

const BACKEND_URL =
  getNextPublicBackendUrl() ||
  getDefaultBackendUrl();

// Singleton socket — shared across all components/routes
let socket = null;

function getSocket() {
  if (!socket) {
    socket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function useSocket() {
  const [connected, setConnected] = useState(() => getSocket().connected);

  useEffect(() => {
    const s = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket: getSocket(), connected };
}
