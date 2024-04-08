import { EntitySchema } from 'typeorm';

import { baseColumnSchemas } from '@/common/infrastructure/persistence/base.schema';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import { OdooAction } from '../../domain/odoo-action.domain';

export const OdooActionSchema = new EntitySchema<OdooAction>({
  name: 'OdooAction',
  target: OdooAction,
  columns: {
    ...baseColumnSchemas,
    type: {
      type: process.env.NODE_ENV === 'automated_tests' ? String : 'enum',
      enum: TRANSACTION_TYPE,
      unique: true,
    },
    serverActionName: {
      type: String,
    },
    serverActionId: {
      type: Number,
    },
    automationName: {
      type: String,
    },
    automationId: {
      type: Number,
    },
  },
});
