import { IsInt } from 'class-validator';

import { ProcessOrderDto } from './process-order.dto';

export class StockPickingDto extends ProcessOrderDto {
  @IsInt()
  sale_id: number;
}
