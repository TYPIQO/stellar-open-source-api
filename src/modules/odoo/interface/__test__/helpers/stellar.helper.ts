import {
  Horizon,
  Keypair,
  MuxedAccount,
  Operation,
  Transaction,
} from '@stellar/stellar-sdk';
import { HorizonApi } from '@stellar/stellar-sdk/lib/horizon';

import { IAssetAmount } from '@/common/application/repository/stellar.repository.interface';
import { TRACEABILITY_NODES } from '@/common/infrastructure/stellar/nodes.enum';
import { StellarConfig } from '@/configuration/stellar.configuration';

process.env.STELLAR_NETWORK = 'standalone';
const config = new StellarConfig();

export async function createAccountKeypair() {
  const keypair = Keypair.random();
  await config.server.friendbot(keypair.publicKey()).call();
  return keypair;
}

export async function createMuxedAccounts(
  accountId: string,
): Promise<Record<TRACEABILITY_NODES, string>> {
  const sourceAccount = await config.server.loadAccount(accountId);

  return {
    [TRACEABILITY_NODES.CREATE]: new MuxedAccount(
      sourceAccount,
      TRACEABILITY_NODES.CREATE,
    ).accountId(),
    [TRACEABILITY_NODES.CONFIRM]: new MuxedAccount(
      sourceAccount,
      TRACEABILITY_NODES.CONFIRM,
    ).accountId(),
    [TRACEABILITY_NODES.CONSOLIDATE]: new MuxedAccount(
      sourceAccount,
      TRACEABILITY_NODES.CONSOLIDATE,
    ).accountId(),
    [TRACEABILITY_NODES.DELIVER]: new MuxedAccount(
      sourceAccount,
      TRACEABILITY_NODES.DELIVER,
    ).accountId(),
    [TRACEABILITY_NODES.CANCEL]: new MuxedAccount(
      sourceAccount,
      TRACEABILITY_NODES.CANCEL,
    ).accountId(),
  };
}

function createAssetCode(productId: number): string {
  const PREFIX = 'ODOO';
  const FILL_CHAR = '0';
  const MAX_ASSET_CODE_LENGTH = 12;

  const productCode = String(productId).padStart(
    MAX_ASSET_CODE_LENGTH - PREFIX.length,
    FILL_CHAR,
  );

  return PREFIX + productCode;
}

export function transformOrderLinesToAssetAmounts(
  orderLines: { productId: number; quantity: number }[],
): IAssetAmount[] {
  const amounts: IAssetAmount[] = [];

  for (const orderLine of orderLines) {
    amounts.push({
      assetCode: createAssetCode(orderLine.productId),
      quantity: String(orderLine.quantity),
    });
  }

  return amounts;
}

export function createMockAccount(
  accountId: string,
  flags = false,
  balances: HorizonApi.BalanceLine[] = [],
): Horizon.AccountResponse {
  return {
    accountId: () => accountId,
    sequenceNumber: () => '1',
    incrementSequenceNumber: () => undefined,
    flags: {
      auth_required: flags,
      auth_revocable: flags,
      auth_clawback_enabled: flags,
    },
    balances,
  } as unknown as Horizon.AccountResponse;
}

export function hasSetFlagsOperation(operations: Operation[]) {
  const hasRequiredFlag = operations.some(
    (operation) => operation.type === 'setOptions' && operation.setFlags === 1,
  );

  const hasRevocableFlag = operations.some(
    (operation) => operation.type === 'setOptions' && operation.setFlags === 2,
  );

  const hasClawbackFlag = operations.some(
    (operation) => operation.type === 'setOptions' && operation.setFlags === 8,
  );

  return hasRequiredFlag && hasRevocableFlag && hasClawbackFlag;
}

export function hasPaymentOperation(
  operations: Operation[],
  amounts: IAssetAmount[],
  source: string,
  destination: string,
) {
  for (const { assetCode, quantity } of amounts) {
    const operation = operations.find(
      (operation) =>
        operation.type === 'payment' &&
        operation.asset.code === assetCode &&
        parseFloat(operation.amount) === parseFloat(quantity) &&
        operation.source === source &&
        operation.destination === destination,
    );
    if (!operation) {
      return false;
    }
  }
  return true;
}

export async function extractOperations(
  serverSpy: jest.SpyInstance<
    Promise<Horizon.HorizonApi.SubmitTransactionResponse>
  >,
  resultIndex = 0,
): Promise<Operation[]> {
  const { envelope_xdr } = (await serverSpy.mock.results[resultIndex]
    .value) as Horizon.HorizonApi.SubmitTransactionResponse;
  const { operations } = new Transaction(
    envelope_xdr,
    config.network.passphrase,
  );

  return operations;
}
