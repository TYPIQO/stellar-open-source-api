export const STELLAR_REPOSITORY = 'STELLAR_REPOSITORY';

export interface IStellarAsset {
  code: string;
  issuer: string;
}

export interface IAssetAmounts {
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
  confirmOrder(amounts: IAssetAmounts[]): Promise<ISubmittedTransaction>;
  consolidateOrder(amounts: IAssetAmounts[]): Promise<ISubmittedTransaction>;
  deliverOrder(amounts: IAssetAmounts[]): Promise<ISubmittedTransaction>;
}
