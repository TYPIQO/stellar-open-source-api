import { Equals } from 'class-validator';

import { STATE } from '@/modules/odoo/application/services/odoo.state';

import { StockPickingDto } from './stock-picking.dto';

export class ConsolidateOrderDto extends StockPickingDto {
  @Equals(STATE.ASSIGNED)
  state: string;
}
