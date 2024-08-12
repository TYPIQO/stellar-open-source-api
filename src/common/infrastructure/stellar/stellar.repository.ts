import { Injectable } from '@nestjs/common';
import {
  Asset,
  AuthClawbackEnabledFlag,
  AuthRequiredFlag,
  AuthRevocableFlag,
  Horizon,
  Keypair,
  MuxedAccount,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

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
import { TRACEABILITY_NODES } from './nodes.enum';

@Injectable()
export class StellarRepository implements IStellarRepository {
  private readonly TRANSACTION_TIMEOUT = 30;
  private readonly TRANSACTION_MAX_FEE = '10000';
  private readonly server: Horizon.Server;
  private readonly networkPassphrase: Networks;

  private issuerKeypair: Keypair;

  private createNode: MuxedAccount;
  private confirmNode: MuxedAccount;
  private consolidateNode: MuxedAccount;
  private deliverNode: MuxedAccount;

  constructor(private readonly stellarConfig: StellarConfig) {
    this.server = this.stellarConfig.server;
    this.networkPassphrase = this.stellarConfig.network.passphrase;
    this.issuerKeypair = Keypair.fromSecret(
      process.env.STELLAR_ISSUER_SECRET_KEY,
    );
  }

  private async setFlags(
    sourceKeypair: Keypair,
    sourceAccount: Horizon.AccountResponse,
  ): Promise<void> {
    const { auth_clawback_enabled, auth_required, auth_revocable } =
      sourceAccount.flags;
    const isAlreadyConfigured =
      auth_clawback_enabled && auth_required && auth_revocable;

    if (isAlreadyConfigured) {
      return;
    }

    const setFlagsTx = new TransactionBuilder(sourceAccount, {
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

    setFlagsTx.sign(sourceKeypair);
    await this.server.submitTransaction(setFlagsTx);
  }

  private createMuxedAccounts(sourceAccount: Horizon.AccountResponse): void {
    this.createNode = new MuxedAccount(
      sourceAccount,
      TRACEABILITY_NODES.CREATE,
    );
    this.confirmNode = new MuxedAccount(
      sourceAccount,
      TRACEABILITY_NODES.CONFIRM,
    );
    this.consolidateNode = new MuxedAccount(
      sourceAccount,
      TRACEABILITY_NODES.CONSOLIDATE,
    );
    this.deliverNode = new MuxedAccount(
      sourceAccount,
      TRACEABILITY_NODES.DELIVER,
    );
  }

  private async doPayment(
    source: string,
    destination: string,
    amounts: IAssetAmount[],
  ): Promise<ISubmittedTransaction> {
    const issuerAccount = await this.server.loadAccount(
      this.issuerKeypair.publicKey(),
    );

    const builder = new TransactionBuilder(issuerAccount, {
      fee: this.TRANSACTION_MAX_FEE,
      networkPassphrase: this.networkPassphrase,
    });

    amounts.forEach(({ assetCode, quantity }) => {
      const asset = new Asset(assetCode, this.issuerKeypair.publicKey());

      builder.addOperation(
        Operation.payment({
          amount: quantity,
          asset,
          source,
          destination,
        }),
      );
    });

    const tx = builder.setTimeout(this.TRANSACTION_TIMEOUT).build();
    tx.sign(this.issuerKeypair);

    return (await this.server.submitTransaction(
      tx,
    )) as unknown as ISubmittedTransaction;
  }

  async configureIssuerAccount(): Promise<void> {
    try {
      const issuerAccount = await this.server.loadAccount(
        this.issuerKeypair.publicKey(),
      );

      this.createMuxedAccounts(issuerAccount);
      await this.setFlags(this.issuerKeypair, issuerAccount);
    } catch {
      throw new StellarError(ERROR_CODES.CONFIG_ISSUER_ACCOUNT_ERROR);
    }
  }

  async createOrder(amounts: IAssetAmount[]): Promise<ISubmittedTransaction> {
    try {
      return await this.doPayment(
        this.issuerKeypair.publicKey(),
        this.createNode.accountId(),
        amounts,
      );
    } catch {
      throw new StellarError(ERROR_CODES.CREATE_ORDER_ERROR);
    }
  }

  async confirmOrder(amounts: IAssetAmount[]): Promise<ISubmittedTransaction> {
    try {
      return await this.doPayment(
        this.createNode.accountId(),
        this.confirmNode.accountId(),
        amounts,
      );
    } catch {
      throw new StellarError(ERROR_CODES.CONFIRM_ORDER_ERROR);
    }
  }

  async consolidateOrder(
    amounts: IAssetAmount[],
  ): Promise<ISubmittedTransaction> {
    try {
      return await this.doPayment(
        this.confirmNode.accountId(),
        this.consolidateNode.accountId(),
        amounts,
      );
    } catch {
      throw new StellarError(ERROR_CODES.CONSOLIDATE_ORDER_ERROR);
    }
  }

  async deliverOrder(amounts: IAssetAmount[]): Promise<ISubmittedTransaction> {
    try {
      return await this.doPayment(
        this.consolidateNode.accountId(),
        this.deliverNode.accountId(),
        amounts,
      );
    } catch {
      throw new StellarError(ERROR_CODES.DELIVER_ORDER_ERROR);
    }
  }
}
