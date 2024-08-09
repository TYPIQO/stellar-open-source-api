import { Horizon, Operation } from '@stellar/stellar-sdk';
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
