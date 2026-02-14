import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('escrow_ledger', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('subscription_id').references('id').inTable('subscriptions').onDelete('CASCADE');
    table.decimal('amount', 20, 8).notNullable();
    table.string('currency', 20).notNullable();
    table.string('status', 20).notNullable().checkIn(['held', 'released', 'refunded']);
    table.decimal('platform_fee', 20, 8).notNullable().defaultTo(0);
    table.decimal('merchant_amount', 20, 8);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('released_at');

    table.index('order_id');
    table.index('subscription_id');
    table.index('status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('escrow_ledger');
}
