import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('payouts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('merchant_id').notNullable().references('id').inTable('merchants').onDelete('CASCADE');
    table.decimal('amount', 20, 8).notNullable();
    table.string('currency', 20).notNullable();
    table.string('wallet_address', 255).notNullable();
    table.string('status', 20).notNullable();
    table.string('transaction_hash', 255);
    table.text('error_message');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('processed_at');

    table.index('merchant_id');
    table.index('status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('payouts');
}
