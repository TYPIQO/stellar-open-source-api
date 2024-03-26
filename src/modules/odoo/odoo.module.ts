import { Module, forwardRef } from '@nestjs/common';

import { StellarModule } from '../stellar/stellar.module';
import { OdooService } from './application/services/odoo.service';
import { OdooController } from './interface/odoo.controller';

@Module({
  imports: [forwardRef(() => StellarModule)],
  providers: [OdooService],
  exports: [OdooService],
  controllers: [OdooController],
})
export class OdooModule {}
