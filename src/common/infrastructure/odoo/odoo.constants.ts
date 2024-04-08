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
  CANCEL = 'cancel',
}

export const SALE_ORDER_FIELDS = ['id', 'order_line', 'state'];
export const STOCK_PICKING_FIELDS = ['id', 'sale_id', 'partner_id', 'state'];
