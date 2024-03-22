import { Equals } from 'class-validator';

import { SaleOrderDto } from './sale-order.dto';

export class ConfirmOrderDto extends SaleOrderDto {
  @Equals('sale')
  state: string;
}
