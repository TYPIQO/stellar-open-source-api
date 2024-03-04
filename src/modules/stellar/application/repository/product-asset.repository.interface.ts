import { ProductAsset } from '../../domain/product-asset.domain';

export const PRODUCT_ASSET_REPOSITORY = 'PRODUCT_ASSET_REPOSITORY';

export interface IProductAssetRepository {
  createMany(productAssets: ProductAsset[]): Promise<ProductAsset[]>;
  getMany(productIds: number[]): Promise<ProductAsset[]>;
}
