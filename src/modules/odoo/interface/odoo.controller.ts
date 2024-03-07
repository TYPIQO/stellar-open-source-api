import { Controller, Get } from '@nestjs/common';

import { OdooService } from '../application/services/odoo.service';

@Controller('odoo')
export class OdooController {
  constructor(private readonly odooService: OdooService) {}

  @Get('products')
  async getAllProducts(): Promise<number[]> {
    return await this.odooService.getAllProductIds();
  }
}
