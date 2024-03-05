import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  ERROR_CODES,
  ERROR_MESSAGES,
  StellarError,
} from '../exceptions/stellar.error';

@Injectable()
export class ErrorMapper {
  map(error: any): string {
    if (error instanceof StellarError) {
      const internalErrorCodes = [
        ERROR_CODES.CONFIG_ISSUER_ACCOUNT_ERROR,
        ERROR_CODES.CREATE_CORE_ACCOUNTS_ERROR,
        ERROR_CODES.CREATE_ASSETS_ERROR,
        ERROR_CODES.CONFIRM_ORDER_ERROR,
        ERROR_CODES.CONSOLIDATE_ORDER_ERROR,
        ERROR_CODES.DELIVER_ORDER_ERROR,
      ];

      const badRequestErrorCodes = [
        ERROR_CODES.ORDER_ALREADY_CONFIRMED_ERROR,
        ERROR_CODES.ORDER_UNABLE_TO_CONSOLIDATE_ERROR,
        ERROR_CODES.ORDER_UNABLE_TO_DELIVER_ERROR,
      ];

      if (internalErrorCodes.includes(error.name as ERROR_CODES)) {
        throw new InternalServerErrorException(error.message);
      } else if (badRequestErrorCodes.includes(error.name as ERROR_CODES)) {
        throw new BadRequestException(error.message);
      }
    }

    throw new InternalServerErrorException(ERROR_MESSAGES.GENERIC_ERROR);
  }
}
