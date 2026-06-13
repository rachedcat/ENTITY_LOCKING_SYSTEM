import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LockModule } from './lock/lock.module';
import { ProductModule } from './product/product.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'user',
      password: 'password',
      database: 'sve_db',
      autoLoadEntities: true,
      synchronize: true, // This creates the tables automatically in dev mode
    }),
    LockModule,
    ProductModule,
  ],
})
export class AppModule { }