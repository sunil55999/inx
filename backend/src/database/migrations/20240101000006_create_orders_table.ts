import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('orders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('buyer_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('listing_id').notNullable().references('id').inTable('listings').onDelete('CASCADE');
    table.string('deposit_address', 255).notNullable();
    table.decimal('amount', 20, 8).notNullable();
    table.string('currency', 20).notNullable();
    table.string('status', 30).notNullable();
    table.string('transaction_hash', 255);
    table.integer('confirmations').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
    table.timestamp('paid_at');

    table.index('buyer_id');
    table.index('listing_id');
    table.index('status');
    table.index('deposit_address');
    table.index('expires_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('orders');
}
