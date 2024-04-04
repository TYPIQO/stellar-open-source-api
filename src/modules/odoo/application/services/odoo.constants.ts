import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

export enum MODEL {
  MODEL = 'ir.model',
  FIELD = 'ir.model.fields',
  AUTOMATION = 'base.automation',
  SERVER_ACTION = 'ir.actions.server',
  SALE_ORDER = 'sale.order',
  ORDER_LINE = 'sale.order.line',
  STOCK_PICKING = 'stock.picking',
}

export enum STATE {
  DRAFT = 'draft',
  SALE = 'sale',
  ASSIGNED = 'assigned',
  DONE = 'done',
}

const FIELDS = {
  [MODEL.SALE_ORDER]: {
    model: MODEL.SALE_ORDER,
    fields: ['id', 'order_line', 'state'],
  },
  [MODEL.STOCK_PICKING]: {
    model: MODEL.STOCK_PICKING,
    fields: ['id', 'sale_id', 'partner_id', 'state'],
  },
};

export const ACTIONS: {
  [keyof in TRANSACTION_TYPE]: {
    serverAction: string;
    automation: string;
    endpoint: string;
    state: STATE;
    fields: { model: MODEL; fields: string[] };
  };
} = {
  create: {
    serverAction: 'CREATE-ORDER-ACTION',
    automation: 'CREATE-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/odoo/create`,
    state: STATE.DRAFT,
    fields: FIELDS[MODEL.SALE_ORDER],
  },
  confirm: {
    serverAction: 'CONFIRM-ORDER-ACTION',
    automation: 'CONFIRM-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/odoo/confirm`,
    state: STATE.SALE,
    fields: FIELDS[MODEL.SALE_ORDER],
  },
  consolidate: {
    serverAction: 'CONSOLIDATE-ORDER-ACTION',
    automation: 'CONSOLIDATE-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/odoo/consolidate`,
    state: STATE.ASSIGNED,
    fields: FIELDS[MODEL.STOCK_PICKING],
  },
  deliver: {
    serverAction: 'DELIVER-ORDER-ACTION',
    automation: 'DELIVER-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/odoo/deliver`,
    state: STATE.DONE,
    fields: FIELDS[MODEL.STOCK_PICKING],
  },
};
