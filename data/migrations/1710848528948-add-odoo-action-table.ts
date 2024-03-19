import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOdooActionTable1710848528948 implements MigrationInterface {
  name = 'AddOdooActionTable1710848528948';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`odoo_action\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`type\` enum ('create', 'confirm', 'consolidate', 'deliver') NOT NULL, \`server_action_name\` varchar(255) NOT NULL, \`server_action_id\` int NOT NULL, \`automation_name\` varchar(255) NOT NULL, \`automation_id\` int NOT NULL, UNIQUE INDEX \`IDX_c7a90e99a99f23db55b9376842\` (\`type\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_c7a90e99a99f23db55b9376842\` ON \`odoo_action\``,
    );
    await queryRunner.query(`DROP TABLE \`odoo_action\``);
  }
}
