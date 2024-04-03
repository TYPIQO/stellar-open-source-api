import { Injectable } from '@nestjs/common';
import {
  Asset,
  AuthClawbackEnabledFlag,
  AuthRequiredFlag,
  AuthRevocableFlag,
  FeeBumpTransaction,
  Horizon,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from 'stellar-sdk';
import { HorizonApi } from 'stellar-sdk/lib/horizon';

import { StellarConfig } from '@/configuration/stellar.configuration';

import {
  ERROR_CODES,
  StellarError,
} from '../../application/exceptions/stellar.error';
import {
  IAssetAmount,
  IStellarRepository,
  ISubmittedTransaction,
} from '../../application/repository/stellar.repository.interface';

@Injectable()
export class StellarRepository implements IStellarRepository {
  private readonly TRANSACTION_TIMEOUT = 30;
  private readonly TRANSACTION_MAX_FEE = '1000';
  private readonly server: Horizon.Server;
  private readonly networkPassphrase: Networks;

  private issuerKeypair: Keypair;
  private distributorKeypair: Keypair;
  private confirmKeypair: Keypair;
  private consolidateKeypair: Keypair;

  constructor(private readonly stellarConfig: StellarConfig) {
    this.server = this.stellarConfig.server;
    this.networkPassphrase = this.stellarConfig.network.passphrase;
    this.issuerKeypair = Keypair.fromSecret(
      process.env.STELLAR_ISSUER_SECRET_KEY,
    );
    this.distributorKeypair = Keypair.fromSecret(
      process.env.STELLAR_DISTRIBUTOR_SECRET_KEY,
    );
    this.confirmKeypair = Keypair.fromSecret(
      process.env.STELLAR_CONFIRM_SECRET_KEY,
    );
    this.consolidateKeypair = Keypair.fromSecret(
      process.env.STELLAR_CONSOLIDATE_SECRET_KEY,
    );
  }

  private createFeeBumpTransaction(innerTx: Transaction): FeeBumpTransaction {
    const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
      this.issuerKeypair.publicKey(),
      this.TRANSACTION_MAX_FEE,
      innerTx,
      this.networkPassphrase,
    );
    feeBumpTx.sign(this.issuerKeypair);
    console.log(feeBumpTx.toXDR());
    return feeBumpTx;
  }

  private createSetAccountFlagsTransaction(
    sourceAccount: Horizon.AccountResponse,
  ): Transaction {
    return new TransactionBuilder(sourceAccount, {
      fee: this.TRANSACTION_MAX_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.setOptions({
          setFlags: AuthRequiredFlag,
        }),
      )
      .addOperation(
        Operation.setOptions({
          setFlags: AuthRevocableFlag,
        }),
      )
      .addOperation(
        Operation.setOptions({
          setFlags: AuthClawbackEnabledFlag,
        }),
      )
      .setTimeout(this.TRANSACTION_TIMEOUT)
      .build();
  }

  private addTrustorOperation(
    builder: TransactionBuilder,
    asset: Asset,
    trustor: Keypair,
  ): void {
    builder
      .addOperation(
        Operation.changeTrust({
          asset,
          source: trustor.publicKey(),
        }),
      )
      .addOperation(
        Operation.setTrustLineFlags({
          asset,
          flags: {
            authorized: true,
          },
          trustor: trustor.publicKey(),
          source: this.issuerKeypair.publicKey(),
        }),
      );
  }

  private addPaymentOperations(
    builder: TransactionBuilder,
    amounts: IAssetAmount[],
    source: Keypair,
    destination: Keypair,
  ): void {
    const sourcePublicKey = source.publicKey();
    const destinationPublicKey = destination.publicKey();

    const addTrustorOperations =
      destination.publicKey() !== this.issuerKeypair.publicKey();

    amounts.forEach(({ assetCode, quantity }) => {
      const asset = new Asset(assetCode, this.issuerKeypair.publicKey());

      if (addTrustorOperations) {
        this.addTrustorOperation(builder, asset, destination);
      }

      builder.addOperation(
        Operation.payment({
          amount: quantity,
          asset,
          source: sourcePublicKey,
          destination: destinationPublicKey,
        }),
      );
    });
  }

  private addClearBalanceOperations(
    builder: TransactionBuilder,
    sourceAccount: Horizon.AccountResponse,
    amounts: IAssetAmount[],
  ): void {
    const balancesToClear: HorizonApi.BalanceLineAsset<'credit_alphanum12'>[] =
      [];

    for (const { assetCode, quantity } of amounts) {
      const balance = sourceAccount.balances.find(
        (balance) =>
          balance.asset_type === 'credit_alphanum12' &&
          balance.asset_code === assetCode,
      );

      if (balance && balance.asset_type === 'credit_alphanum12') {
        if (parseFloat(balance.balance) === parseFloat(quantity)) {
          balancesToClear.push(balance);
        }
      }
    }

    for (const balance of balancesToClear) {
      builder.addOperation(
        Operation.changeTrust({
          asset: new Asset(balance.asset_code, balance.asset_issuer),
          limit: '0',
          source: sourceAccount.account_id,
        }),
      );
    }
  }

  private async submitFeeBumpTransaction(
    transaction: Transaction,
  ): Promise<ISubmittedTransaction> {
    const feeBumpTx = this.createFeeBumpTransaction(transaction);
    return (await this.server.submitTransaction(
      feeBumpTx,
    )) as unknown as ISubmittedTransaction;
  }

  private async createPayments(
    amounts: IAssetAmount[],
    source: Keypair,
    destination: Keypair,
  ): Promise<TransactionBuilder> {
    const sourceAccount = await this.server.loadAccount(source.publicKey());

    const builder = new TransactionBuilder(sourceAccount, {
      fee: this.TRANSACTION_MAX_FEE,
      networkPassphrase: this.networkPassphrase,
    });

    this.addPaymentOperations(builder, amounts, source, destination);

    const clearBalances = source.publicKey() !== this.issuerKeypair.publicKey();

    if (clearBalances) {
      this.addClearBalanceOperations(builder, sourceAccount, amounts);
    }

    return builder;
  }

  private async submitPaymentWithRetry(
    amounts: IAssetAmount[],
    source: Keypair,
    destination: Keypair,
    signers: Keypair[],
  ): Promise<ISubmittedTransaction> {
    try {
      const builder = await this.createPayments(amounts, source, destination);

      const tx = builder.setTimeout(this.TRANSACTION_TIMEOUT).build();
      tx.sign(...signers);

      const feeBumpTx = this.createFeeBumpTransaction(tx);
      return (await this.server.submitTransaction(
        feeBumpTx,
      )) as unknown as ISubmittedTransaction;
    } catch (error) {
      const isTimeoutError = error.response?.data?.status === 504;
      const isInsuficientFeeError =
        error.response?.data?.extras?.result_codes?.transaction ===
        'tx_insufficient_fee';

      if (isTimeoutError || isInsuficientFeeError) {
        return await this.submitPaymentWithRetry(
          amounts,
          source,
          destination,
          signers,
        );
      }

      throw error;
    }
  }

  async configureIssuerAccount(): Promise<void> {
    try {
      const issuerAccount = await this.server.loadAccount(
        this.issuerKeypair.publicKey(),
      );

      const { auth_clawback_enabled, auth_required, auth_revocable } =
        issuerAccount.flags;
      const isAlreadyConfigured =
        auth_clawback_enabled && auth_required && auth_revocable;

      if (isAlreadyConfigured) {
        return;
      }

      const setFlagsTx = this.createSetAccountFlagsTransaction(issuerAccount);
      setFlagsTx.sign(this.issuerKeypair);
      await this.server.submitTransaction(setFlagsTx);
    } catch {
      throw new StellarError(ERROR_CODES.CONFIG_ISSUER_ACCOUNT_ERROR);
    }
  }

  async createOrder(amounts: IAssetAmount[]): Promise<ISubmittedTransaction> {
    try {
      return await this.submitPaymentWithRetry(
        amounts,
        this.issuerKeypair,
        this.distributorKeypair,
        [this.issuerKeypair, this.distributorKeypair],
      );
    } catch {
      throw new StellarError(ERROR_CODES.CREATE_ORDER_ERROR);
    }
  }

  async confirmOrder(amounts: IAssetAmount[]): Promise<ISubmittedTransaction> {
    try {
      return await this.submitPaymentWithRetry(
        amounts,
        this.distributorKeypair,
        this.confirmKeypair,
        [this.issuerKeypair, this.distributorKeypair, this.confirmKeypair],
      );
    } catch {
      throw new StellarError(ERROR_CODES.CONFIRM_ORDER_ERROR);
    }
  }

  async consolidateOrder(
    amounts: IAssetAmount[],
  ): Promise<ISubmittedTransaction> {
    try {
      return await this.submitPaymentWithRetry(
        amounts,
        this.confirmKeypair,
        this.consolidateKeypair,
        [this.issuerKeypair, this.confirmKeypair, this.consolidateKeypair],
      );
    } catch {
      throw new StellarError(ERROR_CODES.CONSOLIDATE_ORDER_ERROR);
    }
  }

  async deliverOrder(amounts: IAssetAmount[]): Promise<ISubmittedTransaction> {
    try {
      return await this.submitPaymentWithRetry(
        amounts,
        this.consolidateKeypair,
        this.issuerKeypair,
        [this.consolidateKeypair],
      );
    } catch {
      throw new StellarError(ERROR_CODES.DELIVER_ORDER_ERROR);
    }
  }
}
