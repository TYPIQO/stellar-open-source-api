import { Base } from '@/common/domain/base.domain';

export class ProductAsset extends Base {
  assetCode: string;
  assetIssuer: string;
  productId: number;
}
