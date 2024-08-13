import { Injectable, OnModuleInit } from '@nestjs/common';
import * as Odoo from 'odoo-await';

import { OrderLine } from '../../domain/order-line.domain';
import { CreateAutomationDto } from '../dto/create-automation.dto';
import { ERROR_CODES, OdooError } from '../exceptions/odoo.error';
import { IFieldResponse } from '../responses/field.response.interface';
import { IModelResponse } from '../responses/model.response.interface';
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
    } catch {
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

  private getStateSelectionId(
    state: string,
    selections: string,
    selectionIds: number[],
  ): number {
    const str = selections.replace(/'/g, '');
    const regex = /\(([^)]+)\)/g;
    const matches = [...str.matchAll(regex)];
    const selectionNames = matches.map((match) =>
      match[1].split(',')[0].trim(),
    );

    const stateSelections = selectionNames.map((name, index) => ({
      id: selectionIds[index],
      name,
    }));

    const selectionId = stateSelections.find(
      (selection) => selection.name === state,
    ).id;

    return selectionId;
  }

  private async getModel(modelName: MODEL): Promise<IModelResponse> {
    const model = await this.odoo.searchRead<IModelResponse>(
      MODEL.MODEL,
      ['model', '=', modelName],
      [],
    );
    return model[0];
  }

  private async getFields(
    modelId: number,
    fieldNames: string[],
  ): Promise<IFieldResponse[]> {
    const fields = await this.odoo.searchRead<IFieldResponse>(
      MODEL.FIELD,
      ['&', ['name', 'in', fieldNames], ['model_id', '=', modelId]],
      [],
    );
    return fields;
  }

  async createAutomation({
    automationName,
    endpoint,
    state,
    model,
    fieldNames,
    serverActionName,
  }: CreateAutomationDto): Promise<number> {
    const modelResponse = await this.getModel(model);
    const fields = await this.getFields(modelResponse.id, fieldNames);

    const fieldIds = fields.map((field) => field.id);
    const stateField = fields.find((field) => field.name === 'state');
    const selectionId = this.getStateSelectionId(
      state,
      stateField.selection as string,
      stateField.selection_ids,
    );

    const serverActionId = await this.odoo.create(MODEL.SERVER_ACTION, {
      name: serverActionName,
      model_id: modelResponse.id,
      binding_type: 'action',
      state: 'webhook',
      type: MODEL.SERVER_ACTION,
      webhook_url: endpoint,
      webhook_field_ids: fieldIds,
    });

    const automationId = await this.odoo.create(MODEL.AUTOMATION, {
      name: automationName,
      model_id: modelResponse.id,
      active: true,
      trigger: 'on_state_set',
      action_server_ids: [serverActionId],
      trigger_field_ids: [stateField.id],
      trg_selection_field_id: selectionId,
    });

    return automationId;
  }
}
