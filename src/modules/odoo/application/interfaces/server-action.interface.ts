import { MODEL } from '../services/odoo.constants';

export interface IServerAction {
  name: string;
  model_id: number;
  binding_type: string;
  state: string;
  type: MODEL;
  webhook_url: string;
  webhook_field_ids: number[];
}
