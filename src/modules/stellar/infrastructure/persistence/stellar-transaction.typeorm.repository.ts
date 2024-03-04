import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IStellarTransactionRepository } from '../../application/repository/stellar-transaction.repository.interface';
import { StellarTransaction } from '../../domain/stellar-transaction.domain';
import { StellarTransactionSchema } from './stellar-transaction.schema';

@Injectable()
export class StellarTransactionTypeormRepository
  implements IStellarTransactionRepository
{
  constructor(
    @InjectRepository(StellarTransactionSchema)
    private readonly repository: Repository<StellarTransaction>,
  ) {}

  async create(
    stellarTransaction: StellarTransaction,
  ): Promise<StellarTransaction> {
    return await this.repository.save(stellarTransaction);
  }

  async getTransactionsForOrder(
    orderId: number,
  ): Promise<StellarTransaction[]> {
    return await this.repository.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });
  }
}
