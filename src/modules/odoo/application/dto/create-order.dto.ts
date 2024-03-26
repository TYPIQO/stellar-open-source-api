import { Equals } from 'class-validator';

import { STATE } from '@/modules/odoo/application/services/odoo.constants';

import { SaleOrderDto } from './sale-order.dto';

export class CreateOrderDto extends SaleOrderDto {
  @Equals(STATE.DRAFT)
  state: string;
}
