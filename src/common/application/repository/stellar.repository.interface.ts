export const STELLAR_REPOSITORY = 'STELLAR_REPOSITORY';

export interface IAssetAmount {
  assetCode: string;
  quantity: string;
}

export interface ISubmittedTransaction {
  hash: string;
  created_at: string;
}

export interface IStellarRepository {
  configureIssuerAccount(): Promise<void>;
  createOrder(amounts: IAssetAmount[]): Promise<ISubmittedTransaction>;
  confirmOrder(amounts: IAssetAmount[]): Promise<ISubmittedTransaction>;
  consolidateOrder(amounts: IAssetAmount[]): Promise<ISubmittedTransaction>;
  deliverOrder(amounts: IAssetAmount[]): Promise<ISubmittedTransaction>;
}
