import { Base } from '@/common/domain/base.domain';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

export class OdooAction extends Base {
  type: TRANSACTION_TYPE;
  serverActionName: string;
  serverActionId: number;
  automationName: string;
  automationId: number;
}
