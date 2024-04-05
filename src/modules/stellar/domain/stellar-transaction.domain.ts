import { Base } from '@/common/domain/base.domain';

export enum TRANSACTION_TYPE {
  CREATE = 'create',
  CONFIRM = 'confirm',
  CONSOLIDATE = 'consolidate',
  DELIVER = 'deliver',
}

export class StellarTransaction extends Base {
  orderId: number;
  type: TRANSACTION_TYPE;
  hash: string;
  timestamp: string;
}
