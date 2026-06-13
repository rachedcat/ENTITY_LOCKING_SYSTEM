import { io, Socket } from 'socket.io-client';
import { useLockStore } from '../store/useLockStore';
import type { UserRole } from '../store/useAuthStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntityLockedPayload { entityId: string; owner: string; }
interface EntityUnlockedPayload { entityId: string; }

// ─── Singleton Socket Service ─────────────────────────────────────────────────
// One instance for the entire app lifetime. Never disconnect unless the user
// explicitly navigates away. This prevents the repeated connect/disconnect
// loops that appear in the backend logs when React re-renders.

class SocketService {
    private socket: Socket | null = null;
    private currentUserId: string | null = null;
    private currentUserRole: UserRole = 'user';
    private listenersRegistered = false;

    /** Module-level singleton — never call `new SocketService()` directly. */
    private static instance: SocketService;
    static getInstance(): SocketService {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }

    /**
     * Connects to the NestJS backend. Idempotent — safe to call on every
     * React mount without triggering a reconnect if we're already connected.
     */
    connect(userId: string, userRole: UserRole = 'user'): void {
        // ── Already connected with the same user + role — do nothing ──────────
        if (this.socket?.connected && this.currentUserId === userId && this.currentUserRole === userRole) {
            return;
        }

        // ── Socket exists but belongs to a different user/role → reconnect ────
        if (this.socket && (this.currentUserId !== userId || this.currentUserRole !== userRole)) {
            this.socket.disconnect();
            this.socket = null;
            this.listenersRegistered = false;
        }

        this.currentUserId = userId;
        this.currentUserRole = userRole;

        // ── Create a new socket if one doesn't exist yet ──────────────────────
        if (!this.socket) {
            this.socket = io('http://localhost:3000', {
                query: { userId, userRole },
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 2000,
                reconnectionDelayMax: 10000,
                autoConnect: true,
            });
        }

        // ── Register listeners exactly once per socket instance ───────────────
        if (!this.listenersRegistered) {
            this.listenersRegistered = true;
            this._registerListeners();
        }
    }

    private async _syncFromBackend(): Promise<void> {
        try {
            const res = await fetch('http://localhost:3000/lock/check-all');
            if (!res.ok) return;
            const activeLocks: { entityId: string; owner: string }[] = await res.json();
            const lockMap: Record<string, any> = {};
            for (const lock of activeLocks) {
                if (lock.entityId) {
                    lockMap[lock.entityId] = {
                        entityId: lock.entityId,
                        owner: lock.owner,
                        lockedAt: new Date().toISOString(),
                    };
                }
            }
            useLockStore.getState().syncLocks(lockMap);
        } catch (err) {
            console.error('[SocketService] Sync error:', err);
        }
    }

    private _registerListeners(): void {
        if (!this.socket) return;

        this.socket.on('connect', async () => {
            console.info(`[SocketService] Connected — id: ${this.socket?.id}`);
            await this._syncFromBackend();
        });

        this.socket.on('disconnect', (reason) => {
            console.warn(`[SocketService] Disconnected — reason: ${reason}`);
        });

        this.socket.on('connect_error', (err) => {
            console.error(`[SocketService] Connection error: ${err.message}`);
        });

        this.socket.on('entityLocked', (data: EntityLockedPayload) => {
            if (!data?.entityId) return;
            useLockStore.getState().setLock(data.entityId, data.owner);
        });

        this.socket.on('entityUnlocked', (data: EntityUnlockedPayload) => {
            if (!data?.entityId) return;
            useLockStore.getState().clearLock(data.entityId);
        });
    }

    /**
     * Only call this when the entire app is unmounting (e.g. page unload).
     * Do NOT call this in React component cleanup functions that run on
     * every re-render — doing so is what caused the reconnect loop.
     */
    disconnect(): void {
        this.socket?.disconnect();
        this.socket = null;
        this.listenersRegistered = false;
        this.currentUserId = null;
    }

    /** Emit a 'requestLock' event to the server */
    requestLock(entityId: string, userId: string, userRole: UserRole = 'user'): void {
        this.socket?.emit('requestLock', { entityId, userId, userRole });
    }

    /** Emit a 'releaseLock' event to the server */
    releaseLock(entityId: string, userId: string, userRole: UserRole = 'user'): void {
        this.socket?.emit('releaseLock', { entityId, userId, userRole });
    }

    /**
     * Emit a 'forceUnlock' event — admin only.
     * The backend gateway will reject this if userRole !== 'admin'.
     */
    forceUnlock(entityId: string, userId: string, userRole: UserRole): void {
        this.socket?.emit('forceUnlock', { entityId, userId, userRole });
    }

    /** Emit a 'heartbeat' to extend the lock TTL */
    heartbeat(entityId: string, userId: string): void {
        this.socket?.emit('heartbeat', { entityId, userId });
    }

    /** Subscribe to a raw socket event (e.g. for component-level side-effects). */
    onEvent(event: string, handler: (...args: any[]) => void): void {
        this.socket?.on(event, handler);
    }

    /** Unsubscribe from a raw socket event. */
    offEvent(event: string, handler: (...args: any[]) => void): void {
        this.socket?.off(event, handler);
    }

    get isConnected(): boolean {
        return this.socket?.connected ?? false;
    }
}

export const socketService = SocketService.getInstance();
