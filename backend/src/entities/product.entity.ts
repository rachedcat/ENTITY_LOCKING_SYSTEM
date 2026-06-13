import { Entity, PrimaryGeneratedColumn, Column, VersionColumn } from 'typeorm';

@Entity('products')
export class Product {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @VersionColumn() // Handles optimistic locking conflict detection automatically
    version: number;

    /**
     * Tracks the userId of the last editor.
     * Set explicitly by the caller before saving:
     *   product.lastEditedBy = userId;
     *   await productRepository.save(product);
     * TypeORM's @VersionColumn will auto-increment `version` on each save.
     */
    @Column({ nullable: true })
    lastEditedBy: string;
}