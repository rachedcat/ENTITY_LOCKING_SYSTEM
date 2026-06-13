import {
    Injectable,
    OnModuleInit,
    BadRequestException,
    ForbiddenException,
    ServiceUnavailableException,
    Logger,
    Inject,
    forwardRef,
} from '@nestjs/common';
import Redis from 'ioredis';
import { LockGateway } from './lock.gateway';
import { ProductDraftService } from '../product/product-draft.service';
import { AuditLogService } from '../audit/audit-log.service';

// ─── Lua script: atomic check-and-extend ─────────────────────────────────────
// Redis executes Lua atomically (single-threaded), eliminating the GET→EXPIRE
// race window. Return values: 1 = extended, 0 = wrong owner, -1 = key missing.
const EXTEND_LOCK_LUA = `
local owner = redis.call('GET', KEYS[1])
if owner == false then
  return -1
elseif owner ~= ARGV[1] then
  return 0
else
  return redis.call('EXPIRE', KEYS[1], ARGV[2])
end
`;

@Injectable()
export class LockService implements OnModuleInit {
    private redisClient: Redis;
    private readonly logger = new Logger(LockService.name);

    constructor(
        @Inject(forwardRef(() => LockGateway))
        private readonly lockGateway: LockGateway,
        private readonly draftService: ProductDraftService,
        private readonly auditService: AuditLogService,
    ) { }

    onModuleInit() {
        this.redisClient = new Redis({
            host: 'localhost',
            port: 6379,
        });

        this.redisClient.on('error', (err) => {
            this.logger.error('Redis connection error', err.message);
        });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Wraps every Redis call. Translates ioredis transport errors into
     * ServiceUnavailableException (HTTP 503). Business-logic exceptions
     * (Bad/Forbidden) are re-thrown untouched.
     */
    private async safeRedis<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (
                error instanceof BadRequestException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }
            this.logger.error('Redis operation failed', error.message);
            throw new ServiceUnavailableException(
                'Cache service is currently unavailable. Please try again later.',
            );
        }
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    // --- GENERIC API ALIASES (Project Requirement) ---
    async lock(entityId: string, userId: string, userRole?: string) {
        return this.acquireLock(entityId, userId, userRole);
    }
    async unlock(entityId: string, userId: string, userRole?: string) {
        return this.releaseLock(entityId, userId, userRole as 'user' | 'admin');
    }
    async isLocked(entityId: string): Promise<boolean> {
        const status = await this.getLockStatus(entityId);
        return status.isLocked;
    }
    async getLockInfo(entityId: string) {
        return this.getLockStatus(entityId);
    }
    // --------------------------------------------------

    async acquireLock(entityId: string, userId: string, userRole?: string) {
        const lockKey = `lock:product:${entityId}`;
        const EXPIRE_TIME = 1800; // 30 minutes

        // ── Priority Guard Check ────────────────────────────────────────────────
        // Block non-admins from locking an entity that has pending drafts.
        const pendingDraft = await this.draftService.getDraftSummaryByProductId(Number(entityId));
        if (pendingDraft && userRole !== 'admin') {
            await this.auditService.log({
                entityId,
                action: 'lock_denied',
                actorId: userId,
                // Passing the draft owner as targetUserId so the ActivityPage can describe the block fully
                targetUserId: pendingDraft.ownerName || pendingDraft.userId,
            }).then(() => this.lockGateway.notifyAuditEvent()).catch(e => this.logger.error(e));

            throw new ForbiddenException(`Entity has a pending draft. Only administrators may force an override.`);
        }
        // ────────────────────────────────────────────────────────────────────────

        return this.safeRedis(async () => {
            const result = await this.redisClient.set(
                lockKey, userId, 'EX', EXPIRE_TIME, 'NX',
            );

            if (result === 'OK') {
                await this.redisClient.set(`lock:product:${entityId}:lockedAt`, Date.now().toString());
                this.logger.log(`Lock acquired — entity: ${entityId}, owner: ${userId}`);
                // Broadcast to all WebSocket clients via the gateway
                this.lockGateway.notifyLocked(entityId, userId);
                this.auditService.log({
                    entityId, action: 'locked', actorId: userId
                }).then(() => this.lockGateway.notifyAuditEvent()).catch(e => this.logger.error(e));

                return { status: 'locked', owner: userId };
            }

            const currentOwner = await this.redisClient.get(lockKey);
            throw new BadRequestException(`Entity is already locked by: ${currentOwner}`);
        });
    }

    async getLockStatus(entityId: string): Promise<{ isLocked: boolean; owner: string | null }> {
        const lockKey = `lock:product:${entityId}`;
        return this.safeRedis(async () => {
            const owner = await this.redisClient.get(lockKey);
            return { isLocked: owner !== null, owner };
        });
    }

    /**
     * Atomically extends the lock TTL using a Lua script.
     * Eliminates the GET→EXPIRE race window where a key could expire
     * between the two commands.
     */
    async extendLock(entityId: string, userId: string) {
        const lockKey = `lock:product:${entityId}`;
        const EXPIRE_TIME = 1800; // 30 minutes

        return this.safeRedis(async () => {
            const result = await this.redisClient.eval(
                EXTEND_LOCK_LUA,
                1,           // number of KEYS
                lockKey,     // KEYS[1]
                userId,      // ARGV[1]
                String(EXPIRE_TIME), // ARGV[2]
            ) as number;

            if (result === -1) {
                throw new BadRequestException(`No active lock found for entity: ${entityId}`);
            }
            if (result === 0) {
                throw new ForbiddenException(
                    'Unauthorized: you do not own this lock.',
                );
            }

            const expiresAt = new Date(Date.now() + EXPIRE_TIME * 1000).toISOString();
            this.logger.log(`Lock extended — entity: ${entityId}, owner: ${userId}, expiresAt: ${expiresAt}`);
            return { status: 'extended', owner: userId, expiresAt };
        });
    }

    /**
     * Releases (or force-releases) a lock.
     *
     * - userRole === 'admin'  → Force Unlock: bypass ownership check, always DEL.
     * - userRole === 'user'   → Strict: only the owner can release.
     *
     * #1 — Security: distinguishes "no lock" (404-like) from "wrong owner" (403).
     * ForbiddenException is semantically correct for an ownership check failure.
     * The current owner is intentionally NOT leaked in the 403 message for users.
     */
    async releaseLock(
        entityId: string,
        userId: string,
        userRole: 'user' | 'admin' = 'user',
    ) {
        const lockKey = `lock:product:${entityId}`;
        return this.safeRedis(async () => {
            const owner = await this.redisClient.get(lockKey);

            if (owner === null) {
                throw new ForbiddenException(
                    `No active lock found for entity: ${entityId}`,
                );
            }

            // Admins bypass ownership — this is the Force Unlock capability.
            if (userRole !== 'admin' && owner !== userId) {
                throw new ForbiddenException(
                    'Unauthorized: this lock is held by a different user.',
                );
            }

            await this.redisClient.del(lockKey);

            const lockedAtStr = await this.redisClient.get(`lock:product:${entityId}:lockedAt`);
            let durationSeconds: number | undefined;
            if (lockedAtStr) {
                durationSeconds = Math.round((Date.now() - parseInt(lockedAtStr, 10)) / 1000);
                await this.redisClient.del(`lock:product:${entityId}:lockedAt`);
            }

            if (userRole === 'admin' && owner !== userId) {
                this.logger.warn(
                    `[Force Unlock] Admin ${userId} released entity ${entityId} ` +
                    `(previously owned by ${owner})`,
                );
                // If admin force-unlocked, mark the user's auto-saved draft as pending_review
                await this.draftService.markPendingReview(
                    parseInt(entityId),
                    owner, // The user who was kicked out
                    userId, // The admin doing the kicking
                    undefined,
                    durationSeconds,
                );
                // Also notify clients
                this.lockGateway.notifyDraftPendingReview(entityId, owner);

                this.auditService.log({
                    entityId, action: 'force_unlocked', actorId: userId, targetUserId: owner, durationSeconds
                }).then(() => this.lockGateway.notifyAuditEvent()).catch(e => this.logger.error(e));
            } else {
                this.logger.log(`Lock released — entity: ${entityId}, owner: ${userId}`);

                this.auditService.log({
                    entityId, action: 'unlocked', actorId: userId, durationSeconds
                }).then(() => this.lockGateway.notifyAuditEvent()).catch(e => this.logger.error(e));
            }

            // Broadcast to all WebSocket clients via the gateway
            this.lockGateway.notifyUnlocked(entityId);
            return { status: 'unlocked' };
        });
    }

    /**
     * #4 — System Monitor: returns all active locks from Redis.
     * Uses SCAN (cursor-based, non-blocking) instead of KEYS * for
     * production safety. Returns entityId, owner, and remaining TTL in seconds.
     */
    async getAllActiveLocks(): Promise<{ entityId: string; owner: string; ttlSeconds: number }[]> {
        return this.safeRedis(async () => {
            const keys: string[] = [];
            let cursor = '0';
            const pattern = 'lock:product:*';

            // Iterate with SCAN until cursor returns to '0'
            do {
                const [nextCursor, foundKeys] = await this.redisClient.scan(
                    cursor, 'MATCH', pattern, 'COUNT', 100,
                );
                cursor = nextCursor;
                keys.push(...foundKeys);
            } while (cursor !== '0');

            if (keys.length === 0) return [];

            // Pipeline GET + TTL for all keys in one round-trip
            const pipeline = this.redisClient.pipeline();
            for (const key of keys) {
                pipeline.get(key);
                pipeline.ttl(key);
            }

            const results = await pipeline.exec();
            const locks: { entityId: string; owner: string; ttlSeconds: number }[] = [];

            for (let i = 0; i < keys.length; i++) {
                const ownerResult = results![i * 2];
                const ttlResult = results![i * 2 + 1];

                const owner = ownerResult?.[1] as string | null;
                const ttlSeconds = ttlResult?.[1] as number;

                if (owner !== null && owner !== undefined) {
                    // Strip the 'lock:product:' prefix to get the bare entityId
                    const entityId = keys[i].replace('lock:product:', '');
                    locks.push({ entityId, owner, ttlSeconds });
                }
            }

            return locks;
        });
    }
}