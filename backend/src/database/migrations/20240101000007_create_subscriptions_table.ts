import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('subscriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('buyer_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('listing_id').notNullable().references('id').inTable('listings').onDelete('CASCADE');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('channel_id').notNullable().references('id').inTable('channels').onDelete('CASCADE');
    table.string('status', 30).notNullable();
    table.timestamp('start_date').notNullable();
    table.timestamp('expiry_date').notNullable();
    table.integer('duration_days').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('buyer_id');
    table.index('listing_id');
    table.index('order_id');
    table.index('status');
    table.index('expiry_date');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('subscriptions');
}
