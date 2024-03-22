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

export const ACTIONS: {
  [keyof in TRANSACTION_TYPE]: {
    serverAction: string;
    automation: string;
    endpoint: string;
    state: string;
  };
} = {
  create: {
    serverAction: 'CREATE ORDER ACTION',
    automation: 'CREATE ORDER AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/stellar/create`,
    state: 'draft',
  },
  confirm: {
    serverAction: 'CONFIRM ORDER ACTION',
    automation: 'CONFIRM ORDER AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/stellar/confirm`,
    state: 'sale',
  },
  consolidate: {
    serverAction: 'CONSOLIDATE ORDER ACTION',
    automation: 'CONSOLIDATE ORDER AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/stellar/consolidate`,
    state: 'assigned',
  },
  deliver: {
    serverAction: 'DELIVER ORDER ACTION',
    automation: 'DELIVER ORDER AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/stellar/deliver`,
    state: 'done',
  },
};
