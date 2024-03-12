import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNewTransactionType1710274550490 implements MigrationInterface {
  name = 'AddNewTransactionType1710274550490';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`stellar_transaction\` CHANGE \`type\` \`type\` enum ('create', 'confirm', 'consolidate', 'deliver') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`stellar_transaction\` CHANGE \`type\` \`type\` enum ('confirm', 'consolidate', 'deliver') NOT NULL`,
    );
  }
}
