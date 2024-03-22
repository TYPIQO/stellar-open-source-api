import { INestApplication, ValidationPipe } from '@nestjs/common';
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
import { StellarConfig } from '@/configuration/stellar.configuration';
import { OdooService } from '@/modules/odoo/application/services/odoo.service';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import { ConfirmOrderDto } from '../../application/dto/confirm-order.dto';
import { ConsolidateOrderDto } from '../../application/dto/consolidate-order.dto';
import { CreateOrderDto } from '../../application/dto/create-order.dto';
import { DeliverOrderDto } from '../../application/dto/deliver-order.dto';
import { StellarService } from '../../application/services/stellar.service';
import {
  createBalances,
  createMockAccount,
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

describe('Stellar Service', () => {
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
    it('POST /stellar/create - Should create an order', async () => {
      const body = new CreateOrderDto();
      body.id = getOrderId();
      body.order_line = mockOrderLineIds;
      body.state = 'draft';

      const spyPush = jest
        .spyOn(stellarService, 'pushTransaction')
        .mockReturnValueOnce(null);

      await request(app.getHttpServer())
        .post('/stellar/create')
        .send(body)
        .expect(201);

      expect(spyPush).toBeCalledTimes(1);
      expect(spyPush).toBeCalledWith(
        TRANSACTION_TYPE.CREATE,
        body.id,
        body.order_line,
      );
    });

    it('POST /stellar/confirm - Should confirm an order', async () => {
      const body = new ConfirmOrderDto();
      body.id = getOrderId();
      body.order_line = mockOrderLineIds;
      body.state = 'sale';

      const spyPush = jest
        .spyOn(stellarService, 'pushTransaction')
        .mockReturnValueOnce(null);

      await request(app.getHttpServer())
        .post('/stellar/confirm')
        .send(body)
        .expect(201);

      expect(spyPush).toBeCalledTimes(1);
      expect(spyPush).toBeCalledWith(
        TRANSACTION_TYPE.CONFIRM,
        body.id,
        body.order_line,
      );
    });

    it('POST /stellar/consolidate - Should consolidate an order', async () => {
      const body = new ConsolidateOrderDto();
      body.sale_id = getOrderId();
      body.state = 'assigned';

      const spyPush = jest
        .spyOn(stellarService, 'pushTransaction')
        .mockReturnValueOnce(null);

      await request(app.getHttpServer())
        .post('/stellar/consolidate')
        .send(body)
        .expect(201);

      expect(spyPush).toBeCalledTimes(1);
      expect(spyPush).toBeCalledWith(
        TRANSACTION_TYPE.CONSOLIDATE,
        body.sale_id,
      );
    });

    it('POST /stellar/deliver - Should deliver an order', async () => {
      const body = new DeliverOrderDto();
      body.sale_id = getOrderId();
      body.state = 'done';

      const spyPush = jest
        .spyOn(stellarService, 'pushTransaction')
        .mockReturnValueOnce(null);

      await request(app.getHttpServer())
        .post('/stellar/deliver')
        .send(body)
        .expect(201);

      expect(spyPush).toBeCalledTimes(1);
      expect(spyPush).toBeCalledWith(TRANSACTION_TYPE.DELIVER, body.sale_id);
    });
  });
});
