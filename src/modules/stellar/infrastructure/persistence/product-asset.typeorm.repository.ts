import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { IProductAssetRepository } from '../../application/repository/product-asset.repository.interface';
import { ProductAsset } from '../../domain/product-asset.domain';
import { ProductAssetSchema } from './product-asset.schema';

@Injectable()
export class ProductAssetTypeormRepository implements IProductAssetRepository {
  constructor(
    @InjectRepository(ProductAssetSchema)
    private readonly repository: Repository<ProductAsset>,
  ) {}

  async createMany(productAssets: ProductAsset[]): Promise<ProductAsset[]> {
    return await this.repository.save(productAssets);
  }

  async getMany(productIds: number[]): Promise<ProductAsset[]> {
    return await this.repository.find({ where: { productId: In(productIds) } });
  }
}
