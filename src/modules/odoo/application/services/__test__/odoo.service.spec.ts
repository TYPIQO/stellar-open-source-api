import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Horizon, Networks } from 'stellar-sdk';

import { AppModule } from '@/app.module';
import { StellarConfig } from '@/configuration/stellar.configuration';
import { StellarService } from '@/modules/stellar/application/services/stellar.service';

import { IOrderLineResponse } from '../../responses/order-line.response.interface';
import { ISaleOrderResponse } from '../../responses/sale-order.response.interface';
import { OdooService } from '../odoo.service';

const mockConnect = jest.fn();
const mockSearchRead = jest.fn();
jest.mock(
  'odoo-await',
  () =>
    class MockOdoo {
      connect = mockConnect;
      searchRead = mockSearchRead;
    },
);

const mockStellarService = {
  onModuleInit: jest.fn(),
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

describe('Odoo Service', () => {
  let app: INestApplication;
  let odooService: OdooService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StellarConfig)
      .useValue(mockStellarConfig)
      .overrideProvider(StellarService)
      .useValue(mockStellarService)
      .compile();

    app = moduleRef.createNestApplication();

    odooService = moduleRef.get<OdooService>(OdooService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Odoo Service - On module init', () => {
    it('Should connect to the database', async () => {
      await odooService.onModuleInit();
      expect(mockConnect).toHaveBeenCalled();
    });

    it('Should throw an error when connecting to the database fails', async () => {
      mockConnect.mockImplementationOnce(() => {
        throw new Error();
      });
      await expect(odooService.onModuleInit()).rejects.toThrowError();
    });
  });

  describe('Odoo Service - Get order lines for order', () => {
    it('Should get order lines for order', async () => {
      const mockSaleOrder: ISaleOrderResponse = {
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
      const mockOrderLines: IOrderLineResponse[] = [
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
});
