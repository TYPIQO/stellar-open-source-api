import { EntitySchema } from 'typeorm';

import { baseColumnSchemas } from '@/common/infrastructure/persistence/base.schema';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import { Automation } from '../../domain/automation.domain';

export const AutomationSchema = new EntitySchema<Automation>({
  name: 'Automation',
  target: Automation,
  columns: {
    ...baseColumnSchemas,
    automationId: {
      type: Number,
    },
    transactionType: {
      type: process.env.NODE_ENV === 'automated_tests' ? String : 'enum',
      enum: TRANSACTION_TYPE,
    },
  },
});
