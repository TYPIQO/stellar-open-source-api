import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '@/app.module';
import { STELLAR_REPOSITORY } from '@/common/application/repository/stellar.repository.interface';
import { StellarService } from '@/modules/stellar/application/services/stellar.service';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import { CancelOrderDto } from '../../application/dto/cancel-order.dto';
import { ConfirmOrderDto } from '../../application/dto/confirm-order.dto';
import { ConsolidateOrderDto } from '../../application/dto/consolidate-order.dto';
import { CreateOrderDto } from '../../application/dto/create-order.dto';
import { DeliverOrderDto } from '../../application/dto/deliver-order.dto';
import { OdooService } from '../../application/services/odoo.service';

const mockStellarService = {
  onModuleInit: jest.fn(),
  pushTransaction: jest.fn(),
};

const mockOrderLineIds = [10, 20];

describe('Odoo Module', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StellarService)
      .useValue(mockStellarService)
      .overrideProvider(STELLAR_REPOSITORY)
      .useValue({})
      .overrideProvider(OdooService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('POST /odoo/create - Should create an order', async () => {
    const body = new CreateOrderDto();
    body.id = 1;
    body.order_line = mockOrderLineIds;
    body.state = 'draft';

    const spyPush = jest
      .spyOn(mockStellarService, 'pushTransaction')
      .mockReturnValueOnce(null);

    await request(app.getHttpServer())
      .post('/odoo/create')
      .send(body)
      .expect(HttpStatus.CREATED);

    expect(spyPush).toBeCalledTimes(1);
    expect(spyPush).toBeCalledWith(
      TRANSACTION_TYPE.CREATE,
      body.id,
      body.order_line,
    );
  });

  it('POST /odoo/confirm - Should confirm an order', async () => {
    const body = new ConfirmOrderDto();
    body.id = 1;
    body.order_line = mockOrderLineIds;
    body.state = 'sale';

    const spyPush = jest
      .spyOn(mockStellarService, 'pushTransaction')
      .mockReturnValueOnce(null);

    await request(app.getHttpServer())
      .post('/odoo/confirm')
      .send(body)
      .expect(HttpStatus.CREATED);

    expect(spyPush).toBeCalledTimes(1);
    expect(spyPush).toBeCalledWith(
      TRANSACTION_TYPE.CONFIRM,
      body.id,
      body.order_line,
    );
  });

  it('POST /odoo/consolidate - Should consolidate an order', async () => {
    const body = new ConsolidateOrderDto();
    body.sale_id = 1;
    body.state = 'assigned';

    const spyPush = jest
      .spyOn(mockStellarService, 'pushTransaction')
      .mockReturnValueOnce(null);

    await request(app.getHttpServer())
      .post('/odoo/consolidate')
      .send(body)
      .expect(HttpStatus.CREATED);

    expect(spyPush).toBeCalledTimes(1);
    expect(spyPush).toBeCalledWith(TRANSACTION_TYPE.CONSOLIDATE, body.sale_id);
  });

  it('POST /odoo/deliver - Should deliver an order', async () => {
    const body = new DeliverOrderDto();
    body.sale_id = 1;
    body.state = 'done';

    const spyPush = jest
      .spyOn(mockStellarService, 'pushTransaction')
      .mockReturnValueOnce(null);

    await request(app.getHttpServer())
      .post('/odoo/deliver')
      .send(body)
      .expect(HttpStatus.CREATED);

    expect(spyPush).toBeCalledTimes(1);
    expect(spyPush).toBeCalledWith(TRANSACTION_TYPE.DELIVER, body.sale_id);
  });

  it('POST /odoo/cancel - Should cancel an order', async () => {
    const body = new CancelOrderDto();
    body.id = 1;
    body.state = 'cancel';
    body.order_line = mockOrderLineIds;

    const spyPush = jest
      .spyOn(mockStellarService, 'pushTransaction')
      .mockReturnValueOnce(null);

    await request(app.getHttpServer())
      .post('/odoo/cancel')
      .send(body)
      .expect(HttpStatus.CREATED);

    expect(spyPush).toBeCalledTimes(1);
    expect(spyPush).toBeCalledWith(TRANSACTION_TYPE.CANCEL, body.id);
  });
});
