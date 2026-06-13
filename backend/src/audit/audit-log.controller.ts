import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

@Controller('audit')
export class AuditLogController {
    constructor(private readonly auditService: AuditLogService) { }

    /**
     * GET /audit?limit=50
     * Returns recent audit events, newest first.
     */
    @Get()
    getLatest(@Query('limit') limit?: string) {
        const n = parseInt(limit ?? '50', 10);
        return this.auditService.getLatest(isNaN(n) ? 50 : n);
    }
}
