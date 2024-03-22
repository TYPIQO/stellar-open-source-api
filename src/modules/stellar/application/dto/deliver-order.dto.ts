import { Equals } from 'class-validator';

import { StockPickingDto } from './stock-picking.dto';

export class DeliverOrderDto extends StockPickingDto {
  @Equals('done')
  state: string;
}
