import { Equals } from 'class-validator';

import { STATE } from '@/modules/odoo/application/services/odoo.state';

import { SaleOrderDto } from './sale-order.dto';

export class ConfirmOrderDto extends SaleOrderDto {
  @Equals(STATE.SALE)
  state: string;
}
