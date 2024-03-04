import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStellarTransactionTable1709580372853
  implements MigrationInterface
{
  name = 'AddStellarTransactionTable1709580372853';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`stellar_transaction\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`order_id\` int NOT NULL, \`type\` enum ('confirm', 'consolidate', 'deliver') NOT NULL, \`hash\` varchar(255) NOT NULL, \`timestamp\` varchar(255) NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`stellar_transaction\``);
  }
}
