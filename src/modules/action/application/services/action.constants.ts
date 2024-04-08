import { IOdooAction } from '@/common/application/repository/odoo.repository.interface';
import {
  MODEL,
  SALE_ORDER_FIELDS,
  STATE,
  STOCK_PICKING_FIELDS,
} from '@/common/infrastructure/odoo/odoo.constants';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

export const ACTIONS: {
  [keyof in TRANSACTION_TYPE]: IOdooAction;
} = {
  cancel: {
    serverActionName: 'CANCEL-ORDER-ACTION',
    automationName: 'CANCEL-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/warehouse/order`,
    state: STATE.CANCEL,
    modelName: MODEL.SALE_ORDER,
    fieldNames: SALE_ORDER_FIELDS,
  },
  create: {
    serverActionName: 'CREATE-ORDER-ACTION',
    automationName: 'CREATE-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/warehouse/order`,
    state: STATE.DRAFT,
    modelName: MODEL.SALE_ORDER,
    fieldNames: SALE_ORDER_FIELDS,
  },
  confirm: {
    serverActionName: 'CONFIRM-ORDER-ACTION',
    automationName: 'CONFIRM-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/warehouse/order`,
    state: STATE.SALE,
    modelName: MODEL.SALE_ORDER,
    fieldNames: SALE_ORDER_FIELDS,
  },
  consolidate: {
    serverActionName: 'CONSOLIDATE-ORDER-ACTION',
    automationName: 'CONSOLIDATE-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/warehouse/order`,
    state: STATE.ASSIGNED,
    modelName: MODEL.STOCK_PICKING,
    fieldNames: STOCK_PICKING_FIELDS,
  },
  deliver: {
    serverActionName: 'DELIVER-ORDER-ACTION',
    automationName: 'DELIVER-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/warehouse/order`,
    state: STATE.DONE,
    modelName: MODEL.STOCK_PICKING,
    fieldNames: STOCK_PICKING_FIELDS,
  },
};
