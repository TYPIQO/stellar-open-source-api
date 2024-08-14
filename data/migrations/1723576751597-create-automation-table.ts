import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAutomationTable1723576751597 implements MigrationInterface {
  name = 'CreateAutomationTable1723576751597';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`automation\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`automation_id\` int NOT NULL, \`transaction_type\` enum ('create', 'confirm', 'consolidate', 'deliver', 'cancel') NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`automation\``);
  }
}
