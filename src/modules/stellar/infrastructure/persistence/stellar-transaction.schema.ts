import { EntitySchema } from 'typeorm';

import { baseColumnSchemas } from '@/common/infrastructure/persistence/base.schema';

import {
  StellarTransaction,
  TRANSACTION_TYPE,
} from '../../domain/stellar-transaction.domain';

export const StellarTransactionSchema = new EntitySchema<StellarTransaction>({
  name: 'StellarTransaction',
  target: StellarTransaction,
  columns: {
    ...baseColumnSchemas,
    orderId: {
      type: Number,
    },
    type: {
      type: process.env.NODE_ENV === 'automated_tests' ? String : 'enum',
      enum: TRANSACTION_TYPE,
    },
    hash: {
      type: String,
    },
    timestamp: {
      type: String,
    },
  },
});
