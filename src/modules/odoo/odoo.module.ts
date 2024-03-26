import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StellarModule } from '../stellar/stellar.module';
import { ODOO_ACTION_REPOSITORY } from './application/repository/odoo-action.repository.interface';
import { OdooService } from './application/services/odoo.service';
import { OdooActionSchema } from './infrastructure/persistence/odoo-action.schema';
import { OdooActionTypeormRepository } from './infrastructure/persistence/odoo-action.typeorm.repository';
import { OdooController } from './interface/odoo.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OdooActionSchema]),
    forwardRef(() => StellarModule),
  ],
  providers: [
    OdooService,
    {
      provide: ODOO_ACTION_REPOSITORY,
      useClass: OdooActionTypeormRepository,
    },
  ],
  exports: [OdooService],
  controllers: [OdooController],
})
export class OdooModule {}
