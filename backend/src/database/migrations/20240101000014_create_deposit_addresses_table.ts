import type { Knex } from 'knex';

/**
 * Create deposit_addresses table
 * 
 * Stores mapping between orders and their unique deposit addresses
 * for cryptocurrency payments.
 * 
 * Requirements: 3.1 (Requirement 5.2 - Generate unique deposit address)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('deposit_addresses', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Foreign key to orders
    table.uuid('order_id').notNullable().unique();
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');

    // Address information
    table.string('address', 255).notNullable().unique();
    table.string('currency', 20).notNullable();
    table.string('network', 20).notNullable();
    table.string('derivation_path', 255).notNullable();

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('order_id', 'idx_deposit_addresses_order');
    table.index('address', 'idx_deposit_addresses_address');
    table.index('currency', 'idx_deposit_addresses_currency');
    table.index('network', 'idx_deposit_addresses_network');
  });

  console.log('✓ Created deposit_addresses table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('deposit_addresses');
  console.log('✓ Dropped deposit_addresses table');
}
