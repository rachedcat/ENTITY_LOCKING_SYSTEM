import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type AuditAction =
    | 'locked'
    | 'unlocked'
    | 'force_unlocked'
    | 'draft_committed'
    | 'draft_discarded'
    | 'lock_denied';

@Entity('activity_logs')
export class AuditLog {
    @PrimaryGeneratedColumn()
    id: number;

    /** Product entity that was the target of the action */
    @Column()
    entityId: string;

    /** Human-readable product name at time of event (for display) */
    @Column({ nullable: true })
    entityName: string;

    @Column()
    action: AuditAction;

    /** User who performed the action */
    @Column()
    actorId: string;

    @Column({ nullable: true })
    actorName: string;

    /** The other user involved (e.g. whose lock was force-released) */
    @Column({ nullable: true })
    targetUserId: string;

    /** Lock duration in seconds (set on unlock events) */
    @Column({ type: 'float', nullable: true })
    durationSeconds: number;

    @CreateDateColumn()
    createdAt: Date;
}
