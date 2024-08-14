import { Controller, Post } from '@nestjs/common';

import { AutomationService } from '../application/services/automation.service';
import { Automation } from '../domain/automation.domain';

@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Post('batch')
  async createAllAutomations(): Promise<Automation[]> {
    return await this.automationService.createAllAutomations();
  }
}
