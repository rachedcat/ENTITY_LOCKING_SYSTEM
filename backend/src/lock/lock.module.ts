import { Module, forwardRef } from '@nestjs/common';
import { LockController } from './lock.controller';
import { LockService } from './lock.service';
import { LockGateway } from './lock.gateway';
import { ProductModule } from '../product/product.module';
import { AuditModule } from '../audit/audit-log.module';

@Module({
  imports: [
    forwardRef(() => ProductModule),
    AuditModule,
  ],
  controllers: [LockController],
  providers: [LockService, LockGateway],
  exports: [LockService, LockGateway],
})
export class LockModule { }


