import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from '@/common/common.module';

import { OdooModule } from '../odoo/odoo.module';
import { PRODUCT_ASSET_REPOSITORY } from './application/repository/product-asset.repository.interface';
import { ProductAssetService } from './application/services/product-asset.service';
import { ProductAssetSchema } from './infrastructure/persistence/product-asset.schema';
import { ProductAssetTypeormRepository } from './infrastructure/persistence/product-asset.typeorm.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductAssetSchema]),
    OdooModule,
    CommonModule,
  ],
  providers: [
    ProductAssetService,
    {
      provide: PRODUCT_ASSET_REPOSITORY,
      useClass: ProductAssetTypeormRepository,
    },
  ],
  exports: [ProductAssetService],
})
export class ProductAssetModule {}
