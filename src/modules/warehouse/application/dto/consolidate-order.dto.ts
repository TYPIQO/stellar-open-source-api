import { Equals } from 'class-validator';

import { STATE } from '@/common/infrastructure/odoo/odoo.constants';

import { StockPickingDto } from './stock-picking.dto';

export class ConsolidateOrderDto extends StockPickingDto {
  @Equals(STATE.ASSIGNED)
  state: string;
}
