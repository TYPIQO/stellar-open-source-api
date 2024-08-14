import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

import { MODEL } from '../services/odoo.models';
import { STATE } from '../services/odoo.state';

export class CreateAutomationDto {
  @IsString()
  @IsNotEmpty()
  serverActionName: string;

  @IsString()
  @IsNotEmpty()
  automationName: string;

  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @IsEnum(STATE)
  @IsNotEmpty()
  state: STATE;

  @IsEnum(MODEL)
  @IsNotEmpty()
  model: MODEL;

  @IsString({ each: true })
  @IsNotEmpty()
  fieldNames: string[];
}
