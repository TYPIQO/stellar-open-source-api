import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductAssetTable1709581267774 implements MigrationInterface {
  name = 'AddProductAssetTable1709581267774';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`stellar_transaction\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`order_id\` int NOT NULL, \`type\` enum ('confirm', 'consolidate', 'deliver') NOT NULL, \`hash\` varchar(255) NOT NULL, \`timestamp\` varchar(255) NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`product_asset\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`asset_code\` varchar(255) NOT NULL, \`asset_issuer\` varchar(255) NOT NULL, \`product_id\` int NOT NULL, UNIQUE INDEX \`IDX_a9bb313351c8c4448a757588a1\` (\`asset_code\`), UNIQUE INDEX \`IDX_7922b8c920388d5f9a291df9a3\` (\`product_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_7922b8c920388d5f9a291df9a3\` ON \`product_asset\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_a9bb313351c8c4448a757588a1\` ON \`product_asset\``,
    );
    await queryRunner.query(`DROP TABLE \`product_asset\``);
    await queryRunner.query(`DROP TABLE \`stellar_transaction\``);
  }
}
