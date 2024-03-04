import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StellarConfig } from '@/configuration/stellar.configuration';

import { STELLAR_REPOSITORY } from './application/repository/stellar.repository.interface';
import { StellarTransactionSchema } from './infrastructure/persistence/stellar-transaction.schema';
import { StellarRepository } from './infrastructure/stellar.repository';

@Module({
  imports: [TypeOrmModule.forFeature([StellarTransactionSchema])],
  providers: [
    StellarConfig,
    {
      provide: STELLAR_REPOSITORY,
      useClass: StellarRepository,
    },
  ],
})
export class StellarModule {}
