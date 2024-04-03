export enum ERROR_CODES {
  CONFIG_ISSUER_ACCOUNT_ERROR = 'CONFIG_ISSUER_ACCOUNT_ERROR',
  CREATE_ORDER_ERROR = 'CREATE_ORDER_ERROR',
  CONFIRM_ORDER_ERROR = 'CONFIRM_ORDER_ERROR',
  CONSOLIDATE_ORDER_ERROR = 'CONSOLIDATE_ORDER_ERROR',
  DELIVER_ORDER_ERROR = 'DELIVER_ORDER_ERROR',
  CANCEL_ORDER_ERROR = 'CANCEL_ORDER_ERROR',
  GENERIC_ERROR = 'GENERIC_ERROR',
  ORDER_UNABLE_TO_CREATE_ERROR = 'ORDER_UNABLE_TO_CREATE_ERROR',
  ORDER_UNABLE_TO_CONFIRM_ERROR = 'ORDER_UNABLE_TO_CONFIRM_ERROR',
  ORDER_UNABLE_TO_CONSOLIDATE_ERROR = 'ORDER_UNABLE_TO_CONSOLIDATE_ERROR',
  ORDER_UNABLE_TO_DELIVER_ERROR = 'ORDER_UNABLE_TO_DELIVER_ERROR',
}

export const ERROR_MESSAGES: { [key in ERROR_CODES]: string } = {
  [ERROR_CODES.CONFIG_ISSUER_ACCOUNT_ERROR]:
    'An error occurred while configuring issuer account',
  [ERROR_CODES.CREATE_ORDER_ERROR]: 'An error occurred while creating order',
  [ERROR_CODES.CONFIRM_ORDER_ERROR]:
    'An error occurred while confirming order transaction',
  [ERROR_CODES.CONSOLIDATE_ORDER_ERROR]:
    'An error occurred while consolidating order transaction',
  [ERROR_CODES.DELIVER_ORDER_ERROR]:
    'An error occurred while delivering order transaction',
  [ERROR_CODES.CANCEL_ORDER_ERROR]:
    'An error occurred while canceling order transaction',
  [ERROR_CODES.GENERIC_ERROR]: 'An error occurred in the Stellar service',
  [ERROR_CODES.ORDER_UNABLE_TO_CREATE_ERROR]: 'The order cannot be created',
  [ERROR_CODES.ORDER_UNABLE_TO_CONFIRM_ERROR]: 'The order cannot be confirmed',
  [ERROR_CODES.ORDER_UNABLE_TO_CONSOLIDATE_ERROR]:
    'The order cannot be consolidated',
  [ERROR_CODES.ORDER_UNABLE_TO_DELIVER_ERROR]: 'The order cannot be delivered',
};

export class StellarError extends Error {
  constructor(errorCode: ERROR_CODES) {
    super(ERROR_MESSAGES[errorCode]);
    this.name = errorCode;
  }
}
