import { Body, Controller, Post } from '@nestjs/common';

import { StellarService } from '@/modules/stellar/application/services/stellar.service';
import { TRANSACTION_TYPE } from '@/modules/stellar/domain/stellar-transaction.domain';

import { CancelOrderDto } from '../application/dto/cancel-order.dto';
import { ConfirmOrderDto } from '../application/dto/confirm-order.dto';
import { ConsolidateOrderDto } from '../application/dto/consolidate-order.dto';
import { CreateOrderDto } from '../application/dto/create-order.dto';
import { DeliverOrderDto } from '../application/dto/deliver-order.dto';

@Controller('odoo')
export class OdooController {
  constructor(private readonly stellarService: StellarService) {}

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

  @Post('cancel')
  cancel(@Body() body: CancelOrderDto): void {
    this.stellarService.pushTransaction(TRANSACTION_TYPE.CANCEL, body.id);
  }
}
