import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('listings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('merchant_id').notNullable().references('id').inTable('merchants').onDelete('CASCADE');
    table.uuid('channel_id').notNullable().references('id').inTable('channels').onDelete('CASCADE');
    table.text('description').notNullable();
    table.decimal('price', 20, 8).notNullable();
    table.string('currency', 20).notNullable();
    table.integer('duration_days').notNullable();
    table.specificType('signal_types', 'TEXT[]');
    table.string('status', 20).notNullable().defaultTo('active').checkIn(['active', 'inactive', 'suspended']);
    table.integer('view_count').notNullable().defaultTo(0);
    table.integer('purchase_count').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('merchant_id');
    table.index('channel_id');
    table.index('status');
    table.index('price');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('listings');
}
