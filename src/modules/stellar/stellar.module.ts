import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from '@/common/common.module';

import { OdooModule } from '../odoo/odoo.module';
import { ProductAssetModule } from '../product-asset/product-asset.module';
import { ErrorMapper } from './application/mapper/error.mapper';
import { STELLAR_TRANSACTION_REPOSITORY } from './application/repository/stellar-transaction.repository.interface';
import { StellarService } from './application/services/stellar.service';
import { StellarTransactionSchema } from './infrastructure/persistence/stellar-transaction.schema';
import { StellarTransactionTypeormRepository } from './infrastructure/persistence/stellar-transaction.typeorm.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([StellarTransactionSchema]),
    OdooModule,
    ProductAssetModule,
    CommonModule,
  ],
  providers: [
    StellarService,
    ErrorMapper,
    {
      provide: STELLAR_TRANSACTION_REPOSITORY,
      useClass: StellarTransactionTypeormRepository,
    },
  ],
})
export class StellarModule {}
