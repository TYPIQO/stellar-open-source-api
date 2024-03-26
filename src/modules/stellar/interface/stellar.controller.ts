import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';

import { StellarService } from '../application/services/stellar.service';
import { StellarTransaction } from '../domain/stellar-transaction.domain';

@Controller('stellar')
export class StellarController {
  constructor(private readonly stellarService: StellarService) {}

  @Get('trace/:orderId')
  async getTrace(
    @Param('orderId', ParseIntPipe) orderId: number,
  ): Promise<StellarTransaction[]> {
    return await this.stellarService.getTransactionsForOrder(orderId);
  }
}
