import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Horizon, Keypair, Transaction } from '@stellar/stellar-sdk';
import { join } from 'path';
import * as request from 'supertest';

import { loadFixtures } from '@data/util/loader';

import { AppModule } from '@/app.module';
import { StellarError } from '@/common/application/exceptions/stellar.error';
import { TRACEABILITY_NODES } from '@/common/infrastructure/stellar/nodes.enum';
import { StellarConfig } from '@/configuration/stellar.configuration';
import { StellarService } from '@/modules/stellar/application/services/stellar.service';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import { ConfirmOrderDto } from '../../application/dto/confirm-order.dto';
import { ConsolidateOrderDto } from '../../application/dto/consolidate-order.dto';
import { CreateOrderDto } from '../../application/dto/create-order.dto';
import { DeliverOrderDto } from '../../application/dto/deliver-order.dto';
import { OdooService } from '../../application/services/odoo.service';
import {
  createAccountKeypair,
  createMockAccount,
  createMuxedAccounts,
  extractOperations,
  hasPaymentOperation,
  hasSetFlagsOperation,
  transformOrderLinesToAssetAmounts,
} from './helpers/stellar.helper';

const mockOrderLines = [
  { productId: 10, quantity: 10 },
  { productId: 20, quantity: 20 },
];
const mockOrderLineIds = [10, 20];

const amounts = transformOrderLinesToAssetAmounts(mockOrderLines);

const mockOdooService = {
  onModuleInit: jest.fn(),
  getOrderLinesForOrder: jest.fn(),
  getProductsForOrderLines: jest.fn(),
};

let mockOrderId = 0;

const createdOrderId = 1111;
const confirmedOrderId = 2222;
const consolidatedOrderId = 3333;

describe('Odoo Module', () => {
  let app: INestApplication;
  let stellarService: StellarService;
  let stellarConfig: StellarConfig;

  let issuerKeypair: Keypair;
  let createPublicKey: string;
  let confirmPublicKey: string;
  let consolidatePublicKey: string;
  let deliverPublicKey: string;

  let serverSpy: jest.SpyInstance;

  beforeAll(async () => {
    issuerKeypair = await createAccountKeypair();
    process.env.STELLAR_ISSUER_SECRET_KEY = issuerKeypair.secret();

    const nodes = await createMuxedAccounts(issuerKeypair.publicKey());
    createPublicKey = nodes[TRACEABILITY_NODES.CREATE];
    confirmPublicKey = nodes[TRACEABILITY_NODES.CONFIRM];
    consolidatePublicKey = nodes[TRACEABILITY_NODES.CONSOLIDATE];
    deliverPublicKey = nodes[TRACEABILITY_NODES.DELIVER];

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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

    serverSpy = jest.spyOn(stellarConfig.server, 'submitTransaction');

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

  describe('Stellar configuration', () => {
    it('Should have configured issuer account flags', async () => {
      const submittedTransaction = serverSpy.mock.calls[0][0] as Transaction;
      const transactionResult = (await serverSpy.mock.results[0]
        .value) as Horizon.HorizonApi.SubmitTransactionResponse;

      expect(serverSpy).toBeCalledTimes(1);
      expect(transactionResult.successful).toBe(true);
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

      const serverSpy = jest.spyOn(stellarConfig.server, 'submitTransaction');
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

  it('POST /odoo/create - Should create an order and trace the transaction', async () => {
    const orderId = getOrderId();
    const body = new CreateOrderDto();
    body.id = orderId;
    body.order_line = mockOrderLineIds;
    body.state = 'draft';

    const spyExecute = jest.spyOn(stellarService, 'executeTransaction');
    const serverSpy = jest.spyOn(stellarConfig.server, 'submitTransaction');
    jest
      .spyOn(mockOdooService, 'getProductsForOrderLines')
      .mockResolvedValue(mockOrderLines);

    await request(app.getHttpServer())
      .post('/odoo/create')
      .send(body)
      .expect(HttpStatus.CREATED);

    const hash = await spyExecute.mock.results[0].value;
    const operations = await extractOperations(serverSpy);

    expect(spyExecute).toBeCalledTimes(1);
    expect(spyExecute).toBeCalledWith(
      TRANSACTION_TYPE.CREATE,
      body.id,
      body.order_line,
    );
    expect(
      hasPaymentOperation(
        operations,
        amounts,
        issuerKeypair.publicKey(),
        createPublicKey,
      ),
    ).toBe(true);

    const { body: trace } = await request(app.getHttpServer())
      .get(`/stellar/trace/${orderId}`)
      .expect(HttpStatus.OK);

    expect(trace.length).toBe(1);
    expect(trace[0].orderId).toBe(orderId);
    expect(trace[0].hash).toBe(hash);
    expect(trace[0].type).toBe(TRANSACTION_TYPE.CREATE);
  });

  it('POST /odoo/confirm - Should confirm an order and trace the transaction', async () => {
    const orderId = createdOrderId;
    const body = new ConfirmOrderDto();
    body.id = orderId;
    body.order_line = mockOrderLineIds;
    body.state = 'sale';

    const spyExecute = jest.spyOn(stellarService, 'executeTransaction');
    const serverSpy = jest.spyOn(stellarConfig.server, 'submitTransaction');
    jest
      .spyOn(mockOdooService, 'getProductsForOrderLines')
      .mockResolvedValue(mockOrderLines);

    await request(app.getHttpServer())
      .post('/odoo/confirm')
      .send(body)
      .expect(HttpStatus.CREATED);

    const hash = await spyExecute.mock.results[0].value;
    const operations = await extractOperations(serverSpy);

    expect(spyExecute).toBeCalledTimes(1);
    expect(spyExecute).toBeCalledWith(
      TRANSACTION_TYPE.CONFIRM,
      body.id,
      body.order_line,
    );
    expect(
      hasPaymentOperation(
        operations,
        amounts,
        createPublicKey,
        confirmPublicKey,
      ),
    ).toBe(true);

    const { body: trace } = await request(app.getHttpServer())
      .get(`/stellar/trace/${orderId}`)
      .expect(HttpStatus.OK);

    expect(trace.length).toBe(2);
    expect(trace[1].orderId).toBe(orderId);
    expect(trace[1].hash).toBe(hash);
    expect(trace[1].type).toBe(TRANSACTION_TYPE.CONFIRM);
  });

  it('POST /odoo/consolidate - Should consolidate an order', async () => {
    const orderId = confirmedOrderId;
    const body = new ConsolidateOrderDto();
    body.sale_id = orderId;
    body.state = 'assigned';

    const spyExecute = jest.spyOn(stellarService, 'executeTransaction');
    const serverSpy = jest.spyOn(stellarConfig.server, 'submitTransaction');
    jest
      .spyOn(mockOdooService, 'getOrderLinesForOrder')
      .mockResolvedValueOnce(mockOrderLineIds);
    jest
      .spyOn(mockOdooService, 'getProductsForOrderLines')
      .mockResolvedValue(mockOrderLines);

    await request(app.getHttpServer())
      .post('/odoo/consolidate')
      .send(body)
      .expect(HttpStatus.CREATED);

    const hash = await spyExecute.mock.results[0].value;
    const operations = await extractOperations(serverSpy);

    expect(spyExecute).toBeCalledTimes(1);
    expect(spyExecute).toBeCalledWith(
      TRANSACTION_TYPE.CONSOLIDATE,
      body.sale_id,
      undefined,
    );
    expect(
      hasPaymentOperation(
        operations,
        amounts,
        confirmPublicKey,
        consolidatePublicKey,
      ),
    ).toBe(true);

    const { body: trace } = await request(app.getHttpServer())
      .get(`/stellar/trace/${orderId}`)
      .expect(HttpStatus.OK);

    expect(trace.length).toBe(3);
    expect(trace[2].orderId).toBe(orderId);
    expect(trace[2].hash).toBe(hash);
    expect(trace[2].type).toBe(TRANSACTION_TYPE.CONSOLIDATE);
  });

  it('POST /odoo/deliver - Should deliver an order', async () => {
    const orderId = consolidatedOrderId;
    const body = new DeliverOrderDto();
    body.sale_id = orderId;
    body.state = 'done';

    const spyExecute = jest.spyOn(stellarService, 'executeTransaction');
    const serverSpy = jest.spyOn(stellarConfig.server, 'submitTransaction');
    jest
      .spyOn(mockOdooService, 'getOrderLinesForOrder')
      .mockResolvedValueOnce(mockOrderLineIds);
    jest
      .spyOn(mockOdooService, 'getProductsForOrderLines')
      .mockResolvedValue(mockOrderLines);

    await request(app.getHttpServer())
      .post('/odoo/deliver')
      .send(body)
      .expect(HttpStatus.CREATED);

    const hash = await spyExecute.mock.results[0].value;
    const operations = await extractOperations(serverSpy);

    expect(spyExecute).toBeCalledTimes(1);
    expect(spyExecute).toBeCalledWith(
      TRANSACTION_TYPE.DELIVER,
      body.sale_id,
      undefined,
    );
    expect(
      hasPaymentOperation(
        operations,
        amounts,
        consolidatePublicKey,
        deliverPublicKey,
      ),
    ).toBe(true);

    const { body: trace } = await request(app.getHttpServer())
      .get(`/stellar/trace/${orderId}`)
      .expect(HttpStatus.OK);

    expect(trace.length).toBe(4);
    expect(trace[3].orderId).toBe(orderId);
    expect(trace[3].hash).toBe(hash);
    expect(trace[3].type).toBe(TRANSACTION_TYPE.DELIVER);
  });
});
