import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCancelTransactionType1712172815782
  implements MigrationInterface
{
  name = 'AddCancelTransactionType1712172815782';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`stellar_transaction\` CHANGE \`type\` \`type\` enum ('create', 'confirm', 'consolidate', 'deliver', 'cancel') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`stellar_transaction\` CHANGE \`type\` \`type\` enum ('create', 'confirm', 'consolidate', 'deliver') NOT NULL`,
    );
  }
}
