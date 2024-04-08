import { Module } from '@nestjs/common';

import { StellarModule } from '../stellar/stellar.module';
import { WarehouseController } from './interface/warehouse.controller';

@Module({
  imports: [StellarModule],
  controllers: [WarehouseController],
})
export class WarehouseModule {}
