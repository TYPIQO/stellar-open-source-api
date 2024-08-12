import { Equals } from 'class-validator';

import { STATE } from '../services/odoo.state';
import { SaleOrderDto } from './sale-order.dto';

export class CancelOrderDto extends SaleOrderDto {
  @Equals(STATE.CANCEL)
  state: string;
}
