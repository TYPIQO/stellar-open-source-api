import { CreateAutomationDto } from '@/modules/odoo/application/dto/create-automation.dto';
import { MODEL } from '@/modules/odoo/application/services/odoo.models';
import { STATE } from '@/modules/odoo/application/services/odoo.state';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

export const AUTOMATIONS: Record<TRANSACTION_TYPE, CreateAutomationDto> = {
  [TRANSACTION_TYPE.CREATE]: {
    serverActionName: 'CREATE-ORDER-ACTION',
    automationName: 'CREATE-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/odoo/create`,
    state: STATE.DRAFT,
    model: MODEL.SALE_ORDER,
    fieldNames: ['id', 'order_line', 'state'],
  },
  [TRANSACTION_TYPE.CONFIRM]: {
    serverActionName: 'CONFIRM-ORDER-ACTION',
    automationName: 'CONFIRM-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/odoo/confirm`,
    state: STATE.SALE,
    model: MODEL.SALE_ORDER,
    fieldNames: ['id', 'order_line', 'state'],
  },
  [TRANSACTION_TYPE.CONSOLIDATE]: {
    serverActionName: 'CONSOLIDATE-ORDER-ACTION',
    automationName: 'CONSOLIDATE-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/odoo/consolidate`,
    state: STATE.ASSIGNED,
    model: MODEL.STOCK_PICKING,
    fieldNames: ['id', 'sale_id', 'state'],
  },
  [TRANSACTION_TYPE.DELIVER]: {
    serverActionName: 'DELIVER-ORDER-ACTION',
    automationName: 'DELIVER-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/odoo/deliver`,
    state: STATE.DONE,
    model: MODEL.STOCK_PICKING,
    fieldNames: ['id', 'sale_id', 'state'],
  },
  [TRANSACTION_TYPE.CANCEL]: {
    serverActionName: 'CANCEL-ORDER-ACTION',
    automationName: 'CANCEL-ORDER-AUTOMATION',
    endpoint: `${process.env.SERVER_URL}/api/odoo/order`,
    state: STATE.CANCEL,
    model: MODEL.SALE_ORDER,
    fieldNames: ['id', 'state'],
  },
};
