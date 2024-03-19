import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ODOO_ACTION_REPOSITORY } from './application/repository/odoo-action.repository.interface';
import { OdooService } from './application/services/odoo.service';
import { OdooActionSchema } from './infrastructure/persistence/odoo-action.schema';
import { OdooActionTypeormRepository } from './infrastructure/persistence/odoo-action.typeorm.repository';

@Module({
  imports: [TypeOrmModule.forFeature([OdooActionSchema])],
  providers: [
    OdooService,
    {
      provide: ODOO_ACTION_REPOSITORY,
      useClass: OdooActionTypeormRepository,
    },
  ],
  exports: [OdooService],
})
export class OdooModule {}
