import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from '@/common/common.module';

import { ODOO_ACTION_REPOSITORY } from './application/repository/odoo-action.repository.interface';
import { ActionService } from './application/services/action.service';
import { OdooActionSchema } from './infrastructure/persistence/odoo-action.schema';
import { OdooActionTypeormRepository } from './infrastructure/persistence/odoo-action.typeorm.repository';

@Module({
  imports: [TypeOrmModule.forFeature([OdooActionSchema]), CommonModule],
  providers: [
    ActionService,
    {
      provide: ODOO_ACTION_REPOSITORY,
      useClass: OdooActionTypeormRepository,
    },
  ],
})
export class ActionModule {}
