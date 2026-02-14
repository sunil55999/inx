import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('merchant_balances', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('merchant_id').notNullable().references('id').inTable('merchants').onDelete('CASCADE');
    table.string('currency', 20).notNullable();
    table.decimal('available_balance', 20, 8).notNullable().defaultTo(0);
    table.decimal('pending_balance', 20, 8).notNullable().defaultTo(0);
    table.decimal('total_earned', 20, 8).notNullable().defaultTo(0);
    table.decimal('total_withdrawn', 20, 8).notNullable().defaultTo(0);
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['merchant_id', 'currency']);
    table.index('merchant_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('merchant_balances');
}
