import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OdooModule } from '../odoo/odoo.module';
import { AUTOMATION_REPOSITORY } from './application/repository/automation.repository.interface';
import { AutomationService } from './application/services/automation.service';
import { AutomationSchema } from './infrastructure/persistence/automation.schema';
import { AutomationTypeormRepository } from './infrastructure/persistence/automation.typeorm.repository';
import { AutomationController } from './interface/automation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AutomationSchema]), OdooModule],
  controllers: [AutomationController],
  providers: [
    AutomationService,
    {
      provide: AUTOMATION_REPOSITORY,
      useClass: AutomationTypeormRepository,
    },
  ],
})
export class AutomationModule {}
