import { IsInt } from 'class-validator';

export class SaleOrderDto {
  @IsInt()
  id: number;

  @IsInt({ each: true })
  order_line: number[];
}
