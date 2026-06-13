import {
    Controller,
    Post,
    Get,
    Delete,
    Param,
    Body,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { LockService } from './lock.service';

class LockBodyDto {
    @IsString()
    @IsNotEmpty({ message: 'userId must not be empty' })
    userId: string;
}

@Controller('lock')
export class LockController {
    constructor(private readonly lockService: LockService) { }

    /**
     * POST /lock/:id
     * Acquire a lock on an entity. Requires { userId } in the request body.
     * Returns 200 with { status, owner } on success.
     * Throws 400 if the entity is already locked by another user.
     */
    @Post(':id')
    @HttpCode(HttpStatus.OK)
    async acquireLock(
        @Param('id') entityId: string,
        @Body() body: LockBodyDto,
    ) {
        return this.lockService.acquireLock(entityId, body.userId);
    }

    /**
     * GET /lock/check-all
     * System Monitor endpoint — returns all active locks in Redis.
     * Uses SCAN (non-blocking) for production safety.
     * Response: Array<{ entityId, owner, ttlSeconds }>
     */
    @Get('check-all')
    async getAllActiveLocks() {
        return this.lockService.getAllActiveLocks();
    }

    /**
     * GET /lock/:id
     * Returns the current lock status: { isLocked: boolean, owner: string | null }.
     */
    @Get(':id')
    async getLockStatus(@Param('id') entityId: string) {
        return this.lockService.getLockStatus(entityId);
    }

    /**
     * POST /lock/:id/heartbeat
     * Extends the lock TTL back to 30 minutes. Requires { userId } in the request body.
     * Returns { status: 'extended', owner, expiresAt } on success.
     * Throws 400 if the lock doesn't exist or the caller doesn't own it.
     */
    @Post(':id/heartbeat')
    @HttpCode(HttpStatus.OK)
    async extendLock(
        @Param('id') entityId: string,
        @Body() body: LockBodyDto,
    ) {
        return this.lockService.extendLock(entityId, body.userId);
    }

    /**
     * DELETE /lock/:id
     * Release a lock held by the caller. Requires { userId } in the request body.
     * Returns { status: 'unlocked' } on success.
     * Throws 400 if the caller does not own the lock.
     */
    @Delete(':id')
    async releaseLock(
        @Param('id') entityId: string,
        @Body() body: LockBodyDto,
    ) {
        return this.lockService.releaseLock(entityId, body.userId);
    }
}
