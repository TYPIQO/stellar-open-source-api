import { Module } from '@nestjs/common';

import { StellarConfig } from '@/configuration/stellar.configuration';

import { ODOO_REPOSITORY } from './application/repository/odoo.repository.interface';
import { STELLAR_REPOSITORY } from './application/repository/stellar.repository.interface';
import { OdooRepository } from './infrastructure/odoo/odoo.repository';
import { StellarRepository } from './infrastructure/stellar/stellar.repository';

@Module({
  providers: [
    StellarConfig,
    {
      provide: STELLAR_REPOSITORY,
      useClass: StellarRepository,
    },
    {
      provide: ODOO_REPOSITORY,
      useClass: OdooRepository,
    },
  ],
  exports: [STELLAR_REPOSITORY, ODOO_REPOSITORY],
})
export class CommonModule {}
