import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import {
  StellarTransaction,
  TRANSACTION_TYPE,
} from '../../domain/stellar-transaction.domain';
import { OrderLineDto } from '../dto/order-line.dto';
import { ERROR_CODES, StellarError } from '../exceptions/stellar.error';
import { ErrorMapper } from '../mapper/error.mapper';
import {
  IProductAssetRepository,
  PRODUCT_ASSET_REPOSITORY,
} from '../repository/product-asset.repository.interface';
import {
  IStellarTransactionRepository,
  STELLAR_TRANSACTION_REPOSITORY,
} from '../repository/stellar-transaction.repository.interface';
import {
  IAssetAmounts,
  IStellarRepository,
  ISubmittedTransaction,
  STELLAR_REPOSITORY,
} from '../repository/stellar.repository.interface';
import { StellarAssetService } from './stellar-asset.service';

@Injectable()
export class StellarService implements OnModuleInit {
  constructor(
    private readonly errorMapper: ErrorMapper,
    @Inject(PRODUCT_ASSET_REPOSITORY)
    private readonly productAssetRepository: IProductAssetRepository,
    @Inject(STELLAR_REPOSITORY)
    private readonly stellarRepository: IStellarRepository,
    @Inject(STELLAR_TRANSACTION_REPOSITORY)
    private readonly stellarTransactionRepository: IStellarTransactionRepository,
    private readonly stellarAssetService: StellarAssetService,
  ) {}

  async onModuleInit() {
    await this.stellarRepository.configureIssuerAccount();
    await this.stellarRepository.createCoreAccounts();
    await this.stellarAssetService.createAssetsForAllProducts();
  }

  private validateStellarTransaction(
    type: TRANSACTION_TYPE,
    transactions: StellarTransaction[],
  ): void {
    const validationMap = {
      [TRANSACTION_TYPE.CONFIRM]: {
        length: 0,
        error: ERROR_CODES.ORDER_ALREADY_CONFIRMED_ERROR,
        prevType: undefined,
      },
      [TRANSACTION_TYPE.CONSOLIDATE]: {
        length: 1,
        error: ERROR_CODES.ORDER_UNABLE_TO_CONSOLIDATE_ERROR,
        prevType: TRANSACTION_TYPE.CONFIRM,
      },
      [TRANSACTION_TYPE.DELIVER]: {
        length: 2,
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

  private async executeStellarTransaction(
    products: IAssetAmounts[],
    type: TRANSACTION_TYPE,
  ): Promise<ISubmittedTransaction> {
    const operationMap = {
      [TRANSACTION_TYPE.CONFIRM]: this.stellarRepository.confirmOrder,
      [TRANSACTION_TYPE.CONSOLIDATE]: this.stellarRepository.consolidateOrder,
      [TRANSACTION_TYPE.DELIVER]: this.stellarRepository.deliverOrder,
    };

    return await operationMap[type](products);
  }

  private async createStellarTransaction(
    orderId: number,
    orderLines: OrderLineDto[],
    type: TRANSACTION_TYPE,
  ): Promise<string> {
    const transactions =
      await this.stellarTransactionRepository.getTransactionsForOrder(orderId);

    this.validateStellarTransaction(type, transactions);

    const products =
      await this.stellarAssetService.transformOrderLinesToAssetAmounts(
        orderLines,
      );

    const { hash, created_at } = await this.executeStellarTransaction(
      products,
      type,
    );

    await this.stellarTransactionRepository.create({
      orderId,
      hash,
      timestamp: created_at,
      type,
    });

    return hash;
  }

  async confirmOrder(
    orderId: number,
    orderLines: OrderLineDto[],
  ): Promise<string> {
    try {
      return await this.createStellarTransaction(
        orderId,
        orderLines,
        TRANSACTION_TYPE.CONFIRM,
      );
    } catch (error) {
      this.errorMapper.map(error);
    }
  }

  async consolidateOrder(
    orderId: number,
    orderLines: OrderLineDto[],
  ): Promise<string> {
    try {
      return await this.createStellarTransaction(
        orderId,
        orderLines,
        TRANSACTION_TYPE.CONSOLIDATE,
      );
    } catch (error) {
      this.errorMapper.map(error);
    }
  }

  async deliverOrder(
    orderId: number,
    orderLines: OrderLineDto[],
  ): Promise<string> {
    try {
      return await this.createStellarTransaction(
        orderId,
        orderLines,
        TRANSACTION_TYPE.DELIVER,
      );
    } catch (error) {
      this.errorMapper.map(error);
    }
  }
}
