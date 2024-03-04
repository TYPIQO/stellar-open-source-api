import { Injectable } from '@nestjs/common';
import {
  Asset,
  AuthClawbackEnabledFlag,
  AuthRequiredFlag,
  AuthRevocableFlag,
  FeeBumpTransaction,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from 'stellar-sdk';

import { StellarConfig } from '@/configuration/stellar.configuration';

import {
  ERROR_CODES,
  StellarError,
} from '../application/exceptions/stellar.error';
import {
  IStellarAsset,
  IStellarProduct,
  IStellarRepository,
  ISubmittedTransaction,
} from '../application/repository/stellar.repository.interface';

@Injectable()
export class StellarRepository implements IStellarRepository {
  private readonly TRANSACTION_TIMEOUT = 30;
  private readonly TRANSACTION_MAX_FEE = '400';
  private readonly server: Horizon.Server;
  private readonly networkPassphrase: Networks;

  private issuerKeypair: Keypair;
  private distributorKeypair: Keypair;
  private confirmKeypair: Keypair;
  private consolidateKeypair: Keypair;
  private deliverKeypair: Keypair;
  private receiveKeypair: Keypair;

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
    this.deliverKeypair = Keypair.fromSecret(
      process.env.STELLAR_DELIVER_SECRET_KEY,
    );
    this.receiveKeypair = Keypair.fromSecret(
      process.env.STELLAR_RECEIVE_SECRET_KEY,
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
        }),
      );
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

      const setAccountFlagsTx =
        this.createSetAccountFlagsTransaction(issuerAccount);
      setAccountFlagsTx.sign(this.issuerKeypair);

      await this.server.submitTransaction(setAccountFlagsTx);
    } catch {
      throw new StellarError(ERROR_CODES.CONFIG_ISSUER_ACCOUNT_ERROR);
    }
  }

  async createCoreAccounts(): Promise<void> {
    try {
      const STARTING_BALANCE = '10';
      const keypairs = [
        this.distributorKeypair,
        this.confirmKeypair,
        this.consolidateKeypair,
        this.deliverKeypair,
        this.receiveKeypair,
      ];

      const issuerAccount = await this.server.loadAccount(
        this.issuerKeypair.publicKey(),
      );

      const builder = new TransactionBuilder(issuerAccount, {
        fee: this.TRANSACTION_MAX_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      for (const keypair of keypairs) {
        try {
          await this.server.loadAccount(keypair.publicKey());
        } catch {
          builder.addOperation(
            Operation.createAccount({
              destination: keypair.publicKey(),
              startingBalance: STARTING_BALANCE,
            }),
          );
        }
      }

      const createCoreAccountsTx = builder
        .setTimeout(this.TRANSACTION_TIMEOUT)
        .build();

      if (createCoreAccountsTx.operations.length) {
        createCoreAccountsTx.sign(this.issuerKeypair);
        await this.server.submitTransaction(createCoreAccountsTx);
      }
    } catch {
      throw new StellarError(ERROR_CODES.CREATE_CORE_ACCOUNTS_ERROR);
    }
  }

  async createAssets(assetCodes: string[]): Promise<IStellarAsset[]> {
    try {
      const trustors = [
        this.distributorKeypair,
        this.confirmKeypair,
        this.consolidateKeypair,
        this.deliverKeypair,
        this.receiveKeypair,
      ];

      const assets = assetCodes.map(
        (assetCode) => new Asset(assetCode, this.issuerKeypair.publicKey()),
      );

      const issuerAccount = await this.server.loadAccount(
        this.issuerKeypair.publicKey(),
      );

      const builder = new TransactionBuilder(issuerAccount, {
        fee: this.TRANSACTION_MAX_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      for (const asset of assets) {
        for (const trustor of trustors) {
          this.addTrustorOperation(builder, asset, trustor);
        }
      }

      const createAssetsTx = builder
        .setTimeout(this.TRANSACTION_TIMEOUT)
        .build();
      createAssetsTx.sign(
        this.issuerKeypair,
        this.distributorKeypair,
        this.confirmKeypair,
        this.consolidateKeypair,
        this.deliverKeypair,
        this.receiveKeypair,
      );

      const feeBumpTx = this.createFeeBumpTransaction(createAssetsTx);
      await this.server.submitTransaction(feeBumpTx);
      return assets.map((asset) => ({
        code: asset.code,
        issuer: asset.issuer,
      }));
    } catch (error) {
      throw new StellarError(ERROR_CODES.CREATE_ASSETS_ERROR);
    }
  }

  async confirmOrder(
    orderId: number,
    products: IStellarProduct[],
  ): Promise<ISubmittedTransaction> {
    try {
      const issuerAccount = await this.server.loadAccount(
        this.issuerKeypair.publicKey(),
      );

      const builder = new TransactionBuilder(issuerAccount, {
        fee: this.TRANSACTION_MAX_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      products.forEach(({ assetCode, quantity }) => {
        const asset = new Asset(assetCode, this.issuerKeypair.publicKey());
        builder
          .addOperation(
            Operation.payment({
              amount: quantity,
              asset,
              source: this.issuerKeypair.publicKey(),
              destination: this.distributorKeypair.publicKey(),
            }),
          )
          .addOperation(
            Operation.payment({
              amount: quantity,
              asset,
              source: this.distributorKeypair.publicKey(),
              destination: this.confirmKeypair.publicKey(),
            }),
          );
      });

      builder.addMemo(Memo.id(String(orderId)));

      const confirmOrderTx = builder
        .setTimeout(this.TRANSACTION_TIMEOUT)
        .build();
      confirmOrderTx.sign(this.issuerKeypair, this.distributorKeypair);

      const feeBumpTx = this.createFeeBumpTransaction(confirmOrderTx);
      return (await this.server.submitTransaction(
        feeBumpTx,
      )) as unknown as ISubmittedTransaction;
    } catch {
      throw new StellarError(ERROR_CODES.CONFIRM_ORDER_ERROR);
    }
  }

  async consolidateOrder(
    orderId: number,
    products: IStellarProduct[],
  ): Promise<ISubmittedTransaction> {
    try {
      const confirmAccount = await this.server.loadAccount(
        this.confirmKeypair.publicKey(),
      );

      const builder = new TransactionBuilder(confirmAccount, {
        fee: this.TRANSACTION_MAX_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      products.map(({ assetCode, quantity }) => {
        const asset = new Asset(assetCode, this.issuerKeypair.publicKey());
        builder.addOperation(
          Operation.payment({
            amount: quantity,
            asset,
            source: this.confirmKeypair.publicKey(),
            destination: this.consolidateKeypair.publicKey(),
          }),
        );
      });

      builder.addMemo(Memo.id(String(orderId)));

      const consolidateOrderTx = builder
        .setTimeout(this.TRANSACTION_TIMEOUT)
        .build();
      consolidateOrderTx.sign(this.confirmKeypair);

      const feeBumpTx = this.createFeeBumpTransaction(consolidateOrderTx);
      return (await this.server.submitTransaction(
        feeBumpTx,
      )) as unknown as ISubmittedTransaction;
    } catch {
      throw new StellarError(ERROR_CODES.CONSOLIDATE_ORDER_ERROR);
    }
  }

  async deliverOrder(
    orderId: number,
    products: IStellarProduct[],
  ): Promise<ISubmittedTransaction> {
    try {
      const consolidateAccount = await this.server.loadAccount(
        this.consolidateKeypair.publicKey(),
      );

      const builder = new TransactionBuilder(consolidateAccount, {
        fee: this.TRANSACTION_MAX_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      products.map(({ assetCode, quantity }) => {
        const asset = new Asset(assetCode, this.issuerKeypair.publicKey());
        builder.addOperation(
          Operation.payment({
            amount: quantity,
            asset,
            source: this.consolidateKeypair.publicKey(),
            destination: this.deliverKeypair.publicKey(),
          }),
        );
      });

      builder.addMemo(Memo.id(String(orderId)));

      const deliverOrderTx = builder
        .setTimeout(this.TRANSACTION_TIMEOUT)
        .build();
      deliverOrderTx.sign(this.consolidateKeypair);

      const feeBumpTx = this.createFeeBumpTransaction(deliverOrderTx);
      return (await this.server.submitTransaction(
        feeBumpTx,
      )) as unknown as ISubmittedTransaction;
    } catch {
      throw new StellarError(ERROR_CODES.DELIVER_ORDER_ERROR);
    }
  }
}
