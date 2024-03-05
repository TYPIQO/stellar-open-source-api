import { IsNumber } from 'class-validator';

export class OrderLineDto {
  @IsNumber()
  productId: number;

  @IsNumber()
  quantity: number;
}
