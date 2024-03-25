export interface IField {
  id: number;
  name: string;
  model: string;
  selection: false | string;
  selection_ids: number[];
}
