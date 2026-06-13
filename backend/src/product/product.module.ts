import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ProductDraftService } from './product-draft.service';
import { ProductDraftController } from './product-draft.controller';
import { Product } from '../entities/product.entity';
import { ProductDraft } from '../entities/product-draft.entity';
import { LockModule } from '../lock/lock.module';
import { SeedService } from './seed.service';
import { AuditModule } from '../audit/audit-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductDraft]),
    forwardRef(() => LockModule),
    AuditModule,
  ],
  controllers: [ProductController, ProductDraftController],
  providers: [ProductService, ProductDraftService, SeedService],
  exports: [ProductDraftService],
})
export class ProductModule { }
