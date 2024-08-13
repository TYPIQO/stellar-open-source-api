import { Inject, Injectable } from '@nestjs/common';

import { CreateAutomationDto } from '@/modules/odoo/application/dto/create-automation.dto';
import { MODEL } from '@/modules/odoo/application/services/odoo.models';
import { OdooService } from '@/modules/odoo/application/services/odoo.service';
import { STATE } from '@/modules/odoo/application/services/odoo.state';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import { Automation } from '../../domain/automation.domain';
import {
  AUTOMATION_REPOSITORY,
  IAutomationRepository,
} from '../repository/automation.repository.interface';

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
    const dto = new CreateAutomationDto();

    switch (transactionType) {
      case TRANSACTION_TYPE.CREATE:
        dto.serverActionName = 'CREATE-ORDER-ACTION';
        dto.automationName = 'CREATE-ORDER-AUTOMATION';
        dto.endpoint = `${process.env.SERVER_URL}/api/odoo/create`;
        dto.state = STATE.DRAFT;
        dto.model = MODEL.SALE_ORDER;
        dto.fieldNames = ['id', 'order_line', 'state'];
        break;
      case TRANSACTION_TYPE.CONFIRM:
        dto.serverActionName = 'CONFIRM-ORDER-ACTION';
        dto.automationName = 'CONFIRM-ORDER-AUTOMATION';
        dto.endpoint = `${process.env.SERVER_URL}/api/odoo/confirm`;
        dto.state = STATE.SALE;
        dto.model = MODEL.SALE_ORDER;
        dto.fieldNames = ['id', 'order_line', 'state'];
        break;
      case TRANSACTION_TYPE.CONSOLIDATE:
        dto.serverActionName = 'CONSOLIDATE-ORDER-ACTION';
        dto.automationName = 'CONSOLIDATE-ORDER-AUTOMATION';
        dto.endpoint = `${process.env.SERVER_URL}/api/odoo/consolidate`;
        dto.state = STATE.ASSIGNED;
        dto.model = MODEL.STOCK_PICKING;
        dto.fieldNames = ['id', 'sale_id', 'state'];
        break;
      case TRANSACTION_TYPE.DELIVER:
        dto.serverActionName = 'DELIVER-ORDER-ACTION';
        dto.automationName = 'DELIVER-ORDER-AUTOMATION';
        dto.endpoint = `${process.env.SERVER_URL}/api/odoo/deliver`;
        dto.state = STATE.DONE;
        dto.model = MODEL.STOCK_PICKING;
        dto.fieldNames = ['id', 'sale_id', 'state'];
        break;
      case TRANSACTION_TYPE.CANCEL:
        dto.serverActionName = 'CANCEL-ORDER-ACTION';
        dto.automationName = 'CANCEL-ORDER-AUTOMATION';
        dto.endpoint = `${process.env.SERVER_URL}/api/warehouse/order`;
        dto.state = STATE.CANCEL;
        dto.model = MODEL.SALE_ORDER;
        dto.fieldNames = ['id', 'state'];
        break;
    }

    const automationId = await this.odooService.createAutomation(dto);
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
