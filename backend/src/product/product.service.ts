import {
    Injectable,
    OnModuleInit,
    NotFoundException,
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Inject,
    forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { LockService } from '../lock/lock.service';

@Injectable()
export class ProductService { // Removed "implements OnModuleInit"
    constructor(
        @InjectRepository(Product)
        private productRepository: Repository<Product>,

        // Injected to perform the lock-owner check before every PUT save.
        // forwardRef() guards against any future circular-dependency risk.
        @Inject(forwardRef(() => LockService))
        private readonly lockService: LockService,
    ) { }

    // Removed onModuleInit()
    async resetSystem() {
        // Clear all drafts and activity logs, then restart all products to version 1.
        await this.productRepository.query('DELETE FROM product_drafts;');
        await this.productRepository.query('DELETE FROM activity_logs;');
        await this.productRepository.query('UPDATE products SET version = 1, "lastEditedBy" = NULL;');
        return { message: 'System reset completely.' };
    }

    async findAll(): Promise<Product[]> {
        return this.productRepository.find();
    }

    async getProduct(id: number): Promise<Product> {
        const product = await this.productRepository.findOne({ where: { id } });
        if (!product) {
            throw new NotFoundException(`Product with ID ${id} not found`);
        }
        return product;
    }

    async updateProduct(
        id: number,
        data: { name: string; description: string; version: number; lastEditedBy: string; userRole?: string }
    ): Promise<Product> {
        // ── Lock ownership guard ────────────────────────────────────────────────
        // Before touching the DB, verify that the requesting user still holds the
        // Redis lock. Admins can bypass this check (e.g. when committing a drafted Force-Unlock).
        const lockStatus = await this.lockService.getLockStatus(String(id));
        if (data.userRole !== 'admin' && (!lockStatus.isLocked || lockStatus.owner !== data.lastEditedBy)) {
            throw new ForbiddenException(
                'Lock check failed: you no longer hold the lock for this entity. ' +
                'It may have been force-unlocked by an administrator.',
            );
        }

        const product = await this.getProduct(id);

        // Version guard — throw 409 with full server snapshot so the frontend
        // can populate the 3-way merge view without a second round-trip.
        if (product.version !== data.version) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.CONFLICT,
                    message: `Version mismatch: DB is at v${product.version}, client sent v${data.version}. Please resolve the conflict.`,
                    serverName: product.name,
                    serverDescription: product.description,
                    serverVersion: product.version,
                },
                HttpStatus.CONFLICT,
            );
        }

        product.name = data.name;
        product.description = data.description;
        product.lastEditedBy = data.lastEditedBy;
        // TypeORM @VersionColumn auto-increments version on save — no manual bump needed

        try {
            const saved = await this.productRepository.save(product);
            return saved; // version will now be data.version + 1
        } catch (error: any) {
            if (error?.name === 'OptimisticLockVersionMismatchError') {
                throw new ConflictException('Version mismatch detected at DB level. Please refresh and retry.');
            }
            throw error;
        }
    }
}
