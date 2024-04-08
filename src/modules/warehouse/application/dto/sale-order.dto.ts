import { IsInt } from 'class-validator';

import { ProcessOrderDto } from './process-order.dto';

export class SaleOrderDto extends ProcessOrderDto {
  @IsInt()
  id: number;

  @IsInt({ each: true })
  order_line: number[];
}
