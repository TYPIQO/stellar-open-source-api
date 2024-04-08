import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ValidationError, validateOrReject } from 'class-validator';

import { STATE } from '@/common/infrastructure/odoo/odoo.constants';
import { StellarService } from '@/modules/stellar/application/services/stellar.service';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import { ProcessOrderDto } from '../application/dto/process-order.dto';
import { SaleOrderDto } from '../application/dto/sale-order.dto';
import { StockPickingDto } from '../application/dto/stock-picking.dto';

@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly stellarService: StellarService) {}

  @Post('order')
  async processOrder(@Body() body: ProcessOrderDto): Promise<void> {
    try {
      let dto: SaleOrderDto | StockPickingDto;

      switch (body.state) {
        case STATE.DRAFT:
          dto = plainToInstance(SaleOrderDto, body);
          await validateOrReject(dto);
          this.stellarService.pushTransaction(
            TRANSACTION_TYPE.CREATE,
            dto.id,
            dto.order_line,
          );
          break;

        case STATE.SALE:
          dto = plainToInstance(SaleOrderDto, body);
          await validateOrReject(dto);
          this.stellarService.pushTransaction(
            TRANSACTION_TYPE.CONFIRM,
            dto.id,
            dto.order_line,
          );
          break;

        case STATE.ASSIGNED:
          dto = plainToInstance(StockPickingDto, body);
          await validateOrReject(dto);
          this.stellarService.pushTransaction(
            TRANSACTION_TYPE.CONSOLIDATE,
            dto.sale_id,
          );
          break;

        case STATE.DONE:
          dto = plainToInstance(StockPickingDto, body);
          await validateOrReject(dto);
          this.stellarService.pushTransaction(
            TRANSACTION_TYPE.DELIVER,
            dto.sale_id,
          );
          break;
      }
    } catch (errors) {
      const messages = [];
      for (const error of errors as ValidationError[]) {
        for (const message of Object.values(error.constraints)) {
          messages.push(message);
        }
      }
      throw new BadRequestException(messages);
    }
  }
}
