import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IOdooActionRepository } from '../../application/repository/odoo-action.repository.interface';
import { OdooAction } from '../../domain/odoo-action.domain';
import { OdooActionSchema } from './odoo-action.schema';

@Injectable()
export class OdooActionTypeormRepository implements IOdooActionRepository {
  constructor(
    @InjectRepository(OdooActionSchema)
    private readonly repository: Repository<OdooAction>,
  ) {}

  async create(action: OdooAction): Promise<OdooAction> {
    return await this.repository.save(action);
  }

  async getAll(): Promise<OdooAction[]> {
    return await this.repository.find();
  }
}
