import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '@/app.module';
import { ODOO_REPOSITORY } from '@/common/application/repository/odoo.repository.interface';
import { ActionService } from '@/modules/action/application/services/action.service';
import { StellarService } from '@/modules/stellar/application/services/stellar.service';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import { SaleOrderDto } from '../../application/dto/sale-order.dto';
import { StockPickingDto } from '../../application/dto/stock-picking.dto';

const mockStellarService = {
  onModuleInit: jest.fn(),
  pushTransaction: jest.fn(),
};

const mockOdooRepository = {
  onModuleInit: jest.fn(),
};

const mockActionService = {
  onModuleInit: jest.fn(),
};

const mockOrderLineIds = [10, 20];

describe('Warehouse Controller', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StellarService)
      .useValue(mockStellarService)
      .overrideProvider(ODOO_REPOSITORY)
      .useValue(mockOdooRepository)
      .overrideProvider(ActionService)
      .useValue(mockActionService)
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

  describe('POST /warehouse/order - Process order', () => {
    it('Should create an order', async () => {
      const body = new SaleOrderDto();
      body.id = 1;
      body.order_line = mockOrderLineIds;
      body.state = 'draft';

      const spyPush = jest
        .spyOn(mockStellarService, 'pushTransaction')
        .mockReturnValueOnce(null);

      await request(app.getHttpServer())
        .post('/warehouse/order')
        .send(body)
        .expect(HttpStatus.CREATED);

      expect(spyPush).toBeCalledTimes(1);
      expect(spyPush).toBeCalledWith(
        TRANSACTION_TYPE.CREATE,
        body.id,
        body.order_line,
      );
    });

    it('Should confirm an order', async () => {
      const body = new SaleOrderDto();
      body.id = 1;
      body.order_line = mockOrderLineIds;
      body.state = 'sale';

      const spyPush = jest
        .spyOn(mockStellarService, 'pushTransaction')
        .mockReturnValueOnce(null);

      await request(app.getHttpServer())
        .post('/warehouse/order')
        .send(body)
        .expect(HttpStatus.CREATED);

      expect(spyPush).toBeCalledTimes(1);
      expect(spyPush).toBeCalledWith(
        TRANSACTION_TYPE.CONFIRM,
        body.id,
        body.order_line,
      );
    });

    it('Should consolidate an order', async () => {
      const body = new StockPickingDto();
      body.sale_id = 1;
      body.state = 'assigned';

      const spyPush = jest
        .spyOn(mockStellarService, 'pushTransaction')
        .mockReturnValueOnce(null);

      await request(app.getHttpServer())
        .post('/warehouse/order')
        .send(body)
        .expect(HttpStatus.CREATED);

      expect(spyPush).toBeCalledTimes(1);
      expect(spyPush).toBeCalledWith(
        TRANSACTION_TYPE.CONSOLIDATE,
        body.sale_id,
      );
    });

    it('Should deliver an order', async () => {
      const body = new StockPickingDto();
      body.sale_id = 1;
      body.state = 'done';

      const spyPush = jest
        .spyOn(mockStellarService, 'pushTransaction')
        .mockReturnValueOnce(null);

      await request(app.getHttpServer())
        .post('/warehouse/order')
        .send(body)
        .expect(HttpStatus.CREATED);

      expect(spyPush).toBeCalledTimes(1);
      expect(spyPush).toBeCalledWith(TRANSACTION_TYPE.DELIVER, body.sale_id);
    });

    it('Should throw a BadRequestException if the dto is invalid', async () => {
      const body = {
        state: 'draft',
      };

      await request(app.getHttpServer())
        .post('/warehouse/order')
        .send(body)
        .expect(HttpStatus.BAD_REQUEST);

      expect(mockStellarService.pushTransaction).not.toHaveBeenCalled();
    });
  });
});
