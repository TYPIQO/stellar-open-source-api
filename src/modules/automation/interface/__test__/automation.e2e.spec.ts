import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '@/app.module';
import { OdooService } from '@/modules/odoo/application/services/odoo.service';
import { StellarService } from '@/modules/stellar/application/services/stellar.service';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

const mockOdooService = {
  onModuleInit: jest.fn(),
  createAutomation: jest.fn(),
};

const mockStellarService = {
  onModuleInit: jest.fn(),
};

describe('Automation module', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OdooService)
      .useValue(mockOdooService)
      .overrideProvider(StellarService)
      .useValue(mockStellarService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /automation/batch', () => {
    it('Should create all automations', async () => {
      jest
        .spyOn(mockOdooService, 'createAutomation')
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(5);

      const { status, body } = await request(app.getHttpServer())
        .post('/automation/batch')
        .send();

      expect(status).toEqual(201);
      expect(body).toEqual([
        expect.objectContaining({
          automationId: 1,
          transactionType: TRANSACTION_TYPE.CREATE,
        }),
        expect.objectContaining({
          automationId: 2,
          transactionType: TRANSACTION_TYPE.CONFIRM,
        }),
        expect.objectContaining({
          automationId: 3,
          transactionType: TRANSACTION_TYPE.CONSOLIDATE,
        }),
        expect.objectContaining({
          automationId: 4,
          transactionType: TRANSACTION_TYPE.DELIVER,
        }),
        expect.objectContaining({
          automationId: 5,
          transactionType: TRANSACTION_TYPE.CANCEL,
        }),
      ]);
    });
  });
});
