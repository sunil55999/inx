import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('channels', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.bigInteger('telegram_channel_id').unique().notNullable();
    table.string('channel_name', 255).notNullable();
    table.string('channel_username', 100);
    table.string('channel_type', 20).notNullable().checkIn(['channel', 'group', 'supergroup']);
    table.boolean('bot_is_admin').notNullable().defaultTo(false);
    table.timestamp('last_permission_check');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('telegram_channel_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('channels');
}
