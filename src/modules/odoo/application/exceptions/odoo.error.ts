export enum ERROR_CODES {
  CONNECT_ERROR = 'CONNECT_ERROR',
}

export const ERROR_MESSAGES: { [key in ERROR_CODES]: string } = {
  [ERROR_CODES.CONNECT_ERROR]: 'An error occurred while connecting to Odoo',
};

export class OdooError extends Error {
  constructor(errorCode: ERROR_CODES) {
    super(ERROR_MESSAGES[errorCode]);
    this.name = errorCode;
  }
}
