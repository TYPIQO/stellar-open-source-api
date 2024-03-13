import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { join } from 'path';
import {
  FeeBumpTransaction,
  Horizon,
  Keypair,
  Networks,
  Transaction,
} from 'stellar-sdk';

import { loadFixtures } from '@data/util/loader';

import { AppModule } from '@/app.module';
import { StellarConfig } from '@/configuration/stellar.configuration';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import { StellarService } from '../stellar.service';
import {
  createBalances,
  createMockAccount,
  hasClearBalanceOperation,
  hasPaymentOperation,
  hasSetFlagsOperation,
  hasTrustorOperation,
  transformOrderLinesToAssetAmounts,
} from './helpers/stellar.helper';

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

const mockOrderLines = [{ productId: 10, quantity: 10 }];

let mockOrderId = 0;

const createdOrderId = 1111;
const confirmedOrderId = 2222;
const consolidatedOrderId = 3333;

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
      .compile();

    await loadFixtures(
      `${__dirname}/fixtures`,
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        '..',
        'configuration/orm.configuration.ts',
      ),
    );

    app = moduleRef.createNestApplication();

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

  describe('Stellar Service - Create order', () => {
    it('Should create an order', async () => {
      const orderLines = [
        { productId: 10, quantity: 10 },
        { productId: 20, quantity: 20 },
      ];
      const amounts = transformOrderLinesToAssetAmounts(orderLines);

      const mockIssuerAccount = createMockAccount(keypairs.issuer.publicKey());

      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockIssuerAccount);
      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockResolvedValueOnce(mockSubmittedTransaction as any);

      const response = await stellarService.executeTransaction(
        getOrderId(),
        orderLines,
        TRANSACTION_TYPE.CREATE,
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

    it('Should throw an error if you want to create an already created order', async () => {
      expect(async () => {
        await stellarService.executeTransaction(
          createdOrderId,
          mockOrderLines,
          TRANSACTION_TYPE.CREATE,
        );
      }).rejects.toThrow();
    });
  });

  describe('Stellar Service - Confirm order', () => {
    it('Should confirm an order and clear the distributor empty balances', async () => {
      const orderLines = [
        { productId: 10, quantity: 10 },
        { productId: 20, quantity: 20 },
      ];
      const amounts = transformOrderLinesToAssetAmounts(orderLines);

      const mockDistributorAccount = createMockAccount(
        keypairs.distributor.publicKey(),
        false,
        createBalances(amounts, keypairs.issuer.publicKey()),
      );

      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockDistributorAccount);
      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockResolvedValueOnce(mockSubmittedTransaction as any);

      const response = await stellarService.executeTransaction(
        createdOrderId,
        orderLines,
        TRANSACTION_TYPE.CONFIRM,
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

    it('Should throw an error if you want to confirm a not created order', async () => {
      expect(async () => {
        await stellarService.executeTransaction(
          getOrderId(),
          mockOrderLines,
          TRANSACTION_TYPE.CONFIRM,
        );
      }).rejects.toThrow();
    });
  });

  describe('Stellar Service - Consolidate order', () => {
    it('Should consolidate an order and clear the confirm empty balances', async () => {
      const orderLines = [
        { productId: 10, quantity: 10 },
        { productId: 20, quantity: 20 },
      ];
      const amounts = transformOrderLinesToAssetAmounts(orderLines);

      const mockConfirmAccount = createMockAccount(
        keypairs.distributor.publicKey(),
        false,
        createBalances([amounts[0]], keypairs.issuer.publicKey()),
      );

      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockConfirmAccount);
      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockResolvedValueOnce(mockSubmittedTransaction as any);

      const response = await stellarService.executeTransaction(
        confirmedOrderId,
        orderLines,
        TRANSACTION_TYPE.CONSOLIDATE,
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

    it('Should throw an error if you want to consolidate a not confirmed order', async () => {
      expect(async () => {
        await stellarService.executeTransaction(
          getOrderId(),
          mockOrderLines,
          TRANSACTION_TYPE.CONSOLIDATE,
        );
      }).rejects.toThrow();
    });
  });

  describe('Stellar Service - Deliver order', () => {
    it('Should deliver an order and clear the consolidate empty balances', async () => {
      const orderLines = [
        { productId: 10, quantity: 10 },
        { productId: 20, quantity: 20 },
      ];
      const amounts = transformOrderLinesToAssetAmounts(orderLines);

      const mockConsolidateAccount = createMockAccount(
        keypairs.distributor.publicKey(),
        false,
        createBalances(amounts, keypairs.issuer.publicKey()),
      );

      jest
        .spyOn(stellarConfig.server, 'loadAccount')
        .mockResolvedValueOnce(mockConsolidateAccount);
      const serverSpy = jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockResolvedValueOnce(mockSubmittedTransaction as any);

      const response = await stellarService.executeTransaction(
        consolidatedOrderId,
        orderLines,
        TRANSACTION_TYPE.DELIVER,
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

    it('Should throw an error if you want to deliver a not consolidated order', async () => {
      expect(async () => {
        await stellarService.executeTransaction(
          getOrderId(),
          mockOrderLines,
          TRANSACTION_TYPE.DELIVER,
        );
      }).rejects.toThrow();
    });
  });
});
