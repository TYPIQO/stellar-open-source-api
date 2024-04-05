import { Equals } from 'class-validator';

import { STATE } from '@/modules/odoo/application/services/odoo.state';

import { StockPickingDto } from './stock-picking.dto';

export class DeliverOrderDto extends StockPickingDto {
  @Equals(STATE.DONE)
  state: string;
}
