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
  IStellarProduct,
  IStellarRepository,
  ISubmittedTransaction,
  STELLAR_REPOSITORY,
} from '../repository/stellar.repository.interface';

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
  ) {}

  async onModuleInit() {
    await this.stellarRepository.configureIssuerAccount();
    await this.stellarRepository.createCoreAccounts();
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

  private transformQuantity(quantity: number): string {
    const MAX_DECIMALS = 3;
    return parseFloat(String(quantity)).toFixed(MAX_DECIMALS).replace('.', '');
  }

  private async transformOrderLinesToStellarProducts(
    orderLines: OrderLineDto[],
  ): Promise<IStellarProduct[]> {
    const products: IStellarProduct[] = [];
    const assetsToCreate: (IStellarProduct & { productId: number })[] = [];
    const productAssets = await this.productAssetRepository.getMany(
      orderLines.map((orderLine) => orderLine.productId),
    );

    for (const orderLine of orderLines) {
      const productAsset = productAssets.find(
        (productAsset) => productAsset.productId === orderLine.productId,
      );

      if (!productAsset) {
        assetsToCreate.push({
          productId: orderLine.productId,
          quantity: this.transformQuantity(orderLine.quantity),
          assetCode: this.createAssetCode(orderLine.productId),
        });
      } else {
        products.push({
          assetCode: productAsset.assetCode,
          quantity: this.transformQuantity(orderLine.quantity),
        });
      }
    }

    if (assetsToCreate.length > 0) {
      const assets = await this.stellarRepository.createAssets(
        assetsToCreate.map((asset) => asset.assetCode),
      );
      const issuer = assets[0].issuer;

      await this.productAssetRepository.createMany(
        assetsToCreate.map((assetToCreate) => ({
          productId: assetToCreate.productId,
          assetCode: assetToCreate.assetCode,
          assetIssuer: issuer,
        })),
      );

      for (const asset of assetsToCreate) {
        products.push({
          assetCode: asset.assetCode,
          quantity: asset.quantity,
        });
      }
    }

    return products;
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
    orderId: number,
    products: IStellarProduct[],
    type: TRANSACTION_TYPE,
  ): Promise<ISubmittedTransaction> {
    const operationMap = {
      [TRANSACTION_TYPE.CONFIRM]: this.stellarRepository.confirmOrder,
      [TRANSACTION_TYPE.CONSOLIDATE]: this.stellarRepository.consolidateOrder,
      [TRANSACTION_TYPE.DELIVER]: this.stellarRepository.deliverOrder,
    };

    return await operationMap[type](orderId, products);
  }

  private async createStellarTransaction(
    orderId: number,
    orderLines: OrderLineDto[],
    type: TRANSACTION_TYPE,
  ): Promise<string> {
    const transactions =
      await this.stellarTransactionRepository.getTransactionsForOrder(orderId);

    this.validateStellarTransaction(type, transactions);

    const products = await this.transformOrderLinesToStellarProducts(
      orderLines,
    );

    const { hash, created_at } = await this.executeStellarTransaction(
      orderId,
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
