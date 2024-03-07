import { Injectable, OnModuleInit } from '@nestjs/common';
import * as Odoo from 'odoo-await';

import { ERROR_CODES, OdooError } from '../exceptions/odoo.error';
import { MODEL } from './odoo.models';

@Injectable()
export class OdooService implements OnModuleInit {
  private odoo: Odoo;

  async onModuleInit() {
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      this.odoo = new Odoo({
        baseUrl: process.env.ODOO_URL,
        db: process.env.ODOO_DATABASE,
        username: process.env.ODOO_USERNAME,
        password: process.env.ODOO_PASSWORD,
      });

      await this.odoo.connect();
    } catch (error) {
      console.log(error);
      throw new OdooError(ERROR_CODES.CONNECT_ERROR);
    }
  }

  async getAllProductIds(): Promise<number[]> {
    return await this.odoo.search(MODEL.PRODUCT, []);
  }
}
