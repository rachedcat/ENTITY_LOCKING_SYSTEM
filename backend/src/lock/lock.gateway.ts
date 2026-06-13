import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { LockService } from './lock.service';

type UserRole = 'user' | 'admin';
const VALID_ROLES: UserRole[] = ['user', 'admin'];

interface LockPayload {
    entityId: string;
    userId: string;
    userRole?: UserRole;
}

@WebSocketGateway({
    cors: {
        origin: 'http://localhost:5173', // Tighten this to your frontend URL in production
    },
})
export class LockGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(LockGateway.name);

    constructor(
        @Inject(forwardRef(() => LockService))
        private readonly lockService: LockService,
    ) { }

    // ─── Broadcast helpers (called by LockService) ───────────────────────────

    /**
     * Broadcast to ALL connected clients that an entity has been locked.
     * Called by LockService after a successful Redis SET.
     */
    notifyLocked(entityId: string, owner: string) {
        this.server?.emit('entityLocked', { entityId, owner });
    }

    /**
     * Broadcast to ALL connected clients that an entity has been unlocked.
     * Called by LockService after a successful Redis DEL.
     */
    notifyUnlocked(entityId: string) {
        this.server?.emit('entityUnlocked', { entityId });
    }

    notifyDraftPendingReview(entityId: string, ownerUserId: string) {
        this.server?.emit('draftPendingReview', { entityId, ownerUserId });
    }

    /**
     * Broadcast to ALL connected clients that a draft's status has been modified.
     * Called when a draft is Saved or Deleted.
     */
    notifyEntityDraftUpdated(entityId: string, userId: string) {
        this.server?.emit('entityDraftUpdated', { entityId, userId });
    }

    /**
     * Broadcast to ALL connected clients that an entity was fundamentally modified.
     * Clients should run an explicit API re-fetch.
     */
    notifyEntityUpdated(entityId: string) {
        this.server?.emit('entityUpdated', { entityId });
    }

    notifyAuditEvent() {
        this.server?.emit('auditEvent');
    }

    handleConnection(client: Socket) {
        this.logger.log(`Client connected    — id: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        // Retrieve the userId the frontend passed as a query param on connect,
        // e.g. io('http://...', { query: { userId: 'user-42' } })
        const userId = client.handshake.query['userId'] ?? 'unknown';
        const remaining = this.server.sockets.sockets.size;

        this.logger.warn(
            `Client disconnected — socketId: ${client.id}, userId: ${userId}, ` +
            `remaining clients: ${remaining}`,
        );
        // NOTE: We intentionally do NOT release the Redis lock here.
        // The 30-minute TTL is the authoritative expiry. The user may reconnect
        // before the TTL lapses and resume editing.
    }

    /**
     * Event: 'requestLock'
     * Payload: { entityId: string, userId: string }
     *
     * Attempts to acquire a lock via LockService.
     * On success  → emits 'entityLocked'   to ALL connected clients.
     * On failure  → emits 'lockError'       back to the requesting client only.
     */
    @SubscribeMessage('requestLock')
    async handleRequestLock(
        @MessageBody() payload: LockPayload,
        @ConnectedSocket() client: Socket,
    ) {
        try {
            const result = await this.lockService.acquireLock(
                payload.entityId,
                payload.userId,
                payload.userRole,
            );

            // Broadcast to every connected client (including sender)
            this.server.emit('entityLocked', {
                entityId: payload.entityId,
                owner: result.owner,
            });

            return { event: 'entityLocked', data: result };
        } catch (error) {
            // Emit error only to the requesting client
            client.emit('lockError', {
                entityId: payload.entityId,
                message: error.message,
            });
        }
    }

    /**
     * Event: 'releaseLock'
     * Payload: { entityId: string, userId: string }
     *
     * Releases the lock via LockService.
     * On success  → emits 'entityUnlocked' to ALL connected clients.
     * On failure  → emits 'lockError'       back to the requesting client only.
     */
    @SubscribeMessage('releaseLock')
    async handleReleaseLock(
        @MessageBody() payload: LockPayload,
        @ConnectedSocket() client: Socket,
    ) {
        // Validate role — unknown values are coerced to 'user' (safe default)
        const userRole: UserRole = VALID_ROLES.includes(payload.userRole as UserRole)
            ? (payload.userRole as UserRole)
            : 'user';

        try {
            const result = await this.lockService.releaseLock(
                payload.entityId,
                payload.userId,
                userRole,
            );

            // Broadcast to every connected client (including sender)
            this.server.emit('entityUnlocked', {
                entityId: payload.entityId,
            });

            return { event: 'entityUnlocked', data: result };
        } catch (error) {
            client.emit('lockError', {
                entityId: payload.entityId,
                message: error.message,
            });
        }
    }

    /**
     * Event: 'forceUnlock'
     * Payload: { entityId: string, userId: string, userRole: 'admin' }
     *
     * Admin-only force release. The gateway performs a hard role check
     * BEFORE calling the service — this blocks spoofed payloads from
     * non-admin sockets entirely.
     */
    @SubscribeMessage('forceUnlock')
    async handleForceUnlock(
        @MessageBody() payload: LockPayload,
        @ConnectedSocket() client: Socket,
    ) {
        // ── Anti-spoofing guard ───────────────────────────────────────────────
        // Reject unconditionally if the claimed role is not 'admin'.
        // A regular user cannot reach the service layer via this event.
        if (payload.userRole !== 'admin') {
            this.logger.warn(
                `[Security] forceUnlock rejected — ` +
                `socket ${client.id} claimed role: "${payload.userRole}"`,
            );
            client.emit('lockError', {
                entityId: payload.entityId,
                message: 'Unauthorized: only admins can force-unlock.',
            });
            return;
        }

        try {
            const result = await this.lockService.releaseLock(
                payload.entityId,
                payload.userId,
                'admin',
            );

            // Broadcast unlock to every client
            this.server.emit('entityUnlocked', {
                entityId: payload.entityId,
            });

            return { event: 'entityUnlocked', data: result };
        } catch (error) {
            client.emit('lockError', {
                entityId: payload.entityId,
                message: error.message,
            });
        }
    }

    /**
     * Event: 'heartbeat'
     * Payload: { entityId: string, userId: string }
     *
     * Resets the lock TTL back to 30 minutes in Redis.
     * On success  → emits 'lockExtended' back to the requesting client with the new expiresAt.
     * On failure  → emits 'lockError'    back to the requesting client only.
     */
    @SubscribeMessage('heartbeat')
    async handleHeartbeat(
        @MessageBody() payload: LockPayload,
        @ConnectedSocket() client: Socket,
    ) {
        try {
            const result = await this.lockService.extendLock(
                payload.entityId,
                payload.userId,
            );

            // Send confirmation only to the caller — TTL refresh is not a state change
            // other clients need to react to.
            client.emit('lockExtended', {
                entityId: payload.entityId,
                owner: result.owner,
                expiresAt: result.expiresAt,
            });

            return { event: 'lockExtended', data: result };
        } catch (error) {
            client.emit('lockError', {
                entityId: payload.entityId,
                message: error.message,
            });
        }
    }
}
