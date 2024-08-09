import { Asset, Horizon, Operation } from '@stellar/stellar-sdk';
import { HorizonApi } from '@stellar/stellar-sdk/lib/horizon';

import { IAssetAmount } from '@/common/application/repository/stellar.repository.interface';

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

export function createBalances(
  amounts: IAssetAmount[],
  issuer: string,
): HorizonApi.BalanceLine[] {
  return amounts.map(
    (amount) =>
      ({
        asset_type: 'credit_alphanum12',
        asset_code: amount.assetCode,
        asset_issuer: issuer,
        balance: amount.quantity,
      } as HorizonApi.BalanceLine),
  );
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

export function hasTrustorOperation(
  operations: Operation[],
  trustor: string,
  assetCodes: string[],
) {
  for (const assetCode of assetCodes) {
    const hasChangeTrust = operations.some(
      (operation) =>
        operation.type === 'changeTrust' &&
        operation.source === trustor &&
        (operation.line as Asset).code === assetCode,
    );

    const hasSetFlag = operations.some(
      (operation) =>
        operation.type === 'setTrustLineFlags' &&
        operation.trustor === trustor &&
        operation.asset.code === assetCode,
    );
    if (!hasChangeTrust && !hasSetFlag) {
      return false;
    }
  }
  return true;
}

export function hasClearBalanceOperation(
  operations: Operation[],
  assetCodes: string[],
) {
  for (const assetCode of assetCodes) {
    const operation = operations.find(
      (operation) =>
        operation.type === 'changeTrust' &&
        (operation.line as Asset).code === assetCode &&
        parseFloat(operation.limit) === 0,
    );
    if (!operation) {
      return false;
    }
  }
  return true;
}
