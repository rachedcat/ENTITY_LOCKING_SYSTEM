import {
    Controller, Get, Post, Delete, Patch,
    Param, Body, Query, ParseIntPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ProductDraftService } from './product-draft.service';
import { ProductService } from './product.service';
import { LockGateway } from '../lock/lock.gateway';
import { AuditLogService } from '../audit/audit-log.service';

import { IsString, IsNumber, IsBoolean, IsOptional } from 'class-validator';

class SaveDraftDto {
    @IsString()
    userId: string;

    @IsString()
    ownerName: string;

    @IsString()
    draftName: string;

    @IsString()
    draftDescription: string;

    @IsNumber()
    baseVersion: number;

    @IsBoolean()
    isKillSwitchRescue: boolean;
}

class ResolveDraftDto {
    userId: string;
    action: 'commit' | 'discard';
    /** Only required when action = 'commit' */
    resolvedName?: string;
    resolvedDescription?: string;
    actorId?: string;
    actorName?: string;
}

@Controller('products')
export class ProductDraftController {
    constructor(
        private readonly draftService: ProductDraftService,
        private readonly productService: ProductService,
        private readonly lockGateway: LockGateway,
        private readonly auditService: AuditLogService,
    ) { }

    /**
     * GET /products/drafts/pending
     * Returns all pending_review drafts (for Admin Dashboard badges).
     * NOTE: must be declared BEFORE :id routes to avoid param conflict.
     */
    @Get('drafts/pending')
    async getPendingDrafts() {
        return this.draftService.getAllPendingDrafts();
    }

    /**
     * POST /products/:id/draft
     * Upsert auto-save draft for (productId, userId).
     */
    @Post(':id/draft')
    @HttpCode(HttpStatus.OK)
    async saveDraft(
        @Param('id', ParseIntPipe) productId: number,
        @Body() body: SaveDraftDto,
    ) {
        await this.draftService.saveDraft(
            productId, body.userId, body.draftName,
            body.draftDescription, body.baseVersion, body.ownerName,
            body.isKillSwitchRescue
        );
        this.lockGateway.notifyEntityDraftUpdated(productId.toString(), body.userId);
        return { status: 'draft_saved' };
    }

    /**
     * GET /products/:id/draft?userId=...
     * Returns the stored draft or { draft: null }.
     */
    @Get(':id/draft')
    async getDraft(
        @Param('id', ParseIntPipe) productId: number,
        @Query('userId') userId: string,
    ) {
        const draft = await this.draftService.getDraft(productId, userId);
        return draft ?? { draft: null };
    }

    /**
     * DELETE /products/:id/draft?userId=...
     * Clear draft after successful save.
     */
    @Delete(':id/draft')
    @HttpCode(HttpStatus.OK)
    async deleteDraft(
        @Param('id', ParseIntPipe) productId: number,
        @Query('userId') userId: string,
    ) {
        await this.draftService.deleteDraft(productId, userId);
        this.lockGateway.notifyEntityDraftUpdated(productId.toString(), userId);
        return { status: 'draft_cleared' };
    }

    /**
     * PATCH /products/:id/draft/resolve
     * Admin commits or discards a pending draft.
     * On 'commit': applies the draft values to the product DB record.
     */
    @Patch(':id/draft/resolve')
    @HttpCode(HttpStatus.OK)
    async resolveDraft(
        @Param('id', ParseIntPipe) productId: number,
        @Body() body: ResolveDraftDto,
    ) {
        const draft = await this.draftService.resolveDraft(productId, body.userId, body.action);

        // Log the event, but do not update the DB — the frontend PUT /products/:id handles that now.
        const actionType = body.action === 'commit' ? 'draft_committed' : 'draft_discarded';
        await this.auditService.log({
            entityId: productId.toString(),
            action: actionType,
            actorId: body.actorId || 'system',
            targetUserId: body.userId
        });

        this.lockGateway.notifyAuditEvent();

        return { status: draft.status };
    }
}
