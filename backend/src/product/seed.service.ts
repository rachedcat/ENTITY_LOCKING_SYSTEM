import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';

@Injectable()
export class SeedService implements OnModuleInit {
    constructor(
        @InjectRepository(Product)
        private productRepository: Repository<Product>,
    ) { }

    async onModuleInit() {
        if ((await this.productRepository.count()) === 0) {
            console.log('[SeedService] Database is empty. Seeding products 101-106...');
            const demoProducts = [
                { id: 101, name: 'Wireless Headphones Pro', category: 'Audio', description: 'Premium noise-canceling headphones.' },
                { id: 102, name: 'Mechanical Keyboard TKL', category: 'Peripherals', description: 'Tactile mechanical switches.' },
                { id: 103, name: '4K Monitor UltraWide', category: 'Displays', description: '34-inch ultrawide display.' },
                { id: 104, name: 'USB-C Hub 12-in-1', category: 'Accessories', description: 'All-in-one connectivity.' },
                { id: 105, name: 'Ergonomic Mouse X500', category: 'Peripherals', description: 'Reduces wrist strain.' },
                { id: 106, name: 'NVMe SSD 2TB', category: 'Storage', description: 'Lightning fast PCIE 4.0 storage.' },
            ];

            for (const p of demoProducts) {
                const product = this.productRepository.create({
                    name: p.name,
                    description: p.description,
                    version: 1,
                    lastEditedBy: undefined as unknown as string,
                });
                product.id = p.id;
                await this.productRepository.save(product);
                console.log(`[SeedService] Created product ${p.id}`);
            }
        }
    }
}
