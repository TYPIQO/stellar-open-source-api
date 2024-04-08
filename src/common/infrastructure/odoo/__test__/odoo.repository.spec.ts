import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';

import {
  ERROR_CODES,
  OdooError,
} from '@/common/application/exceptions/odoo.error';
import {
  IOdooRepository,
  ODOO_REPOSITORY,
} from '@/common/application/repository/odoo.repository.interface';
import { CommonModule } from '@/common/common.module';

import { IField } from '../interfaces/field.interface';
import { IModel } from '../interfaces/model.interface';
import { IOrderLine } from '../interfaces/order-line.interface';
import { ISaleOrder } from '../interfaces/sale-order.interface';
import { MODEL, STATE } from '../odoo.constants';

config();
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

describe('Odoo Repository', () => {
  let app: INestApplication;
  let odooRepository: IOdooRepository;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule],
    }).compile();

    app = moduleRef.createNestApplication();

    odooRepository = moduleRef.get<IOdooRepository>(ODOO_REPOSITORY);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  describe('Odoo Repository - On module init', () => {
    it('Should connect to odoo', async () => {
      await odooRepository.onModuleInit();
      expect(mockConnect).toHaveBeenCalled();
    });

    it('Should throw an Odoo error when connecting to odoo fails', async () => {
      mockConnect.mockRejectedValueOnce(new Error());

      await expect(odooRepository.onModuleInit()).rejects.toThrowError(
        new OdooError(ERROR_CODES.CONNECT_ERROR),
      );
    });
  });

  describe('Odoo Repository - Get order lines for order', () => {
    it('Should get order lines for order', async () => {
      const mockSaleOrder: ISaleOrder = {
        order_line: [1, 2, 3],
      };

      mockSearchRead.mockImplementationOnce(() => {
        return [mockSaleOrder];
      });

      const orderLines = await odooRepository.getOrderLinesForOrder(1);
      expect(orderLines).toEqual([1, 2, 3]);
    });
  });

  describe('Odoo Repository - Get products for order lines', () => {
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

      const products = await odooRepository.getProductsForOrderLines([1, 2]);
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

  describe('Odoo Repository - Create core server actions', () => {
    it('Should create core server actions', async () => {
      const odooAction = {
        serverActionName: 'test',
        automationName: 'test',
        endpoint: 'test',
        state: STATE.DRAFT,
        modelName: MODEL.STOCK_PICKING,
        fieldNames: ['id', 'sale_id', 'partner_id', 'state'],
      };

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

      await odooRepository.createOdooAction(odooAction);

      const createServerActionFn = mockCreate.mock.calls[0];
      const createAutomationFn = mockCreate.mock.calls[1];

      expect(createServerActionFn[0]).toEqual(MODEL.SERVER_ACTION);
      expect(createServerActionFn[1]).toEqual({
        name: odooAction.serverActionName,
        model_id: mockModel[0].id,
        binding_type: 'action',
        state: 'webhook',
        type: MODEL.SERVER_ACTION,
        webhook_url: odooAction.endpoint,
        webhook_field_ids: [1, 2, 3, 4],
      });

      expect(createAutomationFn[0]).toEqual(MODEL.AUTOMATION);
      expect(createAutomationFn[1]).toEqual({
        name: odooAction.automationName,
        model_id: mockModel[0].id,
        active: true,
        trigger: 'on_state_set',
        action_server_ids: [1],
        trigger_field_ids: [4],
        trg_selection_field_id: mockFields[3].selection_ids[0],
      });
    });
  });
});
