import { IsEnum } from 'class-validator';

import { STATE } from '@/common/infrastructure/odoo/odoo.constants';

export class ProcessOrderDto {
  @IsEnum(STATE)
  state: string;
}
