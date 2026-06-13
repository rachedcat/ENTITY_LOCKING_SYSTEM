import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductDraft, DraftStatus } from '../entities/product-draft.entity';

export interface DraftData {
    draftName: string | null;
    draftDescription: string | null;
    baseVersion: number | null;
    savedAt: string;
    status: DraftStatus;
    ownerName?: string | null;
}

export interface PendingDraftSummary {
    productId: number;
    userId: string;
    ownerName: string | null;
    draftName: string | null;
    draftDescription: string | null;
    baseVersion: number | null;
    adminId: string | null;
    lockDuration: number | null;
    savedAt: string;
}

@Injectable()
export class ProductDraftService {
    constructor(
        @InjectRepository(ProductDraft)
        private draftRepo: Repository<ProductDraft>,
    ) { }

    /**
     * Upsert a draft for (productId, userId).
     * Called every 120 seconds by the frontend auto-save tick.
     */
    async saveDraft(
        productId: number,
        userId: string,
        draftName: string,
        draftDescription: string,
        baseVersion: number,
        ownerName?: string,
        isKillSwitchRescue: boolean = false,
    ): Promise<void> {
        const existing = await this.draftRepo.findOne({
            where: { productId, userId },
        });

        if (existing) {
            // Never overwrite a pending_review draft via auto-save — admin is reviewing it
            // EXCEPT when this is the final final kill-switch rescue save
            if (existing.status === 'pending_review' && !isKillSwitchRescue) return;
            existing.draftName = draftName;
            existing.draftDescription = draftDescription;
            existing.baseVersion = baseVersion;
            if (ownerName) existing.ownerName = ownerName;
            await this.draftRepo.save(existing);
        } else {
            const draft = this.draftRepo.create({
                productId, userId, draftName, draftDescription, baseVersion,
                ownerName: ownerName ?? userId, status: 'editing',
            });
            await this.draftRepo.save(draft);
        }
    }

    /** Return the stored draft for (productId, userId), or null if none. */
    async getDraft(productId: number, userId: string): Promise<DraftData | null> {
        const draft = await this.draftRepo.findOne({ where: { productId, userId } });
        if (!draft) return null;
        return {
            draftName: draft.draftName,
            draftDescription: draft.draftDescription,
            baseVersion: draft.baseVersion,
            savedAt: draft.savedAt.toISOString(),
            status: draft.status,
            ownerName: draft.ownerName,
        };
    }

    /**
     * Called by LockService on admin force-unlock.
     * Marks the draft as pending_review so the admin can review it.
     * If no draft exists yet, creates a placeholder so the badge still appears.
     */
    async markPendingReview(
        productId: number,
        userId: string,
        adminId: string,
        ownerName?: string,
        lockDuration?: number,
    ): Promise<void> {
        const existing = await this.draftRepo.findOne({ where: { productId, userId } });
        if (existing) {
            existing.status = 'pending_review';
            existing.adminId = adminId;
            if (lockDuration !== undefined) existing.lockDuration = lockDuration;
            await this.draftRepo.save(existing);
        } else {
            // User hadn't auto-saved yet — create a placeholder draft
            const draft = this.draftRepo.create({
                productId, userId,
                ownerName: ownerName ?? userId,
                draftName: null, draftDescription: null, baseVersion: null,
                status: 'pending_review', adminId, lockDuration,
            });
            await this.draftRepo.save(draft);
        }
    }

    async getAllPendingDrafts(): Promise<PendingDraftSummary[]> {
        const rows = await this.draftRepo.find({ where: { status: 'pending_review' } });
        return rows.map(r => ({
            productId: r.productId,
            userId: r.userId,
            ownerName: r.ownerName ?? r.userId,
            draftName: r.draftName,
            draftDescription: r.draftDescription,
            baseVersion: r.baseVersion,
            adminId: r.adminId,
            lockDuration: r.lockDuration,
            savedAt: r.savedAt.toISOString(),
        }));
    }

    async getDraftSummaryByProductId(productId: number): Promise<PendingDraftSummary | null> {
        const draft = await this.draftRepo.findOne({ where: { productId, status: 'pending_review' } });
        if (!draft) return null;
        return {
            productId: draft.productId,
            userId: draft.userId,
            ownerName: draft.ownerName ?? draft.userId,
            draftName: draft.draftName,
            draftDescription: draft.draftDescription,
            baseVersion: draft.baseVersion,
            adminId: draft.adminId,
            lockDuration: draft.lockDuration,
            savedAt: draft.savedAt.toISOString(),
        };
    }

    async resolveDraft(
        productId: number,
        userId: string,
        action: 'commit' | 'discard',
    ): Promise<DraftData> {
        const draft = await this.draftRepo.findOne({ where: { productId, userId } });
        if (!draft) throw new NotFoundException('No draft found for this entity/user combination.');
        draft.status = action === 'commit' ? 'committed' : 'discarded';
        await this.draftRepo.save(draft);
        return {
            draftName: draft.draftName,
            draftDescription: draft.draftDescription,
            baseVersion: draft.baseVersion,
            savedAt: draft.savedAt.toISOString(),
            status: draft.status,
        };
    }

    /** Delete the draft after a successful direct save. */
    async deleteDraft(productId: number, userId: string): Promise<void> {
        await this.draftRepo.delete({ productId, userId });
    }
}
