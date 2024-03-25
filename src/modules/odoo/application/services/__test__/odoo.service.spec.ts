import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { join } from 'path';

import { loadFixtures } from '@data/util/loader';

import { AppModule } from '@/app.module';
import { STELLAR_REPOSITORY } from '@/common/application/repository/stellar.repository.interface';
import { StellarService } from '@/modules/stellar/application/services/stellar.service';

import { IField } from '../../interfaces/field.interface';
import { IModel } from '../../interfaces/model.interface';
import { IOrderLine } from '../../interfaces/order-line.interface';
import { ISaleOrder } from '../../interfaces/sale-order.interface';
import { MODEL } from '../odoo.constants';
import { OdooService } from '../odoo.service';

const mockConnect = jest.fn();
const mockSearchRead = jest.fn();
const mockCreate = jest.fn();
jest.mock(
  'odoo-await',
  () =>
    class MockOdoo {
      connect = mockConnect;
      searchRead = mockSearchRead;
      create = mockCreate;
    },
);

const mockStellarService = {
  onModuleInit: jest.fn(),
};

describe('Odoo Service', () => {
  let app: INestApplication;
  let odooService: OdooService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StellarService)
      .useValue(mockStellarService)
      .overrideProvider(STELLAR_REPOSITORY)
      .useValue({})
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

    odooService = moduleRef.get<OdooService>(OdooService);

    jest
      .spyOn(odooService, 'createCoreServerActions')
      .mockResolvedValueOnce(undefined);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  describe('Odoo Service - On module init', () => {
    it('Should connect to the database and create core server actions', async () => {
      const createActionsSpy = jest
        .spyOn(odooService, 'createCoreServerActions')
        .mockResolvedValueOnce(undefined);

      await odooService.onModuleInit();
      expect(mockConnect).toHaveBeenCalled();
      expect(createActionsSpy).toHaveBeenCalled();
    });

    it('Should throw an error when connecting to the database fails', async () => {
      mockConnect.mockRejectedValueOnce(new Error());
      await expect(odooService.onModuleInit()).rejects.toThrowError();
    });
  });

  describe('Odoo Service - Get order lines for order', () => {
    it('Should get order lines for order', async () => {
      const mockSaleOrder: ISaleOrder = {
        order_line: [1, 2, 3],
      };

      mockSearchRead.mockImplementationOnce(() => {
        return [mockSaleOrder];
      });

      const orderLines = await odooService.getOrderLinesForOrder(1);
      expect(orderLines).toEqual([1, 2, 3]);
    });
  });

  describe('Odoo Service - Get products for order lines', () => {
    it('Should get products for order lines', async () => {
      const mockOrderLines: IOrderLine[] = [
        {
          product_id: [1, 'Product 1'],
          product_uom_qty: 10,
        },
        {
          product_id: [2, 'Product 2'],
          product_uom_qty: 20,
        },
      ];

      mockSearchRead.mockImplementationOnce(() => {
        return mockOrderLines;
      });

      const products = await odooService.getProductsForOrderLines([1, 2]);
      expect(products).toEqual([
        {
          productId: 1,
          quantity: 10,
        },
        {
          productId: 2,
          quantity: 20,
        },
      ]);
    });
  });

  describe('Odoo Service - Create core server actions', () => {
    it('Should create core server actions when they do not exist', async () => {
      const mockModel: IModel[] = [
        { id: 1, name: MODEL.STOCK_PICKING, model: MODEL.STOCK_PICKING },
      ];
      const mockFields: IField[] = [
        {
          id: 1,
          name: 'id',
          model: MODEL.STOCK_PICKING,
          selection: false,
          selection_ids: [],
        },
        {
          id: 2,
          name: 'sale_id',
          model: MODEL.STOCK_PICKING,
          selection: false,
          selection_ids: [],
        },
        {
          id: 3,
          name: 'partner_id',
          model: MODEL.STOCK_PICKING,
          selection: false,
          selection_ids: [],
        },
        {
          id: 4,
          name: 'state',
          model: MODEL.STOCK_PICKING,
          selection:
            "[('draft', 'Draft'), ('assigned', 'Ready'), ('done', 'Done'), ('cancel', 'Cancelled')]",
          selection_ids: [604, 607, 608, 609],
        },
      ];

      mockSearchRead.mockImplementationOnce(() => {
        return mockModel;
      });

      mockSearchRead.mockImplementationOnce(() => {
        return mockFields;
      });

      mockCreate.mockImplementation(() => {
        return 1;
      });

      await odooService.createCoreServerActions();

      const createServerActionFn = mockCreate.mock.calls[0];
      const createAutomationFn = mockCreate.mock.calls[1];

      expect(createServerActionFn[0]).toEqual(MODEL.SERVER_ACTION);
      expect(createServerActionFn[1]).toEqual({
        name: expect.any(String),
        model_id: mockModel[0].id,
        binding_type: 'action',
        state: 'webhook',
        type: MODEL.SERVER_ACTION,
        webhook_url: expect.any(String),
        webhook_field_ids: expect.any(Array),
      });

      expect(createAutomationFn[0]).toEqual(MODEL.AUTOMATION);
      expect(createAutomationFn[1]).toEqual({
        name: expect.any(String),
        model_id: mockModel[0].id,
        active: true,
        trigger: 'on_state_set',
        action_server_ids: expect.any(Array),
        trigger_field_ids: expect.any(Array),
        trg_selection_field_id: mockFields[3].selection_ids[2],
      });
    });
  });
});
