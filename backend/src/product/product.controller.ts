import { Controller, Get, Put, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ProductService } from './product.service';
import { LockGateway } from '../lock/lock.gateway';

@Controller('products')
export class ProductController {
    constructor(
        private readonly productService: ProductService,
        private readonly lockGateway: LockGateway,
    ) { }

    @Get()
    getAllProducts() {
        return this.productService.findAll();
    }

    @Get(':id')
    getProduct(@Param('id', ParseIntPipe) id: number) {
        return this.productService.getProduct(id);
    }

    @Put(':id')
    async updateProduct(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { name: string; description: string; version: number; lastEditedBy: string; userRole?: string }
    ) {
        const updated = await this.productService.updateProduct(id, body);
        this.lockGateway.notifyEntityUpdated(id.toString());
        return updated;
    }

    @Post('reset')
    resetSystem() {
        return this.productService.resetSystem();
    }
}
