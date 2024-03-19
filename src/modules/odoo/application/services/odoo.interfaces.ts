import { MODEL } from './odoo.constants';

export interface IModel {
  id: number;
  name: string;
  model: string;
}

export interface IField {
  id: number;
  name: string;
  model: string;
  selection: false | string;
  selection_ids: number[];
}

export interface IServerAction {
  name: string;
  model_id: number;
  binding_type: string;
  state: string;
  type: MODEL;
  webhook_url: string;
  webhook_field_ids: number[];
}

export interface IAutomation {
  name: string;
  model_id: number;
  active: boolean;
  trigger: string;
  action_server_ids: number[];
  trigger_field_ids: number[];
  trg_selection_field_id: number;
}
