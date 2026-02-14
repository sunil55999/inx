import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('merchants', (table) => {
    table.boolean('is_verified').notNullable().defaultTo(false);
    table.boolean('is_suspended').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('merchants', (table) => {
    table.dropColumn('is_verified');
    table.dropColumn('is_suspended');
  });
}
