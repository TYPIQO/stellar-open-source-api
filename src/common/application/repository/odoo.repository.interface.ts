import { MODEL, STATE } from '@/common/infrastructure/odoo/odoo.constants';

export const ODOO_REPOSITORY = 'ODOO_REPOSITORY';

export interface IOdooAction {
  serverActionName: string;
  automationName: string;
  endpoint: string;
  state: STATE;
  modelName: MODEL;
  fieldNames: string[];
}

export interface IOdooActionIds {
  serverActionId: number;
  automationId: number;
}

export interface IOdooOrderLine {
  productId: number;
  quantity: number;
}

export interface IOdooRepository {
  createOdooAction(action: IOdooAction): Promise<IOdooActionIds>;
  getProductsForOrderLines(ids: number[]): Promise<IOdooOrderLine[]>;
  getOrderLinesForOrder(id: number): Promise<number[]>;
}
