import * as Joi from 'joi';

export const configurationValidate = Joi.object({
  PORT: Joi.number().required(),
  NODE_ENV: Joi.string().required(),
  SERVER_ENV_URL: Joi.string().required(),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  SONAR_SERVER_URL: Joi.string().required(),
  SONAR_TOKEN: Joi.string().required(),
  STELLAR_NETWORK: Joi.string().required(),
  STELLAR_ISSUER_SECRET_KEY: Joi.string().required(),
  ODOO_URL: Joi.string().required(),
  ODOO_DATABASE: Joi.string().required(),
  ODOO_USERNAME: Joi.string().required(),
  ODOO_PASSWORD: Joi.string().required(),
});
