import { Inject, Injectable } from '@nestjs/common';

import { OdooService } from '@/modules/odoo/application/services/odoo.service';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import { Automation } from '../../domain/automation.domain';
import {
  AUTOMATION_REPOSITORY,
  IAutomationRepository,
} from '../repository/automation.repository.interface';
import { AUTOMATIONS } from './automation.contants';

@Injectable()
export class AutomationService {
  constructor(
    @Inject(AUTOMATION_REPOSITORY)
    private readonly automationRepository: IAutomationRepository,
    private readonly odooService: OdooService,
  ) {}

  async createAutomation(
    transactionType: TRANSACTION_TYPE,
  ): Promise<Automation> {
    const automationId = await this.odooService.createAutomation(
      AUTOMATIONS[transactionType],
    );
    return await this.automationRepository.create({
      automationId,
      transactionType,
    });
  }

  async createAllAutomations(): Promise<Automation[]> {
    const automations: Automation[] = [];
    const transactionTypes = Object.values(TRANSACTION_TYPE);

    for (const transactionType of transactionTypes) {
      const automation = await this.createAutomation(transactionType);
      automations.push(automation);
    }

    return automations;
  }
}
