import { Equals } from 'class-validator';

import { STATE } from '@/common/infrastructure/odoo/odoo.constants';

import { SaleOrderDto } from './sale-order.dto';

export class ConfirmOrderDto extends SaleOrderDto {
  @Equals(STATE.SALE)
  state: string;
}
