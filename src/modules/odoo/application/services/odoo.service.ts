import { Injectable, OnModuleInit } from '@nestjs/common';
import * as Odoo from 'odoo-await';

import { OrderLine } from '../../domain/order-line.domain';
import { ERROR_CODES, OdooError } from '../exceptions/odoo.error';
import { IOrderLineResponse } from '../responses/order-line.response.interface';
import { ISaleOrderResponse } from '../responses/sale-order.response.interface';
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

  async getOrderLinesForOrder(id: number): Promise<number[]> {
    const order = await this.odoo.searchRead<ISaleOrderResponse>(
      MODEL.SALE_ORDER,
      [['id', '=', id]],
      [],
    );

    return order[0].order_line;
  }

  async getProductsForOrderLines(ids: number[]): Promise<OrderLine[]> {
    const rawOrderLines = await this.odoo.searchRead<IOrderLineResponse>(
      MODEL.ORDER_LINE,
      [['id', 'in', ids]],
      [],
    );

    return rawOrderLines.map((orderLine) => ({
      productId: orderLine.product_id[0],
      quantity: orderLine.product_uom_qty,
    }));
  }
}
