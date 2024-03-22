import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import * as Odoo from 'odoo-await';

import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import { OrderLine } from '../../domain/order-line.domain';
import { ERROR_CODES, OdooError } from '../exceptions/odoo.error';
import {
  IOdooActionRepository,
  ODOO_ACTION_REPOSITORY,
} from '../repository/odoo-action.repository.interface';
import { IOrderLineResponse } from '../responses/order-line.response.interface';
import { ISaleOrderResponse } from '../responses/sale-order.response.interface';
import { ACTIONS, MODEL } from './odoo.constants';
import { IAutomation, IField, IModel, IServerAction } from './odoo.interfaces';

@Injectable()
export class OdooService implements OnModuleInit {
  private odoo: Odoo;

  constructor(
    @Inject(ODOO_ACTION_REPOSITORY)
    private readonly odooActionRepository: IOdooActionRepository,
  ) {}

  async onModuleInit() {
    await this.connect();
    await this.createCoreServerActions();
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

  private buildServerAction({
    name,
    modelId,
    fieldIds,
    endpoint,
  }: {
    name: string;
    modelId: number;
    fieldIds: number[];
    endpoint: string;
  }): IServerAction {
    return {
      name,
      model_id: modelId,
      binding_type: 'action',
      state: 'webhook',
      type: MODEL.SERVER_ACTION,
      webhook_url: endpoint,
      webhook_field_ids: fieldIds,
    };
  }

  private buildAutomation({
    name,
    modelId,
    serverActionId,
    triggerFieldId,
    selectionFieldId,
  }: {
    name: string;
    modelId: number;
    serverActionId: number;
    triggerFieldId: number;
    selectionFieldId: number;
  }): IAutomation {
    return {
      name,
      model_id: modelId,
      active: true,
      trigger: 'on_state_set',
      action_server_ids: [serverActionId],
      trigger_field_ids: [triggerFieldId],
      trg_selection_field_id: selectionFieldId,
    };
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

  private async createOdooAction(
    type: TRANSACTION_TYPE,
    modelId: number,
    fieldIds: number[],
    stateFieldId: number,
    stateSelections: { name: string; id: number }[],
  ): Promise<void> {
    const selectionId = stateSelections.find(
      (selection) => selection.name === ACTIONS[type].state,
    ).id;

    const serverActionId = await this.odoo.create(
      MODEL.SERVER_ACTION,
      this.buildServerAction({
        name: ACTIONS[type].serverAction,
        modelId,
        fieldIds,
        endpoint: ACTIONS[type].endpoint,
      }),
    );

    const automationId = await this.odoo.create(
      MODEL.AUTOMATION,
      this.buildAutomation({
        name: ACTIONS[type].automation,
        modelId,
        serverActionId,
        triggerFieldId: stateFieldId,
        selectionFieldId: selectionId,
      }),
    );

    await this.odooActionRepository.create({
      type,
      serverActionName: ACTIONS[type].serverAction,
      serverActionId: serverActionId,
      automationName: ACTIONS[type].automation,
      automationId: automationId,
    });
  }

  private async createSaleOrderAutomations(): Promise<void> {
    const SALE_ORDER_TRANSACTIONS = [
      TRANSACTION_TYPE.CREATE,
      TRANSACTION_TYPE.CONFIRM,
    ];
    const SALE_ORDER_FIELDS = ['id', 'order_line', 'state'];

    const { model, fields } = await this.getModelAndFields(
      MODEL.SALE_ORDER,
      SALE_ORDER_FIELDS,
    );

    const fieldIds = fields.map((field) => field.id);

    const stateField = fields.find((field) => field.name === 'state');
    const stateSelections = this.mergeSelections(
      stateField.selection as string,
      stateField.selection_ids,
    );

    for (const transaction of SALE_ORDER_TRANSACTIONS) {
      await this.createOdooAction(
        transaction,
        model.id,
        fieldIds,
        stateField.id,
        stateSelections,
      );
    }
  }

  private async createStockPickingAutomations(): Promise<void> {
    const STOCK_PICKING_TRANSACTIONS = [
      TRANSACTION_TYPE.CONSOLIDATE,
      TRANSACTION_TYPE.DELIVER,
    ];
    const STOCK_PICKING_FIELDS = ['id', 'sale_id', 'partner_id', 'state'];

    const { model, fields } = await this.getModelAndFields(
      MODEL.STOCK_PICKING,
      STOCK_PICKING_FIELDS,
    );

    const fieldIds = fields.map((field) => field.id);

    const stateField = fields.find((field) => field.name === 'state');
    const stateSelections = this.mergeSelections(
      stateField.selection as string,
      stateField.selection_ids,
    );

    for (const transaction of STOCK_PICKING_TRANSACTIONS) {
      await this.createOdooAction(
        transaction,
        model.id,
        fieldIds,
        stateField.id,
        stateSelections,
      );
    }
  }

  async createCoreServerActions(): Promise<void> {
    const actions = await this.odooActionRepository.getAll();

    if (actions.length === 0) {
      await this.createSaleOrderAutomations();
      await this.createStockPickingAutomations();
    }
  }
}
