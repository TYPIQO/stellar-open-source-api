import { Module } from '@nestjs/common';

import { OdooService } from './application/services/odoo.service';

@Module({
  providers: [OdooService],
  exports: [OdooService],
})
export class OdooModule {}
