import { Equals } from 'class-validator';

import { StockPickingDto } from './stock-picking.dto';

export class ConsolidateOrderDto extends StockPickingDto {
  @Equals('assigned')
  state: string;
}
