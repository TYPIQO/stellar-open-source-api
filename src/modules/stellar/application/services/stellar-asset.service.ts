import { Inject, Injectable } from '@nestjs/common';

import { OdooService } from '@/modules/odoo/application/services/odoo.service';

import { OrderLineDto } from '../dto/order-line.dto';
import { ErrorMapper } from '../mapper/error.mapper';
import {
  IProductAssetRepository,
  PRODUCT_ASSET_REPOSITORY,
} from '../repository/product-asset.repository.interface';
import {
  IAssetAmounts,
  IStellarAsset,
  IStellarRepository,
  STELLAR_REPOSITORY,
} from '../repository/stellar.repository.interface';

@Injectable()
export class StellarAssetService {
  constructor(
    private readonly errorMapper: ErrorMapper,
    private readonly odooService: OdooService,
    @Inject(PRODUCT_ASSET_REPOSITORY)
    private readonly productAssetRepository: IProductAssetRepository,
    @Inject(STELLAR_REPOSITORY)
    private readonly stellarRepository: IStellarRepository,
  ) {}

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

  async transformOrderLinesToAssetAmounts(
    orderLines: OrderLineDto[],
  ): Promise<IAssetAmounts[]> {
    const products: IAssetAmounts[] = [];
    const assetsToCreate: (IAssetAmounts & { productId: number })[] = [];
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

  async createAssetsForAllProducts(): Promise<void> {
    try {
      const batchSize = 10;
      const batches: { productId: number; assetCode: string }[][] = [];

      const productIds = await this.odooService.getAllProductIds();
      const existingAssets = await this.productAssetRepository.getMany(
        productIds,
      );

      if (existingAssets.length === productIds.length) {
        return;
      }

      const assetsToCreate = productIds
        .filter(
          (productId) =>
            !existingAssets.find((asset) => asset.productId === productId),
        )
        .map((productId) => ({
          productId,
          assetCode: this.createAssetCode(productId),
        }));

      for (let i = 0; i < assetsToCreate.length; i += batchSize) {
        batches.push(assetsToCreate.slice(i, i + batchSize));
      }

      const createdAssets: IStellarAsset[] = [];

      for (const batch of batches) {
        const assets = await this.stellarRepository.createAssets(
          batch.map((asset) => asset.assetCode),
        );
        createdAssets.push(...assets);
      }

      const issuer = createdAssets[0].issuer;

      await this.productAssetRepository.createMany(
        assetsToCreate.map((asset) => ({
          productId: asset.productId,
          assetCode: asset.assetCode,
          assetIssuer: issuer,
        })),
      );
    } catch (error) {
      this.errorMapper.map(error);
    }
  }
}
