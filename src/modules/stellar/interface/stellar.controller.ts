import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';

import { ConfirmOrderDto } from '../application/dto/confirm-order.dto';
import { ConsolidateOrderDto } from '../application/dto/consolidate-order.dto';
import { CreateOrderDto } from '../application/dto/create-order.dto';
import { DeliverOrderDto } from '../application/dto/deliver-order.dto';
import { StellarService } from '../application/services/stellar.service';
import {
  StellarTransaction,
  TRANSACTION_TYPE,
} from '../domain/stellar-transaction.domain';

@Controller('stellar')
export class StellarController {
  constructor(private readonly stellarService: StellarService) {}

  @Get('trace/:orderId')
  async getTrace(
    @Param('orderId', ParseIntPipe) orderId: number,
  ): Promise<StellarTransaction[]> {
    return await this.stellarService.getTransactionsForOrder(orderId);
  }

  @Post('create')
  create(@Body() body: CreateOrderDto): void {
    this.stellarService.pushTransaction(
      TRANSACTION_TYPE.CREATE,
      body.id,
      body.order_line,
    );
  }

  @Post('confirm')
  confirm(@Body() body: ConfirmOrderDto): void {
    this.stellarService.pushTransaction(
      TRANSACTION_TYPE.CONFIRM,
      body.id,
      body.order_line,
    );
  }

  @Post('consolidate')
  consolidate(@Body() body: ConsolidateOrderDto): void {
    this.stellarService.pushTransaction(
      TRANSACTION_TYPE.CONSOLIDATE,
      body.sale_id,
    );
  }

  @Post('deliver')
  deliver(@Body() body: DeliverOrderDto): void {
    this.stellarService.pushTransaction(TRANSACTION_TYPE.DELIVER, body.sale_id);
  }
}
