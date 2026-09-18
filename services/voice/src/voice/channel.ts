import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { config } from '../config.js';
import { verifyToken, VoiceUser } from '../auth/cognito.js';
import { createTurn, Turn } from './turn.js';

export const PATH = '/voice/stream';

/** A turn is a few seconds of audio; past this it is a stuck button, not a question. */
const MAX_AUDIO_FRAMES = 800;

/** One channel serves one panel. */
const MAX_SOCKETS_PER_USER = 3;

/**
 * A warmed channel is authenticated once and held across several questions — so
 * it must not live long enough for that authorization to go stale. On expiry the
 * client silently warms a fresh one, which re-verifies the token.
 */
const CHANNEL_MAX_MS = 15 * 60 * 1000;
const CHANNEL_IDLE_MS = 5 * 60 * 1000;

// Track active sockets per user to enforce MAX_SOCKETS_PER_USER
const activeSocketsPerUser = new Map<string, Set<WebSocket>>();

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return !config.isProd;

  try {
    const parsed = new URL(origin);
    const host = parsed.hostname;

    // Localhost loopback allowed in non-prod
    if (!config.isProd && (host === 'localhost' || host === '127.0.0.1')) {
      return true;
    }

    if (config.allowedOrigins.length === 0) {
      return !config.isProd;
    }

    return config.allowedOrigins.some((allowed) => {
      if (allowed.startsWith('*.')) {
        return host.endsWith(allowed.slice(1));
      }
      return allowed === origin || allowed === host;
    });
  } catch {
    return false;
  }
}

/**
 * Attach the WebSocket endpoint to the HTTP server.
 */
export function attach(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const { pathname } = new URL(req.url ?? '', `http://${req.headers.host}`);

    if (pathname !== PATH) {
      return;
    }

    // Origin guard: WebSockets are not subject to CORS/same-origin policy
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    handleConnection(ws);
  });
}

/**
 * Handle one WebSocket connection through the voice wire protocol.
 */
export function handleConnection(ws: WebSocket): void {
  let user: VoiceUser | null = null;
  let activeTurn: Turn | null = null;
  let audioFrameCount = 0;
  let idleTimer: NodeJS.Timeout | null = null;
  let maxTimer: NodeJS.Timeout | null = null;

  function send(data: Record<string, unknown>) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      send({ t: 'expired', reason: 'idle_timeout' });
      cleanup();
      ws.close(1000, 'Idle timeout');
    }, CHANNEL_IDLE_MS);
  }

  function cleanup() {
    if (idleTimer) clearTimeout(idleTimer);
    if (maxTimer) clearTimeout(maxTimer);
    if (activeTurn) {
      activeTurn.cancel();
      activeTurn = null;
    }
    if (user) {
      const userSockets = activeSocketsPerUser.get(user.userId);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          activeSocketsPerUser.delete(user.userId);
        }
      }
    }
  }

  // Set hard session cap
  maxTimer = setTimeout(() => {
    send({ t: 'expired', reason: 'max_lifetime' });
    cleanup();
    ws.close(1000, 'Max lifetime reached');
  }, CHANNEL_MAX_MS);

  resetIdleTimer();

  ws.on('message', async (raw: WebSocket.RawData) => {
    resetIdleTimer();

    try {
      const msg = JSON.parse(raw.toString('utf-8'));
      const type = msg.t;

      switch (type) {
        // Authenticate channel
        case 'start': {
          if (!msg.token || typeof msg.token !== 'string') {
            send({ t: 'error', code: 'UNAUTHORIZED', message: 'Token is required' });
            ws.close(4001, 'Unauthorized');
            return;
          }

          try {
            const verified = await verifyToken(msg.token);

            // Check max sockets per user
            let sockets = activeSocketsPerUser.get(verified.userId);
            if (!sockets) {
              sockets = new Set();
              activeSocketsPerUser.set(verified.userId, sockets);
            }

            if (sockets.size >= MAX_SOCKETS_PER_USER) {
              send({
                t: 'error',
                code: 'TOO_MANY_SOCKETS',
                message: 'Concurrent socket limit reached for user',
              });
              ws.close(4029, 'Too many sockets');
              return;
            }

            user = verified;
            sockets.add(ws);
            send({ t: 'ready' });
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Invalid token';
            send({ t: 'error', code: 'UNAUTHORIZED', message });
            ws.close(4001, 'Unauthorized');
          }
          break;
        }

        // Button down: begin turn
        case 'begin': {
          if (!user) {
            send({ t: 'error', code: 'UNAUTHORIZED', message: 'Not authenticated' });
            return;
          }

          if (activeTurn) {
            activeTurn.cancel();
            activeTurn = null;
          }

          audioFrameCount = 0;

          activeTurn = createTurn({
            send,
            fail: (message, code) => send({ t: 'error', code, message }),
            language: msg.language || 'hi-IN',
            history: Array.isArray(msg.history) ? msg.history : [],
          });

          send({ t: 'listening' });
          break;
        }

        // Audio frame arriving
        case 'audio': {
          if (!user || !activeTurn) return;

          audioFrameCount++;
          if (audioFrameCount > MAX_AUDIO_FRAMES) {
            send({
              t: 'error',
              code: 'AUDIO_LIMIT_EXCEEDED',
              message: 'Stuck button: turn exceeded maximum audio duration',
            });
            activeTurn.cancel();
            activeTurn = null;
            return;
          }

          if (msg.b64 && typeof msg.b64 === 'string') {
            activeTurn.sendAudio(msg.b64);
          }
          break;
        }

        // Button up: finish question and stream response
        case 'stop': {
          if (!user || !activeTurn) return;

          const turnToFinish = activeTurn;
          activeTurn = null;
          await turnToFinish.finish();
          break;
        }

        // Turn cancelled
        case 'cancel': {
          if (activeTurn) {
            activeTurn.cancel();
            activeTurn = null;
          }
          break;
        }

        default:
          break;
      }
    } catch {
      send({ t: 'error', code: 'BAD_REQUEST', message: 'Malformed frame JSON' });
    }
  });

  ws.on('close', () => {
    cleanup();
  });

  ws.on('error', () => {
    cleanup();
  });
}
