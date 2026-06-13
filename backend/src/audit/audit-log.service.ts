import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction } from '../entities/audit-log.entity';

export interface AuditEventDto {
    entityId: string;
    entityName?: string;
    action: AuditAction;
    actorId: string;
    actorName?: string;
    targetUserId?: string;
    durationSeconds?: number;
}

@Injectable()
export class AuditLogService {
    constructor(
        @InjectRepository(AuditLog)
        private auditRepo: Repository<AuditLog>,
    ) { }

    async log(event: AuditEventDto): Promise<AuditLog> {
        const entry = this.auditRepo.create(event);
        return this.auditRepo.save(entry);
    }

    async getLatest(limit = 50): Promise<AuditLog[]> {
        return this.auditRepo.find({
            order: { createdAt: 'DESC' },
            take: limit,
        });
    }
}
