import { OdooAction } from '../../domain/odoo-action.domain';

export const ODOO_ACTION_REPOSITORY = 'ODOO_ACTION_REPOSITORY';

export interface IOdooActionRepository {
  create(action: OdooAction): Promise<OdooAction>;
  getAll(): Promise<OdooAction[]>;
}
