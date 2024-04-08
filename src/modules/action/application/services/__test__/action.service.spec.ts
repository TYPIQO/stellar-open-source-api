import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { join } from 'path';

import { loadFixtures } from '@data/util/loader';

import { AppModule } from '@/app.module';
import { ODOO_REPOSITORY } from '@/common/application/repository/odoo.repository.interface';
import { StellarService } from '@/modules/stellar/application/services/stellar.service';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import { ACTIONS } from '../action.constants';
import { ActionService } from '../action.service';

const mockOdooRepository = {
  createOdooAction: jest.fn(),
};

const mockStellarService = {
  onModuleInit: jest.fn(),
};

describe('Action Service', () => {
  let app: INestApplication;
  let actionService: ActionService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ODOO_REPOSITORY)
      .useValue(mockOdooRepository)
      .overrideProvider(StellarService)
      .useValue(mockStellarService)
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

    actionService = moduleRef.get<ActionService>(ActionService);

    jest.spyOn(actionService, 'onModuleInit').mockResolvedValueOnce(undefined);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  describe('Action Service - On module init', () => {
    it('Should create core server actions if they do not exist', async () => {
      const createActionsSpy = jest
        .spyOn(mockOdooRepository, 'createOdooAction')
        .mockResolvedValueOnce({
          automationId: 10,
          serverActionId: 20,
        });

      await actionService.onModuleInit();
      expect(createActionsSpy).toHaveBeenCalledTimes(1);
      expect(createActionsSpy).toHaveBeenCalledWith(
        ACTIONS[TRANSACTION_TYPE.DELIVER],
      );
    });
  });
});
