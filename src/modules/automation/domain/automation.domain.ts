import { Base } from '@/common/domain/base.domain';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

export class Automation extends Base {
  automationId: number;
  transactionType: TRANSACTION_TYPE;
}
