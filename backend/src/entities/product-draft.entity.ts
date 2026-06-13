import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, CreateDateColumn } from 'typeorm';

export type DraftStatus = 'editing' | 'pending_review' | 'committed' | 'discarded';

/**
 * Stores auto-saved drafts for a product edit session.
 * One row per (productId, userId) pair — upserted on each 120-second auto-save tick.
 * Cleared (or status-updated) after a successful save or admin force-unlock.
 */
@Entity('product_drafts')
export class ProductDraft {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    productId: number;

    @Column()
    userId: string;

    /** Display name of the user (populated from auth store preset, optional) */
    @Column({ type: 'varchar', nullable: true })
    ownerName: string | null;

    /** Draft field values */
    @Column({ type: 'varchar', nullable: true })
    draftName: string | null;

    @Column({ type: 'text', nullable: true })
    draftDescription: string | null;

    /** Product version the user had open when the draft was created */
    @Column({ type: 'int', nullable: true })
    baseVersion: number | null;

    /**
     * Lifecycle status:
     *   editing        → active auto-save session
     *   pending_review → admin force-unlocked and flagged for review
     *   committed      → admin accepted and saved to DB
     *   discarded      → admin rejected
     */
    @Column({ type: 'varchar', default: 'editing' })
    status: DraftStatus;

    /** The admin who triggered the force-unlock that flagged this draft */
    @Column({ type: 'varchar', nullable: true })
    adminId: string;

    /** Time the user spent editing before being force-unlocked */
    @Column({ type: 'int', nullable: true })
    lockDuration: number | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    savedAt: Date;
}
