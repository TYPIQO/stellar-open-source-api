import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from '@/common/common.module';

import { STELLAR_TRANSACTION_REPOSITORY } from './application/repository/stellar-transaction.repository.interface';
import { StellarService } from './application/services/stellar.service';
import { StellarTransactionSchema } from './infrastructure/persistence/stellar-transaction.schema';
import { StellarTransactionTypeormRepository } from './infrastructure/persistence/stellar-transaction.typeorm.repository';
import { StellarController } from './interface/stellar.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StellarTransactionSchema]), CommonModule],
  providers: [
    StellarService,
    {
      provide: STELLAR_TRANSACTION_REPOSITORY,
      useClass: StellarTransactionTypeormRepository,
    },
  ],
  controllers: [StellarController],
  exports: [StellarService],
})
export class StellarModule {}
