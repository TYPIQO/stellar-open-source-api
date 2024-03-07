import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { join } from 'path';
import { Horizon, Networks } from 'stellar-sdk';

import { loadFixtures } from '@data/util/loader';

import { AppModule } from '@/app.module';
import {
  IStellarRepository,
  STELLAR_REPOSITORY,
} from '@/common/application/repository/stellar.repository.interface';
import { StellarConfig } from '@/configuration/stellar.configuration';

import { StellarService } from '../stellar.service';

const mockPublicKey =
  'GAAP4WSBHEXGBLNKP27WGFPZCLA6BS3TL337HIYPNCPJB34IQ2IHQVV3';

const mockStellarAccount = {
  accountId: () => mockPublicKey,
  sequenceNumber: () => '1',
  incrementSequenceNumber: () => undefined,
  flags: {
    auth_required: false,
    auth_revocable: false,
    auth_clawback_enabled: false,
  },
} as unknown as Horizon.AccountResponse;

const mockStellarSubmittedTransaction = {
  hash: 'hash',
  created_at: '2021-01-01T00:00:00Z',
};

const mockStellarConfig = {
  server: {
    loadAccount: () => mockStellarAccount,
    submitTransaction: () => mockStellarSubmittedTransaction,
  } as unknown as Horizon.Server,
  network: {
    url: 'https://horizon-testnet.stellar.org',
    passphrase: Networks.TESTNET,
  },
} as StellarConfig;

const mockOrderLines = [{ productId: 10, quantity: 10 }];

let mockOrderId = 0;

const confirmedOrderId = 1111;
const consolidatedOrderId = 2222;
const deliveredOrderId = 3333;

describe('StellarService', () => {
  let app: INestApplication;
  let stellarService: StellarService;
  let stellarRepository: IStellarRepository;

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
    stellarRepository = moduleRef.get<IStellarRepository>(STELLAR_REPOSITORY);

    jest
      .spyOn(stellarService, 'onModuleInit')
      .mockImplementationOnce(() => null);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function getOrderId() {
    mockOrderId += 1;
    return mockOrderId;
  }

  describe('Stellar Service - On module init', () => {
    it('Should configure the issuer account and create core accounts', async () => {
      const configureIssuerAccountSpy = jest.spyOn(
        stellarRepository,
        'configureIssuerAccount',
      );
      const createCoreAccountsSpy = jest.spyOn(
        stellarRepository,
        'createCoreAccounts',
      );

      await stellarService.onModuleInit();
      expect(configureIssuerAccountSpy).toHaveBeenCalled();
      expect(createCoreAccountsSpy).toHaveBeenCalled();
    });
  });

  describe('Stellar Service - Confirm order', () => {
    it('Should confirm an order', async () => {
      jest
        .spyOn(stellarRepository, 'confirmOrder')
        .mockResolvedValue(mockStellarSubmittedTransaction);

      const response = await stellarService.confirmOrder(
        getOrderId(),
        mockOrderLines,
      );

      expect(response).toBe(mockStellarSubmittedTransaction.hash);
    });

    it('Should create assets for products that are not in the database', async () => {
      const productsWithoutAssets = [{ productId: 20, quantity: 10 }];
      const createAssetsSpy = jest
        .spyOn(stellarRepository, 'createAssets')
        .mockResolvedValue([{ code: 'ODOO00000020', issuer: 'ISSUER' }]);

      jest
        .spyOn(stellarRepository, 'confirmOrder')
        .mockResolvedValue(mockStellarSubmittedTransaction);

      const response = await stellarService.confirmOrder(getOrderId(), [
        ...mockOrderLines,
        ...productsWithoutAssets,
      ]);

      expect(createAssetsSpy).toHaveBeenCalled();
      expect(response).toBe(mockStellarSubmittedTransaction.hash);
    });

    it('Should throw an error if the order has already been confirmed', async () => {
      expect(async () => {
        await stellarService.confirmOrder(confirmedOrderId, mockOrderLines);
      }).rejects.toThrow();
    });
  });

  describe('Stellar Service - Consolidate order', () => {
    it('Should consolidate an order', async () => {
      jest
        .spyOn(stellarRepository, 'consolidateOrder')
        .mockResolvedValue(mockStellarSubmittedTransaction);

      const response = await stellarService.consolidateOrder(
        confirmedOrderId,
        mockOrderLines,
      );

      expect(response).toBe(mockStellarSubmittedTransaction.hash);
    });

    it('Should throw an error if you want to consolidate an unconfirmed order', async () => {
      expect(async () => {
        await stellarService.confirmOrder(deliveredOrderId, mockOrderLines);
      }).rejects.toThrow();
    });
  });

  describe('Stellar Service - Deliver order', () => {
    it('Should deliver an order', async () => {
      jest
        .spyOn(stellarRepository, 'deliverOrder')
        .mockResolvedValue(mockStellarSubmittedTransaction);

      const response = await stellarService.deliverOrder(
        consolidatedOrderId,
        mockOrderLines,
      );

      expect(response).toBe(mockStellarSubmittedTransaction.hash);
    });

    it('Should throw an error if you want to deliver an unconsolidated order', async () => {
      expect(async () => {
        await stellarService.deliverOrder(deliveredOrderId, mockOrderLines);
      }).rejects.toThrow();
    });
  });
});
