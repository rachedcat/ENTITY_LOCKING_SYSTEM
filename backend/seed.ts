import { DataSource } from 'typeorm';
import { Product } from './src/entities/product.entity';

const demoProducts = [
    { id: 101, name: 'Wireless Headphones Pro', description: 'Premium noise-canceling headphones.', version: 1 },
    { id: 102, name: 'Mechanical Keyboard TKL', description: 'Tactile mechanical switches.', version: 1 },
    { id: 103, name: '4K Monitor UltraWide', description: '34-inch ultrawide display.', version: 1 },
    { id: 104, name: 'USB-C Hub 12-in-1', description: 'All-in-one connectivity.', version: 1 },
    { id: 105, name: 'Ergonomic Mouse X500', description: 'Reduces wrist strain.', version: 1 },
    { id: 106, name: 'NVMe SSD 2TB', description: 'Lightning fast PCIE 4.0 storage.', version: 1 },
];

const AppDataSource = new DataSource({
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'user',
    password: 'password',
    database: 'sve_db',
    entities: [Product],
    synchronize: true,
});

AppDataSource.initialize().then(async () => {
    console.log("DB connected...");
    for (const p of demoProducts) {
        let prod = await AppDataSource.manager.findOneBy(Product, { id: p.id });
        if (!prod) {
            prod = AppDataSource.manager.create(Product, p);
            await AppDataSource.manager.save(prod);
            console.log("Created: ", p.id);
        } else {
            console.log("Exists: ", p.id);
        }
    }
    console.log("Seeding complete!");
    process.exit(0);
}).catch(e => {
    console.error("FATAL ERROR", e);
    process.exit(1);
});
