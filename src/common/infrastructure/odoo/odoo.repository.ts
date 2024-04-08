import { Injectable, OnModuleInit } from '@nestjs/common';
import * as Odoo from 'odoo-await';

import {
  ERROR_CODES,
  OdooError,
} from '@/common/application/exceptions/odoo.error';
import {
  IOdooAction,
  IOdooActionIds,
  IOdooOrderLine,
  IOdooRepository,
} from '@/common/application/repository/odoo.repository.interface';

import { IAutomation } from './interfaces/automation.interface';
import { IField } from './interfaces/field.interface';
import { IModel } from './interfaces/model.interface';
import { IOrderLine } from './interfaces/order-line.interface';
import { ISaleOrder } from './interfaces/sale-order.interface';
import { IServerAction } from './interfaces/server-action.interface';
import { MODEL } from './odoo.constants';

@Injectable()
export class OdooRepository implements IOdooRepository, OnModuleInit {
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

  private mergeSelections(
    selections: string,
    selectionIds: number[],
  ): {
    id: number;
    name: string;
  }[] {
    const str = selections.replace(/'/g, '');
    const regex = /\(([^)]+)\)/g;
    const matches = [...str.matchAll(regex)];
    const selectionNames = matches.map((match) =>
      match[1].split(',')[0].trim(),
    );

    return selectionNames.map((name, index) => ({
      name,
      id: selectionIds[index],
    }));
  }

  private async getModelAndFields(
    modelName: MODEL,
    fieldNames: string[],
  ): Promise<{ model: IModel; fields: IField[] }> {
    const model = await this.odoo.searchRead<IModel>(
      MODEL.MODEL,
      ['model', '=', modelName],
      [],
    );
    const fields = await this.odoo.searchRead<IField>(
      MODEL.FIELD,
      ['&', ['name', 'in', fieldNames], ['model_id', '=', model[0].id]],
      [],
    );
    return { model: model[0], fields: fields };
  }

  async getOrderLinesForOrder(id: number): Promise<number[]> {
    const order = await this.odoo.searchRead<ISaleOrder>(
      MODEL.SALE_ORDER,
      [['id', '=', id]],
      [],
    );

    return order[0].order_line;
  }

  async getProductsForOrderLines(ids: number[]): Promise<IOdooOrderLine[]> {
    const rawOrderLines = await this.odoo.searchRead<IOrderLine>(
      MODEL.ORDER_LINE,
      [['id', 'in', ids]],
      [],
    );

    return rawOrderLines.map((orderLine) => ({
      productId: orderLine.product_id[0],
      quantity: orderLine.product_uom_qty,
    }));
  }

  async createOdooAction(action: IOdooAction): Promise<IOdooActionIds> {
    const {
      serverActionName,
      automationName,
      endpoint,
      state,
      modelName,
      fieldNames,
    } = action;

    const { model, fields } = await this.getModelAndFields(
      modelName,
      fieldNames,
    );

    const fieldIds = fields.map((field) => field.id);
    const stateField = fields.find((field) => field.name === 'state');
    const stateSelections = this.mergeSelections(
      stateField.selection as string,
      stateField.selection_ids,
    );
    const selectionId = stateSelections.find(
      (selection) => selection.name === state,
    ).id;

    const serverAction: IServerAction = {
      name: serverActionName,
      model_id: model.id,
      binding_type: 'action',
      state: 'webhook',
      type: MODEL.SERVER_ACTION,
      webhook_url: endpoint,
      webhook_field_ids: fieldIds,
    };

    const serverActionId = await this.odoo.create(
      MODEL.SERVER_ACTION,
      serverAction,
    );

    const automation: IAutomation = {
      name: automationName,
      model_id: model.id,
      active: true,
      trigger: 'on_state_set',
      action_server_ids: [serverActionId],
      trigger_field_ids: [stateField.id],
      trg_selection_field_id: selectionId,
    };

    const automationId = await this.odoo.create(MODEL.AUTOMATION, automation);

    return {
      serverActionId,
      automationId,
    };
  }
}
