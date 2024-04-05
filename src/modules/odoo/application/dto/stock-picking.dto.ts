import { IsInt } from 'class-validator';

export class StockPickingDto {
  @IsInt()
  sale_id: number;
}
