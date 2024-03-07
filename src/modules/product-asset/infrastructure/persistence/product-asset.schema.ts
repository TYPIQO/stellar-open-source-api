import { EntitySchema } from 'typeorm';

import { baseColumnSchemas } from '@/common/infrastructure/persistence/base.schema';

import { ProductAsset } from '../../domain/product-asset.domain';

export const ProductAssetSchema = new EntitySchema<ProductAsset>({
  name: 'ProductAsset',
  target: ProductAsset,
  columns: {
    ...baseColumnSchemas,
    assetCode: {
      type: String,
      unique: true,
    },
    assetIssuer: {
      type: String,
    },
    productId: {
      type: Number,
      unique: true,
    },
  },
});
