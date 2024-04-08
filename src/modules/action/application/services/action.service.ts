import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import {
  IOdooRepository,
  ODOO_REPOSITORY,
} from '@/common/application/repository/odoo.repository.interface';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import {
  IOdooActionRepository,
  ODOO_ACTION_REPOSITORY,
} from '../repository/odoo-action.repository.interface';
import { ACTIONS } from './action.constants';

@Injectable()
export class ActionService implements OnModuleInit {
  constructor(
    @Inject(ODOO_ACTION_REPOSITORY)
    private readonly odooActionRepository: IOdooActionRepository,
    @Inject(ODOO_REPOSITORY)
    private readonly odooRepository: IOdooRepository,
  ) {}

  async onModuleInit() {
    await this.createCoreServerActions();
  }

  async createCoreServerActions(): Promise<void> {
    const actions = await this.odooActionRepository.getAll();
    const allActionTypes = Object.values(TRANSACTION_TYPE);
    const missingActionTypes = allActionTypes.filter(
      (action) => !actions.find((a) => a.type === action),
    );

    for (const type of missingActionTypes) {
      const action = ACTIONS[type];
      const newAction = await this.odooRepository.createOdooAction(action);

      await this.odooActionRepository.create({
        type,
        automationId: newAction.automationId,
        automationName: action.automationName,
        serverActionId: newAction.serverActionId,
        serverActionName: action.serverActionName,
      });
    }
  }
}
