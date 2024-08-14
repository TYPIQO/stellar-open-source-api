import { Equals, IsInt } from 'class-validator';

import { STATE } from '../services/odoo.state';

export class CancelOrderDto {
  @IsInt()
  id: number;

  @Equals(STATE.CANCEL)
  state: string;
}
