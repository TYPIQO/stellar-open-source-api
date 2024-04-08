export interface IAutomation {
  name: string;
  model_id: number;
  active: boolean;
  trigger: string;
  action_server_ids: number[];
  trigger_field_ids: number[];
  trg_selection_field_id: number;
}
