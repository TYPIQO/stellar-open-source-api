import { Equals } from 'class-validator';

import { SaleOrderDto } from './sale-order.dto';

export class CreateOrderDto extends SaleOrderDto {
  @Equals('draft')
  state: string;
}
