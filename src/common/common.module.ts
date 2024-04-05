import { Module } from '@nestjs/common';

import { StellarConfig } from '@/configuration/stellar.configuration';

import { STELLAR_REPOSITORY } from './application/repository/stellar.repository.interface';
import { StellarRepository } from './infrastructure/stellar/stellar.repository';

@Module({
  providers: [
    StellarConfig,
    {
      provide: STELLAR_REPOSITORY,
      useClass: StellarRepository,
    },
  ],
  exports: [STELLAR_REPOSITORY],
})
export class CommonModule {}
