import { StellarTransaction } from '../../domain/stellar-transaction.domain';

export const STELLAR_TRANSACTION_REPOSITORY = 'STELLAR_TRANSACTION_REPOSITORY';

export interface IStellarTransactionRepository {
  create(stellarTransaction: StellarTransaction): Promise<StellarTransaction>;
  getTransactionsForOrder(orderId: number): Promise<StellarTransaction[]>;
}
