import { Automation } from '../../domain/automation.domain';

export const AUTOMATION_REPOSITORY = 'AUTOMATION_REPOSITORY';

export interface IAutomationRepository {
  getAll(): Promise<Automation[]>;
  create(automation: Automation): Promise<Automation>;
}
