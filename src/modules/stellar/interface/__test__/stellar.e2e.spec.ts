import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { join } from 'path';
import {
  FeeBumpTransaction,
  Horizon,
  Keypair,
  Networks,
  Transaction,
} from 'stellar-sdk';
import * as request from 'supertest';

import { loadFixtures } from '@data/util/loader';

import { AppModule } from '@/app.module';
import { StellarError } from '@/common/application/exceptions/stellar.error';
import { IAssetAmount } from '@/common/application/repository/stellar.repository.interface';
import { StellarConfig } from '@/configuration/stellar.configuration';
import { OdooService } from '@/modules/odoo/application/services/odoo.service';
import {
  StellarTransaction,
  TRANSACTION_TYPE,
} from '@/modules/stellar/domain/stellar-transaction.domain';

import { StellarService } from '../../application/services/stellar.service';
import {
  createBalances,
  createMockAccount,
  createMockPayments,
  hasClawbackOperation,
  hasClearBalanceOperation,
  hasPaymentOperation,
  hasSetFlagsOperation,
  hasTrustorOperation,
  transformOrderLinesToAssetAmounts,
} from './helpers/stellar.helper';

const mockPush = jest.fn();
jest.mock('queue', () => ({
  default: jest.fn(() => ({
    push: mockPush,
  })),
}));

class TimeoutError extends Error {
  response: object;
  constructor() {
    super();
    this.response = {
      data: {
        status: 504,
      },
    };
  }
}

class InsufficientFeeError extends Error {
  response: object;
  constructor() {
    super();
    this.response = {
      data: {
        extras: {
          result_codes: {
            transaction: 'tx_insufficient_fee',
          },
        },
      },
    };
  }
}

const keypairs = {
  issuer: Keypair.random(),
  distributor: Keypair.random(),
  confirm: Keypair.random(),
  consolidate: Keypair.random(),
};

process.env.STELLAR_NETWORK = 'testnet';
process.env.STELLAR_ISSUER_SECRET_KEY = keypairs.issuer.secret();
process.env.STELLAR_DISTRIBUTOR_SECRET_KEY = keypairs.distributor.secret();
process.env.STELLAR_CONFIRM_SECRET_KEY = keypairs.confirm.secret();
process.env.STELLAR_CONSOLIDATE_SECRET_KEY = keypairs.consolidate.secret();

const mockSubmittedTransaction = {
  hash: 'hash',
  created_at: '2021-01-01T00:00:00Z',
};

const mockOperationsCall = jest.fn();

const mockStellarConfig = {
  server: {
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
    operations: () => ({
      limit: () => ({
        forTransaction: () => ({
          call: mockOperationsCall,
        }),
      }),
    }),
  } as unknown as Horizon.Server,
  network: {
    url: 'https://horizon-testnet.stellar.org',
    passphrase: Networks.TESTNET,
  },
} as StellarConfig;

const mockOdooService = {
  onModuleInit: jest.fn(),
  getOrderLinesForOrder: jest.fn(),
  getProductsForOrderLines: jest.fn(),
};

const mockOrderLines = [
  { productId: 10, quantity: 10 },
  { productId: 20, quantity: 20 },
];

const mockOrderLineIds = [10, 20];

let mockOrderId = 0;

const createdOrderId = 1111;
const confirmedOrderId = 2222;
const consolidatedOrderId = 3333;
const failedOrderId = 4444;
const createdOrderToFailId = 5555;
const confirmedOrderToFailId = 6666;
const consolidatedOrderToFailId = 7777;
const orderToCancelId = 8888;
const failedOrderToCancelId = 9999;
const deliveredOrderToCancelId = 1000;
const orderToCancelWithRetryId = 2000;

describe('Stellar Module', () => {
  let app: INestApplication;
  let stellarService: StellarService;
  let stellarConfig: StellarConfig;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StellarConfig)
      .useValue(mockStellarConfig)
      .overrideProvider(OdooService)
      .useValue(mockOdooService)
      .compile();

    await loadFixtures(
      `${__dirname}/fixtures`,
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'configuration/orm.configuration.ts',
      ),
    );

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));

    stellarService = moduleRef.get<StellarService>(StellarService);
    stellarConfig = moduleRef.get<StellarConfig>(StellarConfig);

    jest
      .spyOn(stellarService, 'onModuleInit')
      .mockImplementationOnce(() => null);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  function getOrderId() {
    mockOrderId += 1;
    return mockOrderId;
  }

  describe('Stellar Service - On module init', () => {
    it('Should configure the issuer account if it is not configured', async () => {
      const mockIssuerAccount = createMockAccount(keypairs.issuer.publicKey());
      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockIssuerAccount);
      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockResolvedValueOnce(mockSubmittedTransaction as any);

      await stellarService.onModuleInit();

      const submittedTransaction = serverSpy.mock.calls[0][0] as Transaction;
      expect(hasSetFlagsOperation(submittedTransaction.operations)).toBe(true);
    });

    it('Should not configure the issuer account if it is already configured', async () => {
      const mockIssuerAccount = createMockAccount(
        keypairs.issuer.publicKey(),
        true,
      );
      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockIssuerAccount);
      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockResolvedValueOnce(mockSubmittedTransaction as any);

      await stellarService.onModuleInit();

      expect(serverSpy).not.toBeCalled();
    });

    it('Should throw an error if there is an error in the Stellar transaction', async () => {
      const mockIssuerAccount = createMockAccount(keypairs.issuer.publicKey());
      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockIssuerAccount);
      jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockRejectedValueOnce(new Error());

      await expect(stellarService.onModuleInit()).rejects.toThrow(StellarError);
    });
  });

  describe('Stellar Service - Push transaction', () => {
    it('Should enqueue a transaction', async () => {
      stellarService.pushTransaction(TRANSACTION_TYPE.CREATE, getOrderId());
      expect(mockPush).toBeCalledTimes(1);
    });

    it('Should enqueue a cancel transaction', async () => {
      stellarService.pushTransaction(TRANSACTION_TYPE.CANCEL, getOrderId());
      expect(mockPush).toBeCalledTimes(1);
    });
  });

  describe('Stellar Service - Execute transaction', () => {
    it('Should create an order', async () => {
      const amounts = transformOrderLinesToAssetAmounts(mockOrderLines);
      const mockIssuerAccount = createMockAccount(keypairs.issuer.publicKey());

      jest
        .spyOn(mockOdooService, 'getProductsForOrderLines')
        .mockResolvedValue(mockOrderLines);
      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockIssuerAccount);
      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockResolvedValueOnce(mockSubmittedTransaction as any);

      const response = await stellarService.executeTransaction(
        TRANSACTION_TYPE.CREATE,
        getOrderId(),
        mockOrderLineIds,
      );

      const submittedTransaction = serverSpy.mock
        .calls[0][0] as FeeBumpTransaction;

      const {
        innerTransaction: { operations },
      } = submittedTransaction;

      expect(response).toBe(mockSubmittedTransaction.hash);
      expect(
        hasPaymentOperation(
          operations,
          amounts,
          keypairs.issuer.publicKey(),
          keypairs.distributor.publicKey(),
        ),
      ).toBe(true);
      expect(
        hasTrustorOperation(
          operations,
          keypairs.distributor.publicKey(),
          amounts.map((amount) => amount.assetCode),
        ),
      ).toBe(true);
    });

    it('Should confirm an order and clear the distributor empty balances', async () => {
      const amounts = transformOrderLinesToAssetAmounts(mockOrderLines);

      const mockDistributorAccount = createMockAccount(
        keypairs.distributor.publicKey(),
        false,
        createBalances(amounts, keypairs.issuer.publicKey()),
      );

      jest
        .spyOn(mockOdooService, 'getProductsForOrderLines')
        .mockResolvedValue(mockOrderLines);
      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockDistributorAccount);
      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockResolvedValueOnce(mockSubmittedTransaction as any);

      const response = await stellarService.executeTransaction(
        TRANSACTION_TYPE.CONFIRM,
        createdOrderId,
        mockOrderLineIds,
      );

      const submittedTransaction = serverSpy.mock
        .calls[0][0] as FeeBumpTransaction;

      const {
        innerTransaction: { operations },
      } = submittedTransaction;

      expect(response).toBe(mockSubmittedTransaction.hash);
      expect(
        hasPaymentOperation(
          operations,
          amounts,
          keypairs.distributor.publicKey(),
          keypairs.confirm.publicKey(),
        ),
      ).toBe(true);
      expect(
        hasTrustorOperation(
          operations,
          keypairs.confirm.publicKey(),
          amounts.map((amount) => amount.assetCode),
        ),
      ).toBe(true);
      expect(
        hasClearBalanceOperation(
          operations,
          amounts.map((amount) => amount.assetCode),
        ),
      ).toBe(true);
    });

    it('Should consolidate an order and clear the confirm empty balances', async () => {
      const amounts = transformOrderLinesToAssetAmounts(mockOrderLines);

      const mockConfirmAccount = createMockAccount(
        keypairs.distributor.publicKey(),
        false,
        createBalances([amounts[0]], keypairs.issuer.publicKey()),
      );

      jest
        .spyOn(mockOdooService, 'getOrderLinesForOrder')
        .mockResolvedValueOnce(mockOrderLineIds);
      jest
        .spyOn(mockOdooService, 'getProductsForOrderLines')
        .mockResolvedValue(mockOrderLines);
      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockConfirmAccount);
      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockResolvedValueOnce(mockSubmittedTransaction as any);

      const response = await stellarService.executeTransaction(
        TRANSACTION_TYPE.CONSOLIDATE,
        confirmedOrderId,
      );

      const submittedTransaction = serverSpy.mock
        .calls[0][0] as FeeBumpTransaction;

      const {
        innerTransaction: { operations },
      } = submittedTransaction;

      expect(response).toBe(mockSubmittedTransaction.hash);
      expect(
        hasPaymentOperation(
          operations,
          amounts,
          keypairs.confirm.publicKey(),
          keypairs.consolidate.publicKey(),
        ),
      ).toBe(true);
      expect(
        hasTrustorOperation(
          operations,
          keypairs.consolidate.publicKey(),
          amounts.map((amount) => amount.assetCode),
        ),
      ).toBe(true);
      expect(hasClearBalanceOperation(operations, [amounts[0].assetCode])).toBe(
        true,
      );
    });

    it('Should deliver an order and clear the consolidate empty balances', async () => {
      const amounts = transformOrderLinesToAssetAmounts(mockOrderLines);

      const mockConsolidateAccount = createMockAccount(
        keypairs.distributor.publicKey(),
        false,
        createBalances(amounts, keypairs.issuer.publicKey()),
      );

      jest
        .spyOn(mockOdooService, 'getOrderLinesForOrder')
        .mockResolvedValueOnce(mockOrderLineIds);
      jest
        .spyOn(mockOdooService, 'getProductsForOrderLines')
        .mockResolvedValue(mockOrderLines);
      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockConsolidateAccount);
      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockResolvedValueOnce(mockSubmittedTransaction as any);

      const response = await stellarService.executeTransaction(
        TRANSACTION_TYPE.DELIVER,
        consolidatedOrderId,
      );

      const submittedTransaction = serverSpy.mock
        .calls[0][0] as FeeBumpTransaction;

      const {
        innerTransaction: { operations },
      } = submittedTransaction;

      expect(response).toBe(mockSubmittedTransaction.hash);
      expect(
        hasPaymentOperation(
          operations,
          amounts,
          keypairs.consolidate.publicKey(),
          keypairs.issuer.publicKey(),
        ),
      ).toBe(true);
      expect(
        hasTrustorOperation(
          operations,
          keypairs.issuer.publicKey(),
          amounts.map((amount) => amount.assetCode),
        ),
      ).toBe(false);
      expect(
        hasClearBalanceOperation(
          operations,
          amounts.map((amount) => amount.assetCode),
        ),
      ).toBe(true);
    });

    it('Should persist a failed transaction when a create transaction fails', async () => {
      const mockIssuerAccount = createMockAccount(keypairs.issuer.publicKey());
      const mockOrderId = getOrderId();

      jest
        .spyOn(mockOdooService, 'getProductsForOrderLines')
        .mockResolvedValue(mockOrderLines);
      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockIssuerAccount);
      jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockRejectedValueOnce(new Error());

      const response = await stellarService.executeTransaction(
        TRANSACTION_TYPE.CREATE,
        mockOrderId,
        mockOrderLineIds,
      );

      const expectedTrace: StellarTransaction[] = [
        {
          id: expect.any(Number),
          type: TRANSACTION_TYPE.CREATE,
          orderId: mockOrderId,
          hash: '',
          timestamp: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      ];

      const trace = await stellarService.getTransactionsForOrder(mockOrderId);

      expect(response).toBe(undefined);
      expect(trace).toEqual(expectedTrace);
    });

    it('Should persist a failed transaction when a confirm transaction fails', async () => {
      const mockIssuerAccount = createMockAccount(keypairs.issuer.publicKey());
      const mockOrderId = createdOrderToFailId;

      jest
        .spyOn(mockOdooService, 'getProductsForOrderLines')
        .mockResolvedValue(mockOrderLines);
      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockIssuerAccount);
      jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockRejectedValueOnce(new Error());

      const response = await stellarService.executeTransaction(
        TRANSACTION_TYPE.CONFIRM,
        mockOrderId,
      );

      const failedTransaction: StellarTransaction = {
        id: expect.any(Number),
        type: TRANSACTION_TYPE.CONFIRM,
        orderId: mockOrderId,
        hash: '',
        timestamp: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };
      const trace = await stellarService.getTransactionsForOrder(mockOrderId);

      expect(response).toBe(undefined);
      expect(trace).toContainEqual(failedTransaction);
    });

    it('Should persist a failed transaction when a consolidate transaction fails', async () => {
      const mockIssuerAccount = createMockAccount(keypairs.issuer.publicKey());
      const mockOrderId = confirmedOrderToFailId;

      jest
        .spyOn(mockOdooService, 'getProductsForOrderLines')
        .mockResolvedValue(mockOrderLines);
      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockIssuerAccount);
      jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockRejectedValueOnce(new Error());

      const response = await stellarService.executeTransaction(
        TRANSACTION_TYPE.CONSOLIDATE,
        mockOrderId,
      );

      const failedTransaction: StellarTransaction = {
        id: expect.any(Number),
        type: TRANSACTION_TYPE.CONSOLIDATE,
        orderId: mockOrderId,
        hash: '',
        timestamp: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };
      const trace = await stellarService.getTransactionsForOrder(mockOrderId);

      expect(response).toBe(undefined);
      expect(trace).toContainEqual(failedTransaction);
    });

    it('Should persist a failed transaction when a deliver transaction fails', async () => {
      const mockIssuerAccount = createMockAccount(keypairs.issuer.publicKey());
      const mockOrderId = consolidatedOrderToFailId;

      jest
        .spyOn(mockOdooService, 'getProductsForOrderLines')
        .mockResolvedValue(mockOrderLines);
      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockIssuerAccount);
      jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockRejectedValueOnce(new Error());

      const response = await stellarService.executeTransaction(
        TRANSACTION_TYPE.DELIVER,
        mockOrderId,
      );

      const failedTransaction: StellarTransaction = {
        id: expect.any(Number),
        type: TRANSACTION_TYPE.DELIVER,
        orderId: mockOrderId,
        hash: '',
        timestamp: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };
      const trace = await stellarService.getTransactionsForOrder(mockOrderId);

      expect(response).toBe(undefined);
      expect(trace).toContainEqual(failedTransaction);
    });

    it('Should return undefined if you want to make an invalid transaction for invalid length', async () => {
      const confirmResponse = await stellarService.executeTransaction(
        TRANSACTION_TYPE.CONFIRM,
        getOrderId(),
      );

      const consolidateResponse = await stellarService.executeTransaction(
        TRANSACTION_TYPE.CONSOLIDATE,
        getOrderId(),
      );

      const deliverResponse = await stellarService.executeTransaction(
        TRANSACTION_TYPE.DELIVER,
        getOrderId(),
      );

      expect(confirmResponse).toBe(undefined);
      expect(consolidateResponse).toBe(undefined);
      expect(deliverResponse).toBe(undefined);
    });

    it('Should return undefined if you want to make a transaction in a failed order', async () => {
      const response = await stellarService.executeTransaction(
        TRANSACTION_TYPE.CONFIRM,
        failedOrderId,
      );

      expect(response).toBe(undefined);
    });

    it('Should retry a transaction if it fails due to a timeout or an insufficient fee', async () => {
      const mockIssuerAccount = createMockAccount(keypairs.issuer.publicKey());

      jest
        .spyOn(mockOdooService, 'getProductsForOrderLines')
        .mockResolvedValue(mockOrderLines);
      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValue(mockIssuerAccount);

      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockRejectedValueOnce(new TimeoutError())
        .mockRejectedValueOnce(new InsufficientFeeError())
        .mockResolvedValueOnce(mockSubmittedTransaction as any);

      const response = await stellarService.executeTransaction(
        TRANSACTION_TYPE.CREATE,
        getOrderId(),
        mockOrderLineIds,
      );

      expect(serverSpy).toHaveBeenCalledTimes(3);
      expect(response).toEqual(mockSubmittedTransaction.hash);
    });
  });

  describe('Stellar Service - Execute cancel', () => {
    it('Should persist a failed movement when a timeout occurs', async () => {
      const mockAmounts: IAssetAmount[] = [
        { quantity: '10000', assetCode: 'ODOO00000000' },
        { quantity: '10000', assetCode: 'ODOO00000001' },
      ];

      const mockIssuerAccount = createMockAccount(keypairs.issuer.publicKey());
      const mockDistributorAccount = createMockAccount(
        keypairs.distributor.publicKey(),
        false,
        createBalances(mockAmounts, keypairs.issuer.publicKey()),
      );

      const expectedTransactions = expect.arrayContaining([
        expect.objectContaining({
          type: 'cancel',
          timestamp: expect.any(String),
          hash: '',
          orderId: orderToCancelId,
        }),
      ]);

      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockIssuerAccount)
        .mockResolvedValueOnce(mockDistributorAccount);

      mockOperationsCall.mockReturnValueOnce(
        createMockPayments(
          keypairs.issuer.publicKey(),
          keypairs.distributor.publicKey(),
          mockAmounts,
          keypairs.issuer.publicKey(),
        ),
      );

      jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockRejectedValue(new Error());

      await stellarService.executeCancel(orderToCancelId);

      const transactions = await stellarService.getTransactionsForOrder(
        orderToCancelId,
      );
      expect(transactions).toEqual(expectedTransactions);
    });

    it('Should cancel a transaction and clear the empty balances', async () => {
      const mockAmounts: IAssetAmount[] = [
        { quantity: '10000', assetCode: 'ODOO00000000' },
        { quantity: '10000', assetCode: 'ODOO00000001' },
      ];

      const mockIssuerAccount = createMockAccount(keypairs.issuer.publicKey());
      const mockDistributorAccount = createMockAccount(
        keypairs.distributor.publicKey(),
        false,
        createBalances(mockAmounts, keypairs.issuer.publicKey()),
      );

      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockIssuerAccount)
        .mockResolvedValueOnce(mockDistributorAccount);

      mockOperationsCall.mockReturnValueOnce(
        createMockPayments(
          keypairs.issuer.publicKey(),
          keypairs.distributor.publicKey(),
          mockAmounts,
          keypairs.issuer.publicKey(),
        ),
      );

      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockResolvedValue(mockSubmittedTransaction as any);

      const expectedTransactions = expect.arrayContaining([
        expect.objectContaining({
          type: 'create',
          timestamp: expect.any(String),
          hash: expect.any(String),
          orderId: orderToCancelId,
        }),
        expect.objectContaining({
          type: 'cancel',
          timestamp: expect.any(String),
          hash: expect.any(String),
          orderId: orderToCancelId,
        }),
      ]);

      await stellarService.executeCancel(orderToCancelId);

      const submittedTransaction = serverSpy.mock.calls[0][0] as Transaction;
      const operations = submittedTransaction.operations;

      expect(
        hasClawbackOperation(
          operations,
          mockAmounts.map((a) => a.assetCode),
          keypairs.distributor.publicKey(),
        ),
      ).toBe(true);
      expect(
        hasClearBalanceOperation(
          operations,
          mockAmounts.map((a) => a.assetCode),
        ),
      ).toBe(true);

      const transactions = await stellarService.getTransactionsForOrder(
        orderToCancelId,
      );
      expect(transactions).toEqual(expectedTransactions);
    });

    it('Should cancel the last valid transaction from a failed order', async () => {
      const mockAmounts: IAssetAmount[] = [
        { quantity: '10000', assetCode: 'ODOO00000000' },
        { quantity: '10000', assetCode: 'ODOO00000001' },
      ];

      const mockIssuerAccount = createMockAccount(keypairs.issuer.publicKey());
      const mockDistributorAccount = createMockAccount(
        keypairs.distributor.publicKey(),
        false,
        createBalances(mockAmounts, keypairs.issuer.publicKey()),
      );

      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockIssuerAccount)
        .mockResolvedValueOnce(mockDistributorAccount);

      mockOperationsCall.mockReturnValueOnce(
        createMockPayments(
          keypairs.issuer.publicKey(),
          keypairs.distributor.publicKey(),
          mockAmounts,
          keypairs.issuer.publicKey(),
        ),
      );

      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockResolvedValue(mockSubmittedTransaction as any);

      await stellarService.executeCancel(failedOrderToCancelId);

      const submittedTransaction = serverSpy.mock.calls[0][0] as Transaction;
      const operations = submittedTransaction.operations;

      expect(
        hasClawbackOperation(
          operations,
          mockAmounts.map((a) => a.assetCode),
          keypairs.distributor.publicKey(),
        ),
      ).toBe(true);
      expect(
        hasClearBalanceOperation(
          operations,
          mockAmounts.map((a) => a.assetCode),
        ),
      ).toBe(true);
    });

    it('Should retry a cancel if it fails due to a timeout or an insufficient fee', async () => {
      const mockAmounts: IAssetAmount[] = [
        { quantity: '10000', assetCode: 'ODOO00000000' },
        { quantity: '10000', assetCode: 'ODOO00000001' },
      ];

      const mockIssuerAccount = createMockAccount(keypairs.issuer.publicKey());
      const mockDistributorAccount = createMockAccount(
        keypairs.distributor.publicKey(),
        false,
        createBalances(mockAmounts, keypairs.issuer.publicKey()),
      );

      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockIssuerAccount)
        .mockResolvedValue(mockDistributorAccount);

      mockOperationsCall.mockReturnValueOnce(
        createMockPayments(
          keypairs.issuer.publicKey(),
          keypairs.distributor.publicKey(),
          mockAmounts,
          keypairs.issuer.publicKey(),
        ),
      );

      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockRejectedValueOnce(new TimeoutError())
        .mockRejectedValueOnce(new InsufficientFeeError())
        .mockReturnValueOnce(mockSubmittedTransaction as any);

      const response = await stellarService.executeCancel(
        orderToCancelWithRetryId,
      );

      expect(serverSpy).toBeCalledTimes(3);
      expect(response).toBe(mockSubmittedTransaction.hash);
    });

    it('Should not cancel a not created order', async () => {
      const response = await stellarService.executeCancel(getOrderId());
      expect(response).toBeUndefined();
    });

    it('Should not cancel a cancelled order', async () => {
      const response = await stellarService.executeCancel(orderToCancelId);
      expect(response).toBeUndefined();
    });

    it('Should not cancel a delivered order', async () => {
      const response = await stellarService.executeCancel(
        deliveredOrderToCancelId,
      );
      expect(response).toBeUndefined();
    });
  });

  describe('Stellar Controller', () => {
    it('GET /stellar/trace/:orderId - Should get the trace of an order', async () => {
      const expectedTrace = [
        {
          id: expect.any(Number),
          type: TRANSACTION_TYPE.CREATE,
          orderId: failedOrderId,
          hash: '',
          timestamp: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      ];

      const { body } = await request(app.getHttpServer())
        .get(`/stellar/trace/${failedOrderId}`)
        .expect(HttpStatus.OK);

      expect(body).toEqual(expectedTrace);
    });
  });
});
