export const STELLAR_REPOSITORY = 'STELLAR_REPOSITORY';

export interface IStellarAsset {
  code: string;
  issuer: string;
}

export interface IStellarProduct {
  assetCode: string;
  quantity: string;
}

export interface ISubmittedTransaction {
  hash: string;
  created_at: string;
}

export interface IStellarRepository {
  createCoreAccounts(): Promise<void>;
  configureIssuerAccount(): Promise<void>;
  createAssets(assetCodes: string[]): Promise<IStellarAsset[]>;
  confirmOrder(
    orderId: number,
    products: IStellarProduct[],
  ): Promise<ISubmittedTransaction>;
  consolidateOrder(
    orderId: number,
    products: IStellarProduct[],
  ): Promise<ISubmittedTransaction>;
  deliverOrder(
    orderId: number,
    products: IStellarProduct[],
  ): Promise<ISubmittedTransaction>;
}
