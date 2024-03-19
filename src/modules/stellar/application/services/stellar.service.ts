import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Queue from 'queue';

import {
  ERROR_CODES,
  StellarError,
} from '@/common/application/exceptions/stellar.error';
import {
  IAssetAmount,
  IStellarRepository,
  ISubmittedTransaction,
  STELLAR_REPOSITORY,
} from '@/common/application/repository/stellar.repository.interface';

import {
  StellarTransaction,
  TRANSACTION_TYPE,
} from '../../domain/stellar-transaction.domain';
import { OrderLineDto } from '../dto/order-line.dto';
import {
  IStellarTransactionRepository,
  STELLAR_TRANSACTION_REPOSITORY,
} from '../repository/stellar-transaction.repository.interface';

@Injectable()
export class StellarService implements OnModuleInit {
  private queue: Queue;

  constructor(
    @Inject(STELLAR_REPOSITORY)
    private readonly stellarRepository: IStellarRepository,
    @Inject(STELLAR_TRANSACTION_REPOSITORY)
    private readonly stellarTransactionRepository: IStellarTransactionRepository,
  ) {
    this.queue = new Queue({
      autostart: true,
      concurrency: 1,
    });
  }

  async onModuleInit() {
    await this.stellarRepository.configureIssuerAccount();
  }

  private createAssetCode(productId: number): string {
    const PREFIX = 'ODOO';
    const FILL_CHAR = '0';
    const MAX_ASSET_CODE_LENGTH = 12;

    const productCode = String(productId).padStart(
      MAX_ASSET_CODE_LENGTH - PREFIX.length,
      FILL_CHAR,
    );

    return PREFIX + productCode;
  }

  private transformOrderLinesToAssetAmounts(
    orderLines: OrderLineDto[],
  ): IAssetAmount[] {
    const amounts: IAssetAmount[] = [];

    for (const orderLine of orderLines) {
      amounts.push({
        assetCode: this.createAssetCode(orderLine.productId),
        quantity: String(orderLine.quantity),
      });
    }

    return amounts;
  }

  private validateTransaction(
    type: TRANSACTION_TYPE,
    transactions: StellarTransaction[],
  ): void {
    const validationMap = {
      [TRANSACTION_TYPE.CREATE]: {
        length: 0,
        error: ERROR_CODES.ORDER_UNABLE_TO_CREATE_ERROR,
        prevType: undefined,
      },
      [TRANSACTION_TYPE.CONFIRM]: {
        length: 1,
        error: ERROR_CODES.ORDER_UNABLE_TO_CONFIRM_ERROR,
        prevType: TRANSACTION_TYPE.CREATE,
      },
      [TRANSACTION_TYPE.CONSOLIDATE]: {
        length: 2,
        error: ERROR_CODES.ORDER_UNABLE_TO_CONSOLIDATE_ERROR,
        prevType: TRANSACTION_TYPE.CONFIRM,
      },
      [TRANSACTION_TYPE.DELIVER]: {
        length: 3,
        error: ERROR_CODES.ORDER_UNABLE_TO_DELIVER_ERROR,
        prevType: TRANSACTION_TYPE.CONSOLIDATE,
      },
    };

    const expectedLength = validationMap[type].length;
    const expectedPrevType = validationMap[type].prevType;
    const actualLength = transactions.length;
    const actualPrevType = transactions.pop()?.type;

    if (
      actualLength !== expectedLength ||
      (expectedPrevType && actualPrevType !== expectedPrevType)
    ) {
      throw new StellarError(validationMap[type].error);
    }
  }

  async executeTransaction(
    orderId: number,
    orderLines: OrderLineDto[],
    type: TRANSACTION_TYPE,
  ): Promise<string> {
    const transactions =
      await this.stellarTransactionRepository.getTransactionsForOrder(orderId);

    const hasFailedMovements = transactions.some(
      (transaction) => transaction.hash === '',
    );

    if (hasFailedMovements) {
      return;
    }

    try {
      this.validateTransaction(type, transactions);

      const amounts = this.transformOrderLinesToAssetAmounts(orderLines);

      let transaction: ISubmittedTransaction;
      switch (type) {
        case TRANSACTION_TYPE.CREATE:
          transaction = await this.stellarRepository.createOrder(amounts);
          break;
        case TRANSACTION_TYPE.CONFIRM:
          transaction = await this.stellarRepository.confirmOrder(amounts);
          break;
        case TRANSACTION_TYPE.CONSOLIDATE:
          transaction = await this.stellarRepository.consolidateOrder(amounts);
          break;
        case TRANSACTION_TYPE.DELIVER:
          transaction = await this.stellarRepository.deliverOrder(amounts);
          break;
      }

      await this.stellarTransactionRepository.create({
        orderId,
        type,
        hash: transaction.hash,
        timestamp: transaction.created_at,
      });

      return transaction.hash;
    } catch (error) {
      console.log(error);
      await this.stellarTransactionRepository.create({
        orderId,
        type,
        hash: '',
        timestamp: new Date().toISOString(),
      });
    }
  }

  pushTransaction(
    orderId: number,
    orderLines: OrderLineDto[],
    type: TRANSACTION_TYPE,
  ): void {
    this.queue.push(() => this.executeTransaction(orderId, orderLines, type));
  }
}
