import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.string('transaction_hash', 255).unique().notNullable();
    table.string('from_address', 255).notNullable();
    table.string('to_address', 255).notNullable();
    table.decimal('amount', 20, 8).notNullable();
    table.string('currency', 20).notNullable();
    table.integer('confirmations').notNullable().defaultTo(0);
    table.bigInteger('block_number');
    table.timestamp('detected_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('confirmed_at');

    table.index('order_id');
    table.index('transaction_hash');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('transactions');
}
