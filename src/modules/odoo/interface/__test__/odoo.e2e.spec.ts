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
const failedOrderId = 4444;
const createdOrderToFailId = 5555;
const confirmedOrderToFailId = 6666;
const consolidatedOrderToFailId = 7777;

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

  describe('POST /odoo/create', () => {
    let orderId: number;
    let body: CreateOrderDto;

    beforeEach(() => {
      orderId = getOrderId();
      body = new CreateOrderDto();
      body.id = orderId;
      body.order_line = mockOrderLineIds;
      body.state = 'draft';

      jest
        .spyOn(mockOdooService, 'getProductsForOrderLines')
        .mockResolvedValue(mockOrderLines);
    });

    it('Should create an order and trace the transaction', async () => {
      const executeSpy = jest.spyOn(stellarService, 'executeTransaction');
      const serverSpy = jest.spyOn(stellarConfig.server, 'submitTransaction');

      await request(app.getHttpServer())
        .post('/odoo/create')
        .send(body)
        .expect(HttpStatus.CREATED);

      const hash = await executeSpy.mock.results[0].value;
      const operations = await extractOperations(serverSpy);

      expect(executeSpy).toBeCalledTimes(1);
      expect(executeSpy).toBeCalledWith(
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

    it('Should persist a failed transaction when a create transaction fails', async () => {
      const executeSpy = jest.spyOn(stellarService, 'executeTransaction');
      jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockRejectedValueOnce(new Error('error'));

      await request(app.getHttpServer())
        .post('/odoo/create')
        .send(body)
        .expect(HttpStatus.CREATED);

      const hash = await executeSpy.mock.results[0].value;

      expect(executeSpy).toBeCalledTimes(1);
      expect(executeSpy).toBeCalledWith(
        TRANSACTION_TYPE.CREATE,
        body.id,
        body.order_line,
      );

      const { body: trace } = await request(app.getHttpServer())
        .get(`/stellar/trace/${orderId}`)
        .expect(HttpStatus.OK);

      expect(hash).toBe(undefined);
      expect(trace.length).toBe(1);
      expect(trace[0].orderId).toBe(orderId);
      expect(trace[0].hash).toBe('');
      expect(trace[0].type).toBe(TRANSACTION_TYPE.CREATE);
    });
  });

  describe('POST /odoo/confirm', () => {
    beforeEach(() => {
      jest
        .spyOn(mockOdooService, 'getProductsForOrderLines')
        .mockResolvedValue(mockOrderLines);
    });

    it('Should confirm an order and trace the transaction', async () => {
      const orderId = createdOrderId;
      const body = new ConfirmOrderDto();
      body.id = orderId;
      body.order_line = mockOrderLineIds;
      body.state = 'sale';

      const executeSpy = jest.spyOn(stellarService, 'executeTransaction');
      const serverSpy = jest.spyOn(stellarConfig.server, 'submitTransaction');

      await request(app.getHttpServer())
        .post('/odoo/confirm')
        .send(body)
        .expect(HttpStatus.CREATED);

      const hash = await executeSpy.mock.results[0].value;
      const operations = await extractOperations(serverSpy);

      expect(executeSpy).toBeCalledTimes(1);
      expect(executeSpy).toBeCalledWith(
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

    it('Should persist a failed transaction when a confirm transaction fails', async () => {
      const orderId = createdOrderToFailId;
      const body = new ConfirmOrderDto();
      body.id = orderId;
      body.order_line = mockOrderLineIds;
      body.state = 'sale';

      const executeSpy = jest.spyOn(stellarService, 'executeTransaction');
      jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockRejectedValueOnce(new Error('error'));

      await request(app.getHttpServer())
        .post('/odoo/confirm')
        .send(body)
        .expect(HttpStatus.CREATED);

      const hash = await executeSpy.mock.results[0].value;

      expect(executeSpy).toBeCalledTimes(1);
      expect(executeSpy).toBeCalledWith(
        TRANSACTION_TYPE.CONFIRM,
        body.id,
        body.order_line,
      );

      const { body: trace } = await request(app.getHttpServer())
        .get(`/stellar/trace/${orderId}`)
        .expect(HttpStatus.OK);

      expect(hash).toBe(undefined);
      expect(trace.length).toBe(2);
      expect(trace[1].orderId).toBe(orderId);
      expect(trace[1].hash).toBe('');
      expect(trace[1].type).toBe(TRANSACTION_TYPE.CONFIRM);
    });
  });

  describe('POST /odoo/consolidate', () => {
    beforeEach(() => {
      jest
        .spyOn(mockOdooService, 'getOrderLinesForOrder')
        .mockResolvedValueOnce(mockOrderLineIds);
      jest
        .spyOn(mockOdooService, 'getProductsForOrderLines')
        .mockResolvedValue(mockOrderLines);
    });

    it('Should consolidate an order and trace the transaction', async () => {
      const orderId = confirmedOrderId;
      const body = new ConsolidateOrderDto();
      body.sale_id = orderId;
      body.state = 'assigned';

      const executeSpy = jest.spyOn(stellarService, 'executeTransaction');
      const serverSpy = jest.spyOn(stellarConfig.server, 'submitTransaction');

      await request(app.getHttpServer())
        .post('/odoo/consolidate')
        .send(body)
        .expect(HttpStatus.CREATED);

      const hash = await executeSpy.mock.results[0].value;
      const operations = await extractOperations(serverSpy);

      expect(executeSpy).toBeCalledTimes(1);
      expect(executeSpy).toBeCalledWith(
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

    it('Should persist a failed transaction when a consolidate transaction fails', async () => {
      const orderId = confirmedOrderToFailId;
      const body = new ConsolidateOrderDto();
      body.sale_id = orderId;
      body.state = 'assigned';

      const executeSpy = jest.spyOn(stellarService, 'executeTransaction');
      jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockRejectedValueOnce(new Error('error'));

      await request(app.getHttpServer())
        .post('/odoo/consolidate')
        .send(body)
        .expect(HttpStatus.CREATED);

      const hash = await executeSpy.mock.results[0].value;

      expect(executeSpy).toBeCalledTimes(1);
      expect(executeSpy).toBeCalledWith(
        TRANSACTION_TYPE.CONSOLIDATE,
        body.sale_id,
        undefined,
      );

      const { body: trace } = await request(app.getHttpServer())
        .get(`/stellar/trace/${orderId}`)
        .expect(HttpStatus.OK);

      expect(hash).toBe(undefined);
      expect(trace.length).toBe(3);
      expect(trace[2].orderId).toBe(orderId);
      expect(trace[2].hash).toBe('');
      expect(trace[2].type).toBe(TRANSACTION_TYPE.CONSOLIDATE);
    });
  });

  describe('POST /odoo/deliver', () => {
    beforeEach(() => {
      jest
        .spyOn(mockOdooService, 'getOrderLinesForOrder')
        .mockResolvedValueOnce(mockOrderLineIds);
      jest
        .spyOn(mockOdooService, 'getProductsForOrderLines')
        .mockResolvedValue(mockOrderLines);
    });

    it('Should deliver an order and trace the transaction', async () => {
      const orderId = consolidatedOrderId;
      const body = new DeliverOrderDto();
      body.sale_id = orderId;
      body.state = 'done';

      const executeSpy = jest.spyOn(stellarService, 'executeTransaction');
      const serverSpy = jest.spyOn(stellarConfig.server, 'submitTransaction');

      await request(app.getHttpServer())
        .post('/odoo/deliver')
        .send(body)
        .expect(HttpStatus.CREATED);

      const hash = await executeSpy.mock.results[0].value;
      const operations = await extractOperations(serverSpy);

      expect(executeSpy).toBeCalledTimes(1);
      expect(executeSpy).toBeCalledWith(
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

    it('Should persist a failed transaction when a deliver transaction fails', async () => {
      const orderId = consolidatedOrderToFailId;
      const body = new DeliverOrderDto();
      body.sale_id = orderId;
      body.state = 'done';

      const executeSpy = jest.spyOn(stellarService, 'executeTransaction');
      jest
        .spyOn(stellarConfig.server, 'submitTransaction')
        .mockRejectedValueOnce(new Error('error'));

      await request(app.getHttpServer())
        .post('/odoo/deliver')
        .send(body)
        .expect(HttpStatus.CREATED);

      const hash = await executeSpy.mock.results[0].value;

      expect(executeSpy).toBeCalledTimes(1);
      expect(executeSpy).toBeCalledWith(
        TRANSACTION_TYPE.DELIVER,
        body.sale_id,
        undefined,
      );

      const { body: trace } = await request(app.getHttpServer())
        .get(`/stellar/trace/${orderId}`)
        .expect(HttpStatus.OK);

      expect(hash).toBe(undefined);
      expect(trace.length).toBe(4);
      expect(trace[3].orderId).toBe(orderId);
      expect(trace[3].hash).toBe('');
      expect(trace[3].type).toBe(TRANSACTION_TYPE.DELIVER);
    });
  });

  describe('Invalid transactions', () => {
    it('Should not make a transaction if the transaction is not the valid next one', async () => {
      const orderId = getOrderId();

      await request(app.getHttpServer())
        .get(`/stellar/trace/${orderId}`)
        .then(({ status, body: trace }) => {
          expect(status).toBe(HttpStatus.OK);
          expect(trace.length).toBe(0);
        });

      const executeSpy = jest.spyOn(stellarService, 'executeTransaction');
      const serverSpy = jest.spyOn(stellarConfig.server, 'submitTransaction');

      const confirmDto = new ConfirmOrderDto();
      confirmDto.id = orderId;
      confirmDto.order_line = mockOrderLineIds;
      confirmDto.state = 'sale';

      await request(app.getHttpServer())
        .post('/odoo/confirm')
        .send(confirmDto)
        .expect(HttpStatus.CREATED);

      const confirmHash = await executeSpy.mock.results[0].value;

      const consolidateDto = new ConsolidateOrderDto();
      consolidateDto.sale_id = orderId;
      consolidateDto.state = 'assigned';

      await request(app.getHttpServer())
        .post('/odoo/consolidate')
        .send(consolidateDto)
        .expect(HttpStatus.CREATED);

      const consolidateHash = await executeSpy.mock.results[1].value;

      const deliverDto = new DeliverOrderDto();
      deliverDto.sale_id = orderId;
      deliverDto.state = 'done';

      await request(app.getHttpServer())
        .post('/odoo/deliver')
        .send(deliverDto)
        .expect(HttpStatus.CREATED);

      const deliverHash = await executeSpy.mock.results[2].value;

      expect(executeSpy).toBeCalledTimes(3);
      expect(serverSpy).not.toBeCalled();
      expect(confirmHash).toBe(undefined);
      expect(consolidateHash).toBe(undefined);
      expect(deliverHash).toBe(undefined);

      await request(app.getHttpServer())
        .get(`/stellar/trace/${orderId}`)
        .then(({ status, body: trace }) => {
          expect(status).toBe(HttpStatus.OK);
          expect(trace.length).toBe(0);
        });
    });

    it('Should not make a transaction if the last one failed previously', async () => {
      const orderId = failedOrderId;

      const executeSpy = jest.spyOn(stellarService, 'executeTransaction');
      const serverSpy = jest.spyOn(stellarConfig.server, 'submitTransaction');

      const confirmDto = new ConfirmOrderDto();
      confirmDto.id = orderId;
      confirmDto.order_line = mockOrderLineIds;
      confirmDto.state = 'sale';

      await request(app.getHttpServer())
        .post('/odoo/confirm')
        .send(confirmDto)
        .expect(HttpStatus.CREATED);

      const confirmHash = await executeSpy.mock.results[0].value;

      expect(executeSpy).toBeCalledTimes(1);
      expect(serverSpy).not.toBeCalled();
      expect(confirmHash).toBe(undefined);
    });
  });
});
