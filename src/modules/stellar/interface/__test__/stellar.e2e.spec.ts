import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Horizon, Keypair, Networks, Transaction } from '@stellar/stellar-sdk';

import { join } from 'path';
import * as request from 'supertest';

import { loadFixtures } from '@data/util/loader';

import { AppModule } from '@/app.module';
import { StellarError } from '@/common/application/exceptions/stellar.error';
import { StellarConfig } from '@/configuration/stellar.configuration';
import { OdooService } from '@/modules/odoo/application/services/odoo.service';
import {
  StellarTransaction,
  TRANSACTION_TYPE,
} from '@/modules/stellar/domain/stellar-transaction.domain';

import { StellarService } from '../../application/services/stellar.service';
import {
  createMockAccount,
  hasPaymentOperation,
  hasSetFlagsOperation,
  transformOrderLinesToAssetAmounts,
} from './helpers/stellar.helper';

const mockPush = jest.fn();
jest.mock('queue', () => ({
  default: jest.fn(() => ({
    push: mockPush,
  })),
}));

const issuerKeypair = Keypair.fromSecret(
  'SAJOLMA4GOIY5IQI565GG6ULQE6PU5USSKVMTIMSTI7JABHHBR7O34Q7',
);

const muxedAccounts = {
  create:
    'MCUR4DO6VOJO5NBMYTT4DSSVXA3X42TYWROMGPF3Q5RNTH5N7JXEQAAAAAAAAAAAAERSA',
  confirm:
    'MCUR4DO6VOJO5NBMYTT4DSSVXA3X42TYWROMGPF3Q5RNTH5N7JXEQAAAAAAAAAAAAJABA',
  consolidate:
    'MCUR4DO6VOJO5NBMYTT4DSSVXA3X42TYWROMGPF3Q5RNTH5N7JXEQAAAAAAAAAAAANQQA',
  deliver:
    'MCUR4DO6VOJO5NBMYTT4DSSVXA3X42TYWROMGPF3Q5RNTH5N7JXEQAAAAAAAAAAAASDHA',
};

process.env.STELLAR_NETWORK = 'testnet';
process.env.STELLAR_ISSUER_SECRET_KEY = issuerKeypair.secret();

const mockSubmittedTransaction = {
  hash: 'hash',
  created_at: '2021-01-01T00:00:00Z',
};

const mockStellarConfig = {
  server: {
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
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
      const mockIssuerAccount = createMockAccount(issuerKeypair.publicKey());
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
        issuerKeypair.publicKey(),
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
      const mockIssuerAccount = createMockAccount(issuerKeypair.publicKey());
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
  });

  describe('Stellar Service - Execute transaction', () => {
    it('Should create an order', async () => {
      const amounts = transformOrderLinesToAssetAmounts(mockOrderLines);
      const mockIssuerAccount = createMockAccount(issuerKeypair.publicKey());

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

      const { operations } = serverSpy.mock.calls[0][0] as Transaction;

      expect(response).toBe(mockSubmittedTransaction.hash);
      expect(
        hasPaymentOperation(
          operations,
          amounts,
          issuerKeypair.publicKey(),
          muxedAccounts.create,
        ),
      ).toBe(true);
    });

    it('Should confirm an order', async () => {
      const amounts = transformOrderLinesToAssetAmounts(mockOrderLines);
      const mockIssuerAccount = createMockAccount(issuerKeypair.publicKey());

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
        TRANSACTION_TYPE.CONFIRM,
        createdOrderId,
        mockOrderLineIds,
      );

      const { operations } = serverSpy.mock.calls[0][0] as Transaction;

      expect(response).toBe(mockSubmittedTransaction.hash);
      expect(
        hasPaymentOperation(
          operations,
          amounts,
          muxedAccounts.create,
          muxedAccounts.confirm,
        ),
      ).toBe(true);
    });

    it('Should consolidate an order', async () => {
      const amounts = transformOrderLinesToAssetAmounts(mockOrderLines);
      const mockIssuerAccount = createMockAccount(issuerKeypair.publicKey());

      jest
        .spyOn(mockOdooService, 'getOrderLinesForOrder')
        .mockResolvedValueOnce(mockOrderLineIds);
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
        TRANSACTION_TYPE.CONSOLIDATE,
        confirmedOrderId,
      );

      const { operations } = serverSpy.mock.calls[0][0] as Transaction;

      expect(response).toBe(mockSubmittedTransaction.hash);
      expect(
        hasPaymentOperation(
          operations,
          amounts,
          muxedAccounts.confirm,
          muxedAccounts.consolidate,
        ),
      ).toBe(true);
    });

    it('Should deliver an order', async () => {
      const amounts = transformOrderLinesToAssetAmounts(mockOrderLines);
      const mockIssuerAccount = createMockAccount(issuerKeypair.publicKey());

      jest
        .spyOn(mockOdooService, 'getOrderLinesForOrder')
        .mockResolvedValueOnce(mockOrderLineIds);
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
        TRANSACTION_TYPE.DELIVER,
        consolidatedOrderId,
      );

      const { operations } = serverSpy.mock.calls[0][0] as Transaction;

      expect(response).toBe(mockSubmittedTransaction.hash);
      expect(
        hasPaymentOperation(
          operations,
          amounts,
          muxedAccounts.consolidate,
          muxedAccounts.deliver,
        ),
      ).toBe(true);
    });

    it('Should persist a failed transaction when a create transaction fails', async () => {
      const mockIssuerAccount = createMockAccount(issuerKeypair.publicKey());
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
      const mockIssuerAccount = createMockAccount(issuerKeypair.publicKey());
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
      const mockIssuerAccount = createMockAccount(issuerKeypair.publicKey());
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
      const mockIssuerAccount = createMockAccount(issuerKeypair.publicKey());
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
