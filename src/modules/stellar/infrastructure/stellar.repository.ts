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

import { StellarConfig } from '@/configuration/stellar.configuration';

import {
  ERROR_CODES,
  StellarError,
} from '../application/exceptions/stellar.error';
import {
  IAssetAmounts,
  IStellarAsset,
  IStellarRepository,
  ISubmittedTransaction,
} from '../application/repository/stellar.repository.interface';

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
  private deliverKeypair: Keypair;

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

  private async createPayments({
    builder,
    amounts,
    source,
    destination,
  }: {
    builder?: TransactionBuilder;
    amounts: IAssetAmounts[];
    source: Keypair;
    destination: Keypair;
  }): Promise<TransactionBuilder> {
    const sourcePublicKey = source.publicKey();
    const destinationPublicKey = destination.publicKey();

    if (!builder) {
      const sourceAccount = await this.server.loadAccount(sourcePublicKey);

      builder = new TransactionBuilder(sourceAccount, {
        fee: this.TRANSACTION_MAX_FEE,
        networkPassphrase: this.networkPassphrase,
      });
    }

    amounts.forEach(({ assetCode, quantity }) => {
      const asset = new Asset(assetCode, this.issuerKeypair.publicKey());
      builder.addOperation(
        Operation.payment({
          amount: quantity,
          asset,
          source: sourcePublicKey,
          destination: destinationPublicKey,
        }),
      );
    });

    return builder;
  }

  private async submitFeeBumpTransaction(
    transaction: Transaction,
  ): Promise<ISubmittedTransaction> {
    const feeBumpTx = this.createFeeBumpTransaction(transaction);
    return (await this.server.submitTransaction(
      feeBumpTx,
    )) as unknown as ISubmittedTransaction;
  }

  async confirmOrder(amounts: IAssetAmounts[]): Promise<ISubmittedTransaction> {
    try {
      const builder = await this.createPayments({
        amounts,
        source: this.issuerKeypair,
        destination: this.distributorKeypair,
      });

      await this.createPayments({
        builder,
        amounts,
        source: this.distributorKeypair,
        destination: this.confirmKeypair,
      });

      const confirmOrderTx = builder
        .setTimeout(this.TRANSACTION_TIMEOUT)
        .build();

      confirmOrderTx.sign(this.issuerKeypair, this.distributorKeypair);
      return await this.submitFeeBumpTransaction(confirmOrderTx);
    } catch {
      throw new StellarError(ERROR_CODES.CONFIRM_ORDER_ERROR);
    }
  }

  async consolidateOrder(
    amounts: IAssetAmounts[],
  ): Promise<ISubmittedTransaction> {
    try {
      const builder = await this.createPayments({
        amounts,
        source: this.confirmKeypair,
        destination: this.consolidateKeypair,
      });

      const consolidateOrderTx = builder
        .setTimeout(this.TRANSACTION_TIMEOUT)
        .build();

      consolidateOrderTx.sign(this.confirmKeypair);
      return await this.submitFeeBumpTransaction(consolidateOrderTx);
    } catch {
      throw new StellarError(ERROR_CODES.CONSOLIDATE_ORDER_ERROR);
    }
  }

  async deliverOrder(amounts: IAssetAmounts[]): Promise<ISubmittedTransaction> {
    try {
      const builder = await this.createPayments({
        amounts,
        source: this.consolidateKeypair,
        destination: this.deliverKeypair,
      });

      const deliverOrderTx = builder
        .setTimeout(this.TRANSACTION_TIMEOUT)
        .build();

      deliverOrderTx.sign(this.consolidateKeypair);
      return await this.submitFeeBumpTransaction(deliverOrderTx);
    } catch {
      throw new StellarError(ERROR_CODES.DELIVER_ORDER_ERROR);
    }
  }
}
