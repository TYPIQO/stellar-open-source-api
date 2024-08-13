import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IAutomationRepository } from '../../application/repository/automation.repository.interface';
import { Automation } from '../../domain/automation.domain';
import { AutomationSchema } from './automation.schema';

@Injectable()
export class AutomationTypeormRepository implements IAutomationRepository {
  constructor(
    @InjectRepository(AutomationSchema)
    private readonly repository: Repository<Automation>,
  ) {}

  async create(automation: Automation): Promise<Automation> {
    return await this.repository.save(automation);
  }

  async getAll(): Promise<Automation[]> {
    return await this.repository.find();
  }
}
