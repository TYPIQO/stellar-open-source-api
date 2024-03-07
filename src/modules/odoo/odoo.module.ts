import { Module } from '@nestjs/common';

import { OdooService } from './application/services/odoo.service';
import { OdooController } from './interface/odoo.controller';

@Module({
  providers: [OdooService],
  controllers: [OdooController],
  exports: [OdooService],
})
export class OdooModule {}
